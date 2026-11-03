import { and, eq, inArray, isNotNull, isNull, lte, or, sql } from "drizzle-orm";
import { getDb } from "@/db";
import {
  accountingBatches,
  activityLog,
  appSettings,
  customers,
  invoices,
  payments,
  projects,
  recurringBillingBatchItems,
  type PaymentMethod,
} from "@/db/schema";

const FIRST_INVOICE_NUMBER = 232016;

const todayISO = () => new Date().toISOString().slice(0, 10);

function addDaysISO(dateISO: string, days: number): string {
  const d = new Date(`${dateISO}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** "Net 30" -> 30, "Net 15" -> 15, "Due on receipt" -> 0, anything else -> 30. */
export function paymentTermsDays(terms: string | null | undefined): number {
  const t = (terms ?? "").toLowerCase();
  if (t.includes("receipt")) return 0;
  const m = /(\d{1,3})/.exec(t);
  return m ? Number(m[1]) : 30;
}

export async function ensureAppSettings() {
  const db = await getDb();
  await db
    .insert(appSettings)
    .values({ id: "primary", nextInvoiceNumber: FIRST_INVOICE_NUMBER })
    .onConflictDoNothing();
}

export async function getNextInvoiceNumberPreview(): Promise<number> {
  const db = await getDb();
  await ensureAppSettings();
  const [row] = await db.select().from(appSettings).where(eq(appSettings.id, "primary")).limit(1);
  return row?.nextInvoiceNumber ?? FIRST_INVOICE_NUMBER;
}

/**
 * The app owns invoice numbering. One atomic increment, so two people (or two
 * clicks) can never receive the same number, and numbers never skip.
 */
export async function allocateInvoiceNumber(): Promise<string> {
  const db = await getDb();
  await ensureAppSettings();
  const [row] = await db
    .update(appSettings)
    .set({
      nextInvoiceNumber: sql`${appSettings.nextInvoiceNumber} + 1`,
      updatedAt: new Date(),
    })
    .where(eq(appSettings.id, "primary"))
    .returning({ next: appSettings.nextInvoiceNumber });
  return String((row?.next ?? FIRST_INVOICE_NUMBER + 1) - 1);
}

/**
 * Called the moment a project is signed: reserve the next invoice number, make it the
 * job number everywhere, and create the invoice as a DRAFT (not billed until staff send it).
 * Idempotent: a project that already has an invoice returns the same one.
 */
export async function assignJobNumberForProject(projectId: number) {
  const db = await getDb();
  const [project] = await db.select().from(projects).where(eq(projects.id, projectId)).limit(1);
  if (!project) throw new Error(`Project #${projectId} not found`);

  if (project.invoiceId && project.jobNumber) {
    const [existing] = await db.select().from(invoices).where(eq(invoices.id, project.invoiceId)).limit(1);
    if (existing) return { project, invoice: existing };
  }

  const number = await allocateInvoiceNumber();
  const [invoice] = await db
    .insert(invoices)
    .values({
      invoiceNumber: number,
      kind: "job",
      projectId: project.id,
      customerId: project.customerId,
      reference: project.poReference ?? "",
      description: project.title,
      status: "draft",
      subtotalCents: project.subtotalCents,
      taxLabel: project.taxLabel,
      taxCents: project.taxCents,
      totalCents: project.totalCents,
    })
    .returning();

  const [updated] = await db
    .update(projects)
    .set({
      jobNumber: number,
      invoiceId: invoice!.id,
      paymentStatus: "unpaid",
      driveFolderId: `drive-folder-${number}`,
      driveFolderUrl: `https://drive.google.com/drive/folders/Invoice-${number}`,
      updatedAt: new Date(),
    })
    .where(eq(projects.id, project.id))
    .returning();

  await db.insert(activityLog).values({
    actorName: "Invoicing",
    entityType: "project",
    entityId: String(project.id),
    action: "invoice.number_assigned",
    summary: `Invoice / Job #${number} reserved for ${project.quoteNumber} (not billed until sent)`,
  });

  return { project: updated!, invoice: invoice! };
}

/**
 * Staff click "Send invoice" (§2b). This is the moment the invoice is officially billed:
 * it becomes ISSUED with today's date and a due date from the customer's terms.
 * Sending again just records the re-send; the issue date never changes.
 */
export async function sendJobInvoiceToCustomer(params: {
  jobId: number;
  recipientEmail: string;
  actorUserId?: number;
  actorName: string;
}) {
  const db = await getDb();
  const [project] = await db.select().from(projects).where(eq(projects.id, params.jobId)).limit(1);
  if (!project) throw new Error("Project not found");
  if (!project.invoiceId) throw new Error("This project has no invoice yet (it is not signed).");
  const [invoice] = await db.select().from(invoices).where(eq(invoices.id, project.invoiceId)).limit(1);
  if (!invoice) throw new Error("Invoice not found");
  if (invoice.status === "void") throw new Error("This invoice has been voided and cannot be sent.");

  const email = params.recipientEmail.trim();
  if (!email || !email.includes("@")) throw new Error("A valid recipient email address is required.");

  const [customer] = await db.select().from(customers).where(eq(customers.id, project.customerId)).limit(1);
  const now = new Date();
  const issueDate = invoice.issueDate ?? todayISO();
  const dueDate = invoice.dueDate ?? addDaysISO(issueDate, paymentTermsDays(customer?.paymentTerms));

  await db
    .update(invoices)
    .set({
      status: "issued",
      issueDate,
      dueDate,
      sentAt: now,
      sentToEmail: email,
      sentByUserId: params.actorUserId ?? null,
      updatedAt: now,
    })
    .where(eq(invoices.id, invoice.id));

  const nextStatus =
    project.status === "installed" || project.status === "approved" || project.status === "scheduled"
      ? "invoiced"
      : project.status;

  await db
    .update(projects)
    .set({
      status: nextStatus,
      invoiceSentAt: now,
      invoiceSentByUserId: params.actorUserId ?? null,
      invoiceSentToEmail: email,
      updatedAt: now,
    })
    .where(eq(projects.id, project.id));

  await db.insert(activityLog).values({
    actorUserId: params.actorUserId ?? null,
    actorName: params.actorName,
    entityType: "project",
    entityId: String(project.id),
    action: "invoice.sent",
    summary: `Invoice #${invoice.invoiceNumber} sent to ${email} (due ${dueDate})`,
  });

  return { sentAt: now, invoiceNumber: invoice.invoiceNumber, email, issueDate, dueDate };
}

async function refreshProjectPayment(invoiceId: number) {
  const db = await getDb();
  const [invoice] = await db.select().from(invoices).where(eq(invoices.id, invoiceId)).limit(1);
  if (!invoice || !invoice.projectId) return;
  const rows = await db.select().from(payments).where(eq(payments.invoiceId, invoiceId));
  const paid = rows.reduce((a, p) => a + p.amountCents, 0);
  const status =
    invoice.status === "void" ? "void" : paid >= invoice.totalCents ? "paid" : paid > 0 ? "part_paid" : "unpaid";

  const [project] = await db.select().from(projects).where(eq(projects.id, invoice.projectId)).limit(1);
  if (!project) return;
  await db
    .update(projects)
    .set({
      paymentStatus: status,
      status: status === "paid" && project.status !== "cancelled" ? "paid" : project.status,
      updatedAt: new Date(),
    })
    .where(eq(projects.id, project.id));
}

/** Record money received against an issued invoice. */
export async function recordInvoicePayment(params: {
  invoiceId: number;
  amountCents: number;
  receivedOn?: string;
  method: PaymentMethod;
  reference?: string;
  notes?: string;
  actorUserId?: number;
  actorName: string;
}) {
  if (!Number.isInteger(params.amountCents) || params.amountCents <= 0) {
    throw new Error("Payment amount must be greater than zero.");
  }
  const db = await getDb();
  const [invoice] = await db.select().from(invoices).where(eq(invoices.id, params.invoiceId)).limit(1);
  if (!invoice) throw new Error("Invoice not found");
  if (invoice.status === "void") throw new Error("This invoice is void.");
  if (invoice.status === "draft") {
    throw new Error("Send the invoice first. Payments can only be recorded against an issued invoice.");
  }

  const existing = await db.select().from(payments).where(eq(payments.invoiceId, invoice.id));
  const alreadyPaid = existing.reduce((a, p) => a + p.amountCents, 0);
  if (alreadyPaid + params.amountCents > invoice.totalCents) {
    throw new Error("That payment is more than the amount still owing on this invoice.");
  }

  const [payment] = await db
    .insert(payments)
    .values({
      invoiceId: invoice.id,
      receivedOn: params.receivedOn || todayISO(),
      amountCents: params.amountCents,
      method: params.method,
      reference: (params.reference ?? "").trim(),
      notes: (params.notes ?? "").trim(),
      recordedByUserId: params.actorUserId ?? null,
      recordedByName: params.actorName,
    })
    .returning();

  await refreshProjectPayment(invoice.id);

  await db.insert(activityLog).values({
    actorUserId: params.actorUserId ?? null,
    actorName: params.actorName,
    entityType: invoice.projectId ? "project" : "billing",
    entityId: String(invoice.projectId ?? invoice.id),
    action: "payment.recorded",
    summary: `Payment of $${(params.amountCents / 100).toFixed(2)} (${params.method}) recorded on invoice #${invoice.invoiceNumber}`,
  });

  return payment!;
}

/**
 * Cancel a job and void its invoice. The number stays on record as VOID (no gaps), and the
 * accountant sees the void in the next capture.
 */
export async function voidJobInvoice(projectId: number, reason: string, actorName: string) {
  const clean = reason.trim();
  if (!clean) throw new Error("A void reason is required.");

  const db = await getDb();
  const [project] = await db.select().from(projects).where(eq(projects.id, projectId)).limit(1);
  if (!project) throw new Error("Project not found");

  if (project.invoiceId) {
    const [invoice] = await db.select().from(invoices).where(eq(invoices.id, project.invoiceId)).limit(1);
    if (invoice) {
      const paid = (await db.select().from(payments).where(eq(payments.invoiceId, invoice.id))).reduce(
        (a, p) => a + p.amountCents,
        0
      );
      if (paid > 0) {
        throw new Error("Payments are recorded on this invoice, so it cannot be voided. Ask the accountant to issue a credit note.");
      }
      const now = new Date();
      await db
        .update(invoices)
        .set({ status: "void", voidedAt: now, voidReason: clean, updatedAt: now })
        .where(eq(invoices.id, invoice.id));
    }
  }

  await db
    .update(projects)
    .set({ status: "cancelled", paymentStatus: "void", voidReason: clean, updatedAt: new Date() })
    .where(eq(projects.id, projectId));

  await db.insert(activityLog).values({
    actorName,
    entityType: "project",
    entityId: String(projectId),
    action: "invoice.voided",
    summary: `Job #${project.jobNumber ?? project.quoteNumber} cancelled and invoice VOIDED (${clean})`,
  });
}

/** Create the real invoices for a live recurring batch (called when staff approve & send). */
export async function issueRecurringInvoice(params: {
  planCustomerId: number;
  batchItemId: number;
  reference: string;
  description: string;
  netCents: number;
  taxCents: number;
  taxLabel: string;
  issueDate: string;
  customerTerms: string | null;
}) {
  const db = await getDb();
  const number = await allocateInvoiceNumber();
  const now = new Date();
  const [invoice] = await db
    .insert(invoices)
    .values({
      invoiceNumber: number,
      kind: "recurring",
      customerId: params.planCustomerId,
      reference: params.reference,
      description: params.description,
      status: "issued",
      issueDate: params.issueDate,
      dueDate: addDaysISO(params.issueDate, paymentTermsDays(params.customerTerms)),
      subtotalCents: params.netCents,
      taxLabel: params.taxLabel,
      taxCents: params.taxCents,
      totalCents: params.netCents + params.taxCents,
      sentAt: now,
    })
    .returning();

  await db
    .update(recurringBillingBatchItems)
    .set({ invoiceId: invoice!.id, invoiceNumber: number, emailedAt: now })
    .where(eq(recurringBillingBatchItems.id, params.batchItemId));

  return invoice!;
}

// ---------------------------------------------------------------------------
// Accountant capture (weekly batch entry into Sage Accounting)
// ---------------------------------------------------------------------------

export type PendingCapture = {
  throughDate: string;
  invoices: (typeof invoices.$inferSelect & { customerName: string })[];
  voids: (typeof invoices.$inferSelect & { customerName: string })[];
  payments: (typeof payments.$inferSelect & {
    invoiceNumber: string;
    customerName: string;
    taxPortionCents: number;
  })[];
  totals: {
    invoiceCount: number;
    voidCount: number;
    paymentCount: number;
    salesNetCents: number;
    hstCents: number;
    salesTotalCents: number;
    paymentsCents: number;
    hstInPaymentsCents: number;
  };
};

/** HST contained in a payment, in proportion to the invoice it pays. */
export function taxPortionOfPayment(paymentCents: number, invoiceTaxCents: number, invoiceTotalCents: number) {
  if (invoiceTotalCents <= 0) return 0;
  return Math.round((paymentCents * invoiceTaxCents) / invoiceTotalCents);
}

function summarize(
  inv: PendingCapture["invoices"],
  vds: PendingCapture["voids"],
  pays: PendingCapture["payments"],
  throughDate: string
): PendingCapture {
  return {
    throughDate,
    invoices: inv,
    voids: vds,
    payments: pays,
    totals: {
      invoiceCount: inv.length,
      voidCount: vds.length,
      paymentCount: pays.length,
      salesNetCents: inv.reduce((a, i) => a + i.subtotalCents, 0),
      hstCents: inv.reduce((a, i) => a + i.taxCents, 0),
      salesTotalCents: inv.reduce((a, i) => a + i.totalCents, 0),
      paymentsCents: pays.reduce((a, p) => a + p.amountCents, 0),
      hstInPaymentsCents: pays.reduce((a, p) => a + p.taxPortionCents, 0),
    },
  };
}

/** Everything issued, voided or paid up to (and including) throughDate that has not been captured yet. */
export async function getPendingCapture(throughDate: string): Promise<PendingCapture> {
  const db = await getDb();

  const issued = await db
    .select({ inv: invoices, customerName: customers.name })
    .from(invoices)
    .innerJoin(customers, eq(invoices.customerId, customers.id))
    .where(
      and(
        eq(invoices.status, "issued"),
        isNull(invoices.capturedBatchId),
        isNotNull(invoices.issueDate),
        lte(invoices.issueDate, throughDate)
      )
    );

  // Voids: never captured at all (number must still be accounted for), or voided after capture
  const voided = await db
    .select({ inv: invoices, customerName: customers.name })
    .from(invoices)
    .innerJoin(customers, eq(invoices.customerId, customers.id))
    .where(
      and(
        eq(invoices.status, "void"),
        isNull(invoices.voidCapturedBatchId)
      )
    );
  const voidsInRange = voided.filter(
    ({ inv }) => !inv.voidedAt || inv.voidedAt.toISOString().slice(0, 10) <= throughDate
  );

  const pendingPayments = await db
    .select({ pay: payments, inv: invoices, customerName: customers.name })
    .from(payments)
    .innerJoin(invoices, eq(payments.invoiceId, invoices.id))
    .innerJoin(customers, eq(invoices.customerId, customers.id))
    .where(and(isNull(payments.capturedBatchId), lte(payments.receivedOn, throughDate)));

  return summarize(
    issued.map(({ inv, customerName }) => ({ ...inv, customerName })),
    voidsInRange.map(({ inv, customerName }) => ({ ...inv, customerName })),
    pendingPayments.map(({ pay, inv, customerName }) => ({
      ...pay,
      invoiceNumber: inv.invoiceNumber,
      customerName,
      taxPortionCents: taxPortionOfPayment(pay.amountCents, inv.taxCents, inv.totalCents),
    })),
    throughDate
  );
}

/**
 * The accountant confirms they have entered everything through throughDate into the books.
 * Every included invoice, void and payment is stamped with the batch, so nothing can be
 * captured twice or missed.
 */
export async function captureBatch(params: {
  throughDate: string;
  note?: string;
  actorUserId?: number;
  actorName: string;
}) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(params.throughDate)) throw new Error("Invalid cut-off date.");
  const db = await getDb();
  const pending = await getPendingCapture(params.throughDate);
  const t = pending.totals;
  if (t.invoiceCount + t.voidCount + t.paymentCount === 0) {
    throw new Error("There is nothing new to capture up to that date.");
  }

  const [batch] = await db
    .insert(accountingBatches)
    .values({
      throughDate: params.throughDate,
      capturedByUserId: params.actorUserId ?? null,
      capturedByName: params.actorName,
      note: (params.note ?? "").trim(),
      invoiceCount: t.invoiceCount,
      voidCount: t.voidCount,
      paymentCount: t.paymentCount,
      salesNetCents: t.salesNetCents,
      hstCents: t.hstCents,
      salesTotalCents: t.salesTotalCents,
      paymentsCents: t.paymentsCents,
    })
    .returning();

  const now = new Date();
  const invoiceIds = pending.invoices.map((i) => i.id);
  if (invoiceIds.length) {
    await db
      .update(invoices)
      .set({ capturedBatchId: batch!.id, updatedAt: now })
      .where(inArray(invoices.id, invoiceIds));
  }
  for (const v of pending.voids) {
    await db
      .update(invoices)
      .set({
        capturedBatchId: v.capturedBatchId ?? batch!.id,
        voidCapturedBatchId: batch!.id,
        updatedAt: now,
      })
      .where(eq(invoices.id, v.id));
  }
  const paymentIds = pending.payments.map((p) => p.id);
  if (paymentIds.length) {
    await db
      .update(payments)
      .set({ capturedBatchId: batch!.id })
      .where(inArray(payments.id, paymentIds));
  }

  await db.insert(activityLog).values({
    actorUserId: params.actorUserId ?? null,
    actorName: params.actorName,
    entityType: "accounting",
    entityId: String(batch!.id),
    action: "accounting.captured",
    summary: `Captured batch #${batch!.id} through ${params.throughDate}: ${t.invoiceCount} invoices, ${t.voidCount} voids, ${t.paymentCount} payments`,
  });

  return batch!;
}

