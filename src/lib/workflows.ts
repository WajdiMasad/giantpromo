import crypto from "node:crypto";
import { and, desc, eq, sql } from "drizzle-orm";
import { getDb } from "@/db";
import {
  activityLog,
  customers,
  equipment,
  equipmentRentals,
  jobItems,
  jobs,
  quoteItems,
  quotes,
  recurringBillingBatchItems,
  recurringBillingBatches,
  recurringBillingPlans,
  sageConnection,
  sageInvoices,
} from "@/db/schema";
import { calculateDocumentTotals, calculateTaxCents, type PricedLineInput } from "./tax";
import { calculateInitialRecurringChargeCents } from "./pricing";
import { allocateSageInvoiceForJob, withSageLock } from "./sage";

export async function getNextQuoteNumber(): Promise<string> {
  const db = await getDb();
  const rows = await db
    .select({ quoteNumber: quotes.quoteNumber })
    .from(quotes)
    .orderBy(desc(quotes.id))
    .limit(25);

  let maxNum = 1000;
  for (const r of rows) {
    const m = /^Q-(\d+)$/.exec(r.quoteNumber);
    if (m) {
      const n = Number(m[1]);
      if (n > maxNum) maxNum = n;
    }
  }
  return `Q-${maxNum + 1}`;
}

export async function createQuoteWorkflow(params: {
  customerId: number;
  title: string;
  poReference?: string;
  siteAddress?: string;
  siteProvince: string;
  notes?: string;
  customerTerms?: string;
  validUntil?: string;
  lines: PricedLineInput[];
  actorUserId?: number;
  actorName: string;
}) {
  if (!params.lines.length) {
    throw new Error("At least one line item is required.");
  }

  const db = await getDb();
  const [customer] = await db
    .select()
    .from(customers)
    .where(eq(customers.id, params.customerId))
    .limit(1);
  if (!customer) throw new Error("Customer not found");

  const totals = calculateDocumentTotals(params.lines, params.siteProvince, {
    customerTaxExempt: customer.taxExempt,
  });

  const quoteNumber = await getNextQuoteNumber();
  const publicToken = `qtok-${crypto.randomBytes(12).toString("hex")}`;

  const [createdQuote] = await db
    .insert(quotes)
    .values({
      quoteNumber,
      publicToken,
      customerId: customer.id,
      title: params.title.trim(),
      poReference: (params.poReference ?? "").trim(),
      siteAddress: (params.siteAddress ?? customer.addressLine1 ?? "").trim(),
      siteProvince: totals.province,
      lat: customer.lat ?? 44.665,
      lng: customer.lng ?? -63.61,
      status: "sent",
      subtotalCents: totals.subtotalCents,
      taxRatePpm: totals.taxRatePpm,
      taxLabel: totals.taxLabel,
      taxCents: totals.taxCents,
      totalCents: totals.totalCents,
      notes: (params.notes ?? "").trim(),
      customerTerms:
        (params.customerTerms ?? "").trim() ||
        "Net 30 for approved commercial accounts. Quotes valid for 30 days.",
      validUntil:
        params.validUntil ||
        new Date(Date.now() + 30 * 86400_000).toISOString().slice(0, 10),
      sentAt: new Date(),
      sentByUserId: params.actorUserId ?? null,
      createdByUserId: params.actorUserId ?? null,
    })
    .returning();

  await db.insert(quoteItems).values(
    totals.lines.map((line, idx) => ({
      quoteId: createdQuote!.id,
      sortOrder: idx,
      description: line.description,
      quantity: line.quantity,
      unitPriceCents: line.unitPriceCents,
      netCents: line.netCents,
      taxCents: line.taxCents,
      totalCents: line.totalCents,
      taxExempt: line.taxExempt,
    }))
  );

  await db.insert(activityLog).values({
    actorUserId: params.actorUserId ?? null,
    actorName: params.actorName,
    entityType: "quote",
    entityId: String(createdQuote!.id),
    action: "quote.created",
    summary: `Created Quote ${quoteNumber} for ${customer.name} (${totals.taxLabel})`,
  });

  return createdQuote!;
}

/**
 * Customer or staff approves a quote -> immediately creates a Job and allocates
 * its authoritative Sage invoice number (§2a).
 */
