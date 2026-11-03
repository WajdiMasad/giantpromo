import crypto from "node:crypto";
import { and, desc, eq, sql } from "drizzle-orm";
import { getDb } from "@/db";
import {
  activityLog,
  customers,
  equipment,
  equipmentRentals,
  projectItems,
  projects,
  recurringBillingBatchItems,
  recurringBillingBatches,
  recurringBillingPlans,
} from "@/db/schema";
import { CANADIAN_TAX_RATES, calculateDocumentTotals, calculateTaxCents, type PricedLineInput } from "./tax";
import { calculateInitialRecurringChargeCents } from "./pricing";
import { assignJobNumberForProject, issueRecurringInvoice } from "./invoicing";

export async function getNextQuoteNumber(): Promise<string> {
  const db = await getDb();
  const rows = await db
    .select({ quoteNumber: projects.quoteNumber })
    .from(projects)
    .orderBy(desc(projects.id))
    .limit(50);

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

export type ProjectLineInput = PricedLineInput & {
  groupName?: string;
  /** Internal-only line (pull sheet / work order). Forced to $0 and hidden from the customer. */
  hiddenFromCustomer?: boolean;
};

/** Statuses from which a customer (or staff) may still approve or decline. */
const OPEN_FOR_DECISION = ["new", "quote_sent", "action_needed"];

/**
 * Create a Project. It starts as "New" (a draft) unless sendNow is set, in which case it is
 * marked "Quote Sent" immediately. The Q-number exists from creation; the job number (the
 * invoice number) does NOT exist until the customer signs.
 */
export async function createProjectWorkflow(params: {
  customerId: number;
  title: string;
  poReference?: string;
  siteAddress?: string;
  siteProvince: string;
  notes?: string;
  customerTerms?: string;
  validUntil?: string;
  lines: ProjectLineInput[];
  sendNow?: boolean;
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

  // Hidden (internal-only) lines never carry a price
  const pricedInput = params.lines.map((l) =>
    l.hiddenFromCustomer ? { ...l, unitPriceCents: 0 } : l
  );
  const totals = calculateDocumentTotals(pricedInput, params.siteProvince, {
    customerTaxExempt: customer.taxExempt,
  });

  const quoteNumber = await getNextQuoteNumber();
  const publicToken = `qtok-${crypto.randomBytes(12).toString("hex")}`;
  const now = new Date();

  const [created] = await db
    .insert(projects)
    .values({
      quoteNumber,
      publicToken,
      idempotencyKey: `gp-project-${crypto.randomUUID()}`,
      customerId: customer.id,
      title: params.title.trim(),
      description: (params.notes ?? "").trim(),
      poReference: (params.poReference ?? "").trim(),
      siteAddress: (params.siteAddress ?? customer.addressLine1 ?? "").trim(),
      siteProvince: totals.province,
      lat: customer.lat ?? 44.665,
      lng: customer.lng ?? -63.61,
      status: params.sendNow ? "quote_sent" : "new",
      subtotalCents: totals.subtotalCents,
      taxRatePpm: totals.taxRatePpm,
      taxLabel: totals.taxLabel,
      taxCents: totals.taxCents,
      totalCents: totals.totalCents,
      customerTerms:
        (params.customerTerms ?? "").trim() ||
        "Net 30 for approved commercial accounts. Quotes valid for 30 days.",
      validUntil:
        params.validUntil ||
        new Date(Date.now() + 30 * 86400_000).toISOString().slice(0, 10),
      sentAt: params.sendNow ? now : null,
      sentByUserId: params.sendNow ? (params.actorUserId ?? null) : null,
      createdByUserId: params.actorUserId ?? null,
    })
    .returning();

  await db.insert(projectItems).values(
    totals.lines.map((line, idx) => ({
      jobId: created!.id,
      sortOrder: idx,
      groupName: params.lines[idx]?.groupName ?? "",
      description: line.description,
      quantity: line.quantity,
      unitPriceCents: line.unitPriceCents,
      netCents: line.netCents,
      taxCents: line.taxCents,
      totalCents: line.totalCents,
      taxExempt: line.taxExempt,
      hiddenFromCustomer: Boolean(params.lines[idx]?.hiddenFromCustomer),
    }))
  );

  await db.insert(activityLog).values({
    actorUserId: params.actorUserId ?? null,
    actorName: params.actorName,
    entityType: "project",
    entityId: String(created!.id),
    action: "project.created",
    summary: `Created ${quoteNumber} for ${customer.name} (${totals.taxLabel})${params.sendNow ? " and sent it to the client" : ""}`,
  });

  return created!;
}

/** Mark a draft (or declined) project as sent to the customer. */
export async function sendQuoteToClientWorkflow(params: {
  projectId: number;
  actorUserId?: number;
  actorName: string;
}) {
  const db = await getDb();
  const [project] = await db
    .select()
    .from(projects)
    .where(eq(projects.id, params.projectId))
    .limit(1);
  if (!project) throw new Error("Project not found");
  if (!["new", "quote_sent", "action_needed"].includes(project.status)) {
    throw new Error("This project is already signed or closed, so it cannot be re-sent as a quote.");
  }
  const now = new Date();
  const [updated] = await db
    .update(projects)
    .set({
      status: "quote_sent",
      sentAt: now,
      sentByUserId: params.actorUserId ?? null,
      declineReason: null,
      updatedAt: now,
    })
    .where(eq(projects.id, project.id))
    .returning();

  await db.insert(activityLog).values({
    actorUserId: params.actorUserId ?? null,
    actorName: params.actorName,
    entityType: "project",
    entityId: String(project.id),
    action: "project.quote_sent",
    summary: `Sent ${project.quoteNumber} to the client`,
  });
  return updated!;
}

/** Record that the customer opened the public quote page (one log line per 5 minutes). */
export async function recordQuoteViewWorkflow(publicToken: string, ip?: string) {
  const db = await getDb();
  const [project] = await db
    .select()
    .from(projects)
    .where(eq(projects.publicToken, publicToken))
    .limit(1);
  if (!project) return null;

  const now = new Date();
  const lastMs = project.lastViewedAt ? new Date(project.lastViewedAt).getTime() : 0;
  const shouldLog = now.getTime() - lastMs > 5 * 60_000;
  if (!shouldLog && project.firstViewedAt) return project;

  const [updated] = await db
    .update(projects)
    .set({
      firstViewedAt: project.firstViewedAt ?? now,
      lastViewedAt: now,
      updatedAt: now,
    })
    .where(eq(projects.id, project.id))
    .returning();

  await db.insert(activityLog).values({
    actorName: "Customer",
    entityType: "project",
    entityId: String(project.id),
    action: "project.quote_viewed",
    summary: `Client viewed ${project.quoteNumber} online${ip ? ` (IP ${ip})` : ""}`,
  });
  return updated!;
}

/** Customer declines or asks for changes -> Action Needed. */
export async function declineQuoteWorkflow(params: {
  publicToken: string;
  reason: string;
  byName?: string;
}) {
  const db = await getDb();
  const [project] = await db
    .select()
    .from(projects)
    .where(eq(projects.publicToken, params.publicToken))
    .limit(1);
  if (!project) throw new Error("Quote not found");
  if (!OPEN_FOR_DECISION.includes(project.status)) {
    throw new Error("This quote has already been decided.");
  }
  const [updated] = await db
    .update(projects)
    .set({
      status: "action_needed",
      declineReason: params.reason.trim() || "Customer requested changes",
      updatedAt: new Date(),
    })
    .where(eq(projects.id, project.id))
    .returning();

  await db.insert(activityLog).values({
    actorName: params.byName?.trim() || "Customer",
    entityType: "project",
    entityId: String(project.id),
    action: "project.action_needed",
    summary: `${project.quoteNumber}: client declined / requested changes — ${updated!.declineReason}`,
  });
  return updated!;
}

/** Staff marks a quote as lost (no longer pursuing). */
export async function markProjectLostWorkflow(params: {
  projectId: number;
  reason: string;
  actorUserId?: number;
  actorName: string;
}) {
  const db = await getDb();
  const [project] = await db
    .select()
    .from(projects)
    .where(eq(projects.id, params.projectId))
    .limit(1);
  if (!project) throw new Error("Project not found");
  if (!OPEN_FOR_DECISION.includes(project.status)) {
    throw new Error("Only an unsigned quote can be marked Lost. Cancel a signed job instead.");
  }
  const [updated] = await db
    .update(projects)
    .set({
      status: "lost",
      declineReason: params.reason.trim() || "Marked lost",
      updatedAt: new Date(),
    })
    .where(eq(projects.id, project.id))
    .returning();

  await db.insert(activityLog).values({
    actorUserId: params.actorUserId ?? null,
    actorName: params.actorName,
    entityType: "project",
    entityId: String(project.id),
    action: "project.lost",
    summary: `${project.quoteNumber} marked Lost — ${updated!.declineReason}`,
  });
  return updated!;
}

/**
 * Customer or staff signs the project -> it becomes a scheduled job and immediately gets its
 * invoice number (§2a). Same record, no copy. Idempotent.
 */
export async function approveProjectWorkflow(params: {
  projectIdOrToken: { projectId?: number; publicToken?: string };
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
  const whereClause = params.projectIdOrToken.projectId
    ? eq(projects.id, params.projectIdOrToken.projectId)
    : eq(projects.publicToken, params.projectIdOrToken.publicToken ?? "");

  const [project] = await db.select().from(projects).where(whereClause).limit(1);
  if (!project) throw new Error("Quote not found");

  // Idempotent: already signed -> return the same project (and its same invoice number)
  if (project.approvedAt) {
    return { project };
  }
  if (!OPEN_FOR_DECISION.includes(project.status)) {
    throw new Error("This quote can no longer be approved (it is closed or lost).");
  }

  const now = new Date();
  const defaultSchedule =
    params.scheduledDate ||
    new Date(Date.now() + 2 * 86400_000).toISOString().slice(0, 10);

  await db
    .update(projects)
    .set({
      status: "scheduled",
      firstViewedAt: project.firstViewedAt ?? now,
      approvedAt: now,
      approvedByName: signer,
      approvedByEmail: params.approvedByEmail?.trim() ?? null,
      approvedIp: params.approvedIp ?? null,
      scheduledDate: project.scheduledDate ?? defaultSchedule,
      paymentStatus: "unpaid",
      declineReason: null,
      updatedAt: now,
    })
    .where(eq(projects.id, project.id));

  // Reserve the next invoice number (232016+) right now. It becomes the job number everywhere.
  await assignJobNumberForProject(project.id);

  const [finalProject] = await db
    .select()
    .from(projects)
    .where(eq(projects.id, project.id))
    .limit(1);

  await db.insert(activityLog).values({
    actorName: signer,
    entityType: "project",
    entityId: String(project.id),
    action: "project.signed",
    summary: `${project.quoteNumber} signed by ${signer} -> Job #${finalProject?.jobNumber}`,
  });

  return { project: finalProject! };
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
 * - Dry run: a preview only. No invoice numbers are used.
 * - Live: creates one real invoice per non-skipped line, numbered from the app's own sequence,
 *   issued on the batch date (the 1st). The accountant then picks them up at the next capture.
 */
export async function approveAndSendRecurringBatchWorkflow(params: {
  batchId: number;
  scheduleForFirst?: boolean;
  actorUserId?: number;
  actorName: string;
}) {
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
    .innerJoin(recurringBillingPlans, eq(recurringBillingBatchItems.planId, recurringBillingPlans.id))
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
    if (item.skipThisMonth || item.invoiceNumber) continue;

    if (batch.isDryRun) {
      await db
        .update(recurringBillingBatchItems)
        .set({ invoiceNumber: `DRY-${batch.monthKey}-${item.planId}` })
        .where(eq(recurringBillingBatchItems.id, item.id));
      processedCount++;
      continue;
    }

    const province = plan.province || customer.province || "NS";
    await issueRecurringInvoice({
      planCustomerId: customer.id,
      batchItemId: item.id,
      reference: plan.poReference ?? "",
      description: item.description,
      netCents: item.netCents,
      taxCents: item.taxCents,
      taxLabel: CANADIAN_TAX_RATES[province as keyof typeof CANADIAN_TAX_RATES]?.label ?? "HST",
      issueDate: batch.invoiceDate,
      customerTerms: customer.paymentTerms,
    });
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
      ? `Previewed ${batch.monthKey} recurring batch (${processedCount} items)`
      : `Approved & issued ${batch.monthKey} recurring batch (${processedCount} invoices created)`,
  });

  return { status: finalStatus, processedCount };
}