/** Exactly what was captured in a past batch (for re-download). */
export async function getBatchContents(batchId: number): Promise<PendingCapture | null> {
  const db = await getDb();
  const [batch] = await db.select().from(accountingBatches).where(eq(accountingBatches.id, batchId)).limit(1);
  if (!batch) return null;

  const rows = await db
    .select({ inv: invoices, customerName: customers.name })
    .from(invoices)
    .innerJoin(customers, eq(invoices.customerId, customers.id))
    .where(or(eq(invoices.capturedBatchId, batchId), eq(invoices.voidCapturedBatchId, batchId)));

  // An invoice captured here and voided in a LATER batch still counts as a sale in this batch
  const sold = rows.filter(({ inv }) => inv.capturedBatchId === batchId && inv.voidCapturedBatchId !== batchId);
  const vds = rows.filter(({ inv }) => inv.voidCapturedBatchId === batchId);

  const pays = await db
    .select({ pay: payments, inv: invoices, customerName: customers.name })
    .from(payments)
    .innerJoin(invoices, eq(payments.invoiceId, invoices.id))
    .innerJoin(customers, eq(invoices.customerId, customers.id))
    .where(eq(payments.capturedBatchId, batchId));

  return summarize(
    sold.map(({ inv, customerName }) => ({ ...inv, customerName })),
    vds.map(({ inv, customerName }) => ({ ...inv, customerName })),
    pays.map(({ pay, inv, customerName }) => ({
      ...pay,
      invoiceNumber: inv.invoiceNumber,
      customerName,
      taxPortionCents: taxPortionOfPayment(pay.amountCents, inv.taxCents, inv.totalCents),
    })),
    batch.throughDate
  );
}