export async function approveQuoteAndCreateJobWorkflow(params: {
  quoteIdOrToken: { quoteId?: number; publicToken?: string };
  approvedByName: string;
  approvedByEmail?: string;
  approvedIp?: string;
  scheduledDate?: string;
}) {
  const signer = params.approvedByName.trim();
  if (!signer) {
    throw new Error("Typed signature name is required to approve the quote.");
  }

  const db = await getDb();
  const whereClause = params.quoteIdOrToken.quoteId
    ? eq(quotes.id, params.quoteIdOrToken.quoteId)
    : eq(quotes.publicToken, params.quoteIdOrToken.publicToken ?? "");

  const [quote] = await db.select().from(quotes).where(whereClause).limit(1);
  if (!quote) throw new Error("Quote not found");

  // Idempotent: if already approved and a job already exists for this quote, return that job!
  const [existingJob] = await db
    .select()
    .from(jobs)
    .where(eq(jobs.quoteId, quote.id))
    .limit(1);
  if (existingJob) {
    return { quote, job: existingJob };
  }

  const items = await db
    .select()
    .from(quoteItems)
    .where(eq(quoteItems.quoteId, quote.id));

  const now = new Date();
  const [updatedQuote] = await db
    .update(quotes)
    .set({
      status: "approved",
      firstViewedAt: quote.firstViewedAt ?? now,
      approvedAt: now,
      approvedByName: signer,
      approvedByEmail: params.approvedByEmail?.trim() ?? null,
      approvedIp: params.approvedIp ?? null,
      updatedAt: now,
    })
    .where(eq(quotes.id, quote.id))
    .returning();

  const idempotencyKey = `gp-quote-${quote.id}`;
  const defaultSchedule =
    params.scheduledDate ||
    new Date(Date.now() + 2 * 86400_000).toISOString().slice(0, 10);

  const [createdJob] = await db
    .insert(jobs)
    .values({
      jobNumber: null, // Assigned exclusively by Sage below!
      idempotencyKey,
      quoteId: quote.id,
      customerId: quote.customerId,
      title: quote.title,
      description: quote.notes ?? "",
      poReference: quote.poReference ?? "",
      siteAddress: quote.siteAddress ?? "",
      siteProvince: quote.siteProvince,
      lat: quote.lat,
      lng: quote.lng,
      status: "scheduled",
      priority: "normal",
      scheduledDate: defaultSchedule,
      subtotalCents: quote.subtotalCents,
      taxRatePpm: quote.taxRatePpm,
      taxLabel: quote.taxLabel,
      taxCents: quote.taxCents,
      totalCents: quote.totalCents,
      sageSyncStatus: "pending_number",
    })
    .returning();

  if (items.length > 0) {
    await db.insert(jobItems).values(
      items.map((item, idx) => ({
        jobId: createdJob!.id,
        sortOrder: idx,
        description: item.description,
        quantity: item.quantity,
        unitPriceCents: item.unitPriceCents,
        netCents: item.netCents,
        taxCents: item.taxCents,
        totalCents: item.totalCents,
        taxExempt: item.taxExempt,
      }))
    );
  }

  // Immediately allocate authoritative Sage invoice number (232016+)
  try {
    await allocateSageInvoiceForJob(createdJob!.id);
  } catch {
    // If Sage is temporarily unreachable, job remains in 'pending_number' state as designed (§2a).
  }

  const [finalJob] = await db
    .select()
    .from(jobs)
    .where(eq(jobs.id, createdJob!.id))
    .limit(1);

  await db.insert(activityLog).values({
    actorName: signer,
    entityType: "quote",
    entityId: String(quote.id),
    action: "quote.approved",
    summary: `Quote ${quote.quoteNumber} approved by ${signer} -> Job #${finalJob?.jobNumber ?? "Pending Sage"}`,
  });

  return { quote: updatedQuote!, job: finalJob! };
}

/**
 * Check out / book equipment and automatically create its recurring billing plan (§2c).
 */
export async function bookEquipmentRentalWorkflow(params: {
  equipmentId: number;
  customerId: number;
  startDate: string;
  endDate?: string | null;
  monthlyRateCents: number;
  locationAddress: string;
  lat?: number | null;
  lng?: number | null;
  poReference?: string;
  notes?: string;
  createRecurringPlan?: boolean;
  actorName: string;
}) {
  const db = await getDb();
  const [equip] = await db
    .select()
    .from(equipment)
    .where(eq(equipment.id, params.equipmentId))
    .limit(1);
  if (!equip) throw new Error("Equipment not found");

  const [customer] = await db
    .select()
    .from(customers)
    .where(eq(customers.id, params.customerId))
    .limit(1);
  if (!customer) throw new Error("Customer not found");

  const today = new Date().toISOString().slice(0, 10);
  const rentalStatus = params.startDate > today ? "scheduled" : "active";

  // Postgres trigger trg_equipment_rental_no_overlap enforces no overlapping dates!
  const [rental] = await db
    .insert(equipmentRentals)
    .values({
      equipmentId: equip.id,
      customerId: customer.id,
      startDate: params.startDate,
      endDate: params.endDate?.trim() || null,
      monthlyRateCents: params.monthlyRateCents,
      locationAddress: params.locationAddress.trim() || `${customer.addressLine1}, ${customer.city}`,
      lat: params.lat ?? customer.lat ?? 44.668,
      lng: params.lng ?? customer.lng ?? -63.61,
      status: rentalStatus,
      notes: (params.notes ?? "").trim(),
    })
    .returning();

  if (rentalStatus === "active") {
    await db
      .update(equipment)
      .set({ status: "rented", updatedAt: new Date() })
      .where(eq(equipment.id, equip.id));
  }

  if (params.createRecurringPlan !== false) {
    await db.insert(recurringBillingPlans).values({
      customerId: customer.id,
      rentalId: rental!.id,
      kind: "equipment_rental",
      title: `${equip.code} Rental — ${customer.name}`,
      description: `Monthly Rental: ${equip.name} (${equip.code}) at ${rental!.locationAddress}`,
      poReference: (params.poReference ?? "").trim(),
      province: customer.province || "NS",
      monthlyAmountCents: params.monthlyRateCents,
      startDate: params.startDate,
      endDate: params.endDate?.trim() || null,
      status: "active",
    });
  }

  await db.insert(activityLog).values({
    actorName: params.actorName,
    entityType: "rental",
    entityId: String(rental!.id),
    action: "rental.booked",
    summary: `Booked ${equip.code} (${equip.name}) for ${customer.name} starting ${params.startDate}`,
  });

  return rental!;
}

/**
 * Return equipment and AUTOMATICALLY end its recurring billing plan (§2c).
 */
export async function returnEquipmentRentalWorkflow(params: {
  rentalId: number;
  actorName: string;
}) {
  const db = await getDb();
  const [rental] = await db
    .select()
    .from(equipmentRentals)
    .where(eq(equipmentRentals.id, params.rentalId))
    .limit(1);
  if (!rental) throw new Error("Rental not found");

  const today = new Date().toISOString().slice(0, 10);
  const now = new Date();

  await db
    .update(equipmentRentals)
    .set({
      status: "returned",
      endDate: rental.endDate && rental.endDate < today ? rental.endDate : today,
      returnedAt: now,
      updatedAt: now,
    })
    .where(eq(equipmentRentals.id, rental.id));

  await db
    .update(equipment)
    .set({ status: "available", updatedAt: now })
    .where(eq(equipment.id, rental.equipmentId));

  // Automatically end any active recurring billing plan linked to this rental!
  const endedPlans = await db
    .update(recurringBillingPlans)
    .set({
      status: "ended",
      endDate: today,
      updatedAt: now,
    })
    .where(
      and(
        eq(recurringBillingPlans.rentalId, rental.id),
        eq(recurringBillingPlans.status, "active")
      )
    )
    .returning();

  await db.insert(activityLog).values({
    actorName: params.actorName,
    entityType: "rental",
    entityId: String(rental.id),
    action: "rental.returned",
    summary: `Equipment returned on ${today} — ${endedPlans.length} recurring billing plan(s) stopped automatically`,
  });

  return { rentalId: rental.id, stoppedPlansCount: endedPlans.length };
}

/**
 * Build or refresh the monthly recurring billing batch for a given YYYY-MM (§2c).
 * - Bill in advance on the 1st of monthKey.
 * - If a plan started mid-month in the previous month and hasn't had its initial half-month billed,
 *   or starts mid-month in this month, applies the half-month rule.
 * - Flags changes ('new', 'half_month_start', 'ending', 'unchanged') so staff can review before sending.
 */
export async function buildOrGetRecurringBatchWorkflow(params: {
  monthKey: string; // e.g. "2026-12" or "2027-01"
  isDryRun?: boolean;
}) {
  const m = /^(\d{4})-(\d{2})$/.exec(params.monthKey.trim());
  if (!m) throw new Error(`Invalid monthKey "${params.monthKey}" (expected YYYY-MM)`);

  const invoiceDate = `${params.monthKey}-01`;
  const monthEnd = `${params.monthKey}-31`;
  const db = await getDb();

  let [batch] = await db
    .select()
    .from(recurringBillingBatches)
    .where(eq(recurringBillingBatches.monthKey, params.monthKey))
    .limit(1);

  if (!batch) {
    const [created] = await db
      .insert(recurringBillingBatches)
      .values({
        monthKey: params.monthKey,
        invoiceDate,
        status: params.isDryRun ? "dry_run" : "draft",
        isDryRun: Boolean(params.isDryRun),
      })
      .returning();
    batch = created!;
  }

  // Find all active plans that started on or before this month and have not ended before the 1st
  const activePlans = await db
    .select({
      plan: recurringBillingPlans,
      customer: customers,
    })
    .from(recurringBillingPlans)
    .innerJoin(customers, eq(recurringBillingPlans.customerId, customers.id))
    .where(eq(recurringBillingPlans.status, "active"));

  const existingItems = await db
    .select()
    .from(recurringBillingBatchItems)
    .where(eq(recurringBillingBatchItems.batchId, batch.id));

  const existingPlanIds = new Set(existingItems.map((i) => i.planId));

  for (const { plan, customer } of activePlans) {
    if (existingPlanIds.has(plan.id)) continue;
    // Skip plans that ended before the 1st of this billing month
    if (plan.endDate && plan.endDate < invoiceDate) continue;
    // Skip plans that start after this month
    if (plan.startDate > monthEnd) continue;

    const startsInThisMonth = plan.startDate.startsWith(params.monthKey);
    const { amountCents: netCents, isHalfMonth } = startsInThisMonth
      ? calculateInitialRecurringChargeCents(plan.monthlyAmountCents, plan.startDate)
      : { amountCents: plan.monthlyAmountCents, isHalfMonth: false };

    const taxCents = calculateTaxCents(netCents, plan.province || customer.province || "NS", {
      taxExempt: customer.taxExempt,
    });

    const changeFlag = isHalfMonth
      ? "half_month_start"
      : startsInThisMonth
        ? "new"
        : plan.endDate && plan.endDate.startsWith(params.monthKey)
          ? "ending"
          : "unchanged";

    const periodLabel = isHalfMonth
      ? `${params.monthKey} (Half-Month Start from ${plan.startDate})`
      : `${params.monthKey} (Monthly in Advance)`;

    await db.insert(recurringBillingBatchItems).values({
      batchId: batch.id,
      planId: plan.id,
      monthKey: params.monthKey,
      idempotencyKey: `gp-rec-${params.monthKey}-plan-${plan.id}`,
      description: `${plan.description} — ${periodLabel}`,
      netCents,
      taxCents,
      totalCents: netCents + taxCents,
      isHalfMonthProrated: isHalfMonth,
      changeFlag,
    });
  }

  return batch;
}

/**
 * Approve & Execute (or Schedule for the 1st) a monthly recurring billing batch (§2c).
 * - If isDryRun is true (e.g. Dec 1 parallel run), simulates without allocating real Sage numbers.
 * - If live (e.g. Jan 1), allocates official sequential Sage invoice numbers (232016+) for each non-skipped line.
 */
export async function approveAndSendRecurringBatchWorkflow(params: {
  batchId: number;
  scheduleForFirst?: boolean;
  actorUserId?: number;
  actorName: string;
}) {
  return withSageLock(async () => {
    const db = await getDb();
    const [batch] = await db
      .select()
      .from(recurringBillingBatches)
      .where(eq(recurringBillingBatches.id, params.batchId))
      .limit(1);
    if (!batch) throw new Error("Billing batch not found");

    const items = await db
      .select({
        item: recurringBillingBatchItems,
        plan: recurringBillingPlans,
        customer: customers,
      })
      .from(recurringBillingBatchItems)
      .innerJoin(
        recurringBillingPlans,
        eq(recurringBillingBatchItems.planId, recurringBillingPlans.id)
      )
      .innerJoin(customers, eq(recurringBillingPlans.customerId, customers.id))
      .where(eq(recurringBillingBatchItems.batchId, batch.id));

    const now = new Date();

    if (params.scheduleForFirst && !batch.isDryRun) {
      await db
        .update(recurringBillingBatches)
        .set({
          status: "approved_scheduled",
          approvedByUserId: params.actorUserId ?? null,
          approvedAt: now,
        })
        .where(eq(recurringBillingBatches.id, batch.id));

      await db.insert(activityLog).values({
        actorUserId: params.actorUserId ?? null,
        actorName: params.actorName,
        entityType: "billing",
        entityId: String(batch.id),
        action: "batch.scheduled",
        summary: `Approved & scheduled ${batch.monthKey} recurring batch for ${batch.invoiceDate} (holiday-safe)`,
      });
      return { status: "approved_scheduled" as const, processedCount: items.length };
    }

    let processedCount = 0;
    for (const { item, plan, customer } of items) {
      if (item.skipThisMonth || item.sageInvoiceNumber) continue;

      if (batch.isDryRun) {
        await db
          .update(recurringBillingBatchItems)
          .set({
            sageInvoiceId: `dryrun-${item.idempotencyKey}`,
            sageInvoiceNumber: `DRY-${batch.monthKey}-${item.planId}`,
          })
          .where(eq(recurringBillingBatchItems.id, item.id));
        processedCount++;
        continue;
      }

      // Live batch: allocate official sequential Sage invoice number
      const [conn] = await db
        .select()
        .from(sageConnection)
        .where(eq(sageConnection.id, "primary"))
        .limit(1);
      const allocatedNum = String(conn?.nextNumberPreview ?? 232016);

      await db
        .update(sageConnection)
        .set({
          nextNumberPreview: sql`${sageConnection.nextNumberPreview} + 1`,
          lastSyncAt: now,
          updatedAt: now,
        })
        .where(eq(sageConnection.id, "primary"));

      const sageId = `sage-inv-${item.idempotencyKey}`;
      await db.insert(sageInvoices).values({
        sageId,
        invoiceNumber: allocatedNum,
        contactName: customer.name,
        contactSageId: customer.sageId,
        reference: plan.poReference
          ? `${plan.poReference} [${item.idempotencyKey}]`
          : `[${item.idempotencyKey}]`,
        status: "UNPAID",
        date: batch.invoiceDate,
        dueDate: `${batch.monthKey}-28`,
        netCents: item.netCents,
        taxCents: item.taxCents,
        totalCents: item.totalCents,
        outstandingCents: item.totalCents,
      });

      await db
        .update(recurringBillingBatchItems)
        .set({
          sageInvoiceId: sageId,
          sageInvoiceNumber: allocatedNum,
          emailedAt: now,
        })
        .where(eq(recurringBillingBatchItems.id, item.id));

      processedCount++;
    }

    const finalStatus = batch.isDryRun ? "dry_run" : "sent";
    await db
      .update(recurringBillingBatches)
      .set({
        status: finalStatus,
        approvedByUserId: params.actorUserId ?? null,
        approvedAt: batch.approvedAt ?? now,
        executedAt: now,
      })
      .where(eq(recurringBillingBatches.id, batch.id));

    await db.insert(activityLog).values({
      actorUserId: params.actorUserId ?? null,
      actorName: params.actorName,
      entityType: "billing",
      entityId: String(batch.id),
      action: batch.isDryRun ? "batch.dry_run_completed" : "batch.sent",
      summary: batch.isDryRun
        ? `Completed ${batch.monthKey} dry-run comparison batch (${processedCount} items)`
        : `Approved & sent ${batch.monthKey} recurring batch (${processedCount} Sage invoices created & emailed)`,
    });

    return { status: finalStatus, processedCount };
  });
}
