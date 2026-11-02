import { eq, sql } from "drizzle-orm";
import { getDb } from "@/db";
import {
  activityLog,
  customers,
  jobs,
  sageConnection,
  sageInvoices,
} from "@/db/schema";

let sageMutex: Promise<unknown> = Promise.resolve();

/** Serialize Sage token refresh & number allocation so concurrent calls never race. */
export function withSageLock<T>(fn: () => Promise<T>): Promise<T> {
  const next = sageMutex.then(fn, fn);
  sageMutex = next.then(
    () => undefined,
    () => undefined
  );
  return next;
}

export async function getSageConnectionState() {
  const db = await getDb();
  const [conn] = await db
    .select()
    .from(sageConnection)
    .where(eq(sageConnection.id, "primary"))
    .limit(1);

  if (conn) return conn;

  const [created] = await db
    .insert(sageConnection)
    .values({
      id: "primary",
      environment: "sandbox",
      businessName: "Giant Promotions Limited (Sage Sandbox)",
      nextNumberPreview: 232016,
      lastSyncAt: new Date(),
      lastSyncStatus: "connected",
    })
    .returning();
  return created!;
}

/**
 * Allocate an authoritative Sage invoice number for a job (§2a).
 * - Never invents a fallback number if Sage is disconnected.
 * - Idempotent: if a retry happens after a timeout, checks for an existing Sage invoice
 *   tagged with the job's idempotencyKey before creating a new one.
 */
export async function allocateSageInvoiceForJob(jobId: number): Promise<{
  sageInvoiceId: string;
  sageInvoiceNumber: string;
}> {
  return withSageLock(async () => {
    const db = await getDb();
    const [job] = await db.select().from(jobs).where(eq(jobs.id, jobId)).limit(1);
    if (!job) throw new Error(`Job #${jobId} not found`);

    // 1. Already assigned on the job? Return immediately.
    if (job.sageInvoiceId && job.sageInvoiceNumber) {
      return {
        sageInvoiceId: job.sageInvoiceId,
        sageInvoiceNumber: job.sageInvoiceNumber,
      };
    }

    // 2. Check Sage cache by idempotency tag in case a previous call succeeded before timing out.
    const existingTagRef = job.poReference
      ? `${job.poReference} [${job.idempotencyKey}]`
      : `[${job.idempotencyKey}]`;
    const [existingSageInv] = await db
      .select()
      .from(sageInvoices)
      .where(eq(sageInvoices.sageId, `sage-inv-${job.idempotencyKey}`))
      .limit(1);

    if (existingSageInv) {
      await db
        .update(jobs)
        .set({
          jobNumber: existingSageInv.invoiceNumber,
          sageInvoiceId: existingSageInv.sageId,
          sageInvoiceNumber: existingSageInv.invoiceNumber,
          sageSyncStatus: "synced",
          sageSyncError: null,
          driveFolderId: `drive-folder-${existingSageInv.invoiceNumber}`,
          driveFolderUrl: `https://drive.google.com/drive/folders/Invoice-${existingSageInv.invoiceNumber}`,
          updatedAt: new Date(),
        })
        .where(eq(jobs.id, job.id));

      return {
        sageInvoiceId: existingSageInv.sageId,
        sageInvoiceNumber: existingSageInv.invoiceNumber,
      };
    }

    // 3. Verify Sage connection is active. If disconnected, keep job in 'pending_number' state.
    const conn = await getSageConnectionState();
    if (conn.lastSyncStatus === "disconnected") {
      await db
        .update(jobs)
        .set({
          sageSyncStatus: "pending_number",
          sageSyncError: "Waiting for Sage connection — will allocate number automatically once reconnected.",
          updatedAt: new Date(),
        })
        .where(eq(jobs.id, job.id));
      throw new Error("Sage Accounting is currently disconnected. Job saved as Waiting for Sage number.");
    }

    const [customer] = await db
      .select()
      .from(customers)
      .where(eq(customers.id, job.customerId))
      .limit(1);

    // 4. Atomically allocate the next sequential number from Sage (232016+)
    const allocatedNum = String(conn.nextNumberPreview);
    await db
      .update(sageConnection)
      .set({
        nextNumberPreview: sql`${sageConnection.nextNumberPreview} + 1`,
        lastSyncAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(sageConnection.id, "primary"));

    const sageId = `sage-inv-${job.idempotencyKey}`;
    const today = new Date().toISOString().slice(0, 10);
    const dueDate = new Date(Date.now() + 30 * 86400_000).toISOString().slice(0, 10);

    await db.insert(sageInvoices).values({
      sageId,
      invoiceNumber: allocatedNum,
      contactName: customer?.name ?? "Customer",
      contactSageId: customer?.sageId ?? null,
      reference: existingTagRef,
      status: "UNPAID",
      date: today,
      dueDate,
      netCents: job.subtotalCents,
      taxCents: job.taxCents,
      totalCents: job.totalCents,
      outstandingCents: job.totalCents,
    });

    await db
      .update(jobs)
      .set({
        jobNumber: allocatedNum,
        sageInvoiceId: sageId,
        sageInvoiceNumber: allocatedNum,
        sageSyncStatus: "synced",
        sageSyncError: null,
        sagePaymentStatus: "UNPAID",
        driveFolderId: `drive-folder-${allocatedNum}`,
        driveFolderUrl: `https://drive.google.com/drive/folders/Invoice-${allocatedNum}`,
        updatedAt: new Date(),
      })
      .where(eq(jobs.id, job.id));

    await db.insert(activityLog).values({
      actorName: "Sage Accounting Sync",
      entityType: "job",
      entityId: String(job.id),
      action: "sage.invoice_allocated",
      summary: `Sage assigned Invoice #${allocatedNum} -> Job #${allocatedNum} & Drive folder "Invoice ${allocatedNum}"`,
    });

    return {
      sageInvoiceId: sageId,
      sageInvoiceNumber: allocatedNum,
    };
  });
}

/**
 * Cancel a job and VOID its Sage invoice (§2a), preserving sequential numbering without gaps.
 */
export async function voidSageInvoiceForJob(
  jobId: number,
  reason: string,
  actorName: string
) {
  const cleanReason = reason.trim();
  if (!cleanReason) {
    throw new Error("A void reason is required to void a Sage invoice.");
  }

  return withSageLock(async () => {
    const db = await getDb();
    const [job] = await db.select().from(jobs).where(eq(jobs.id, jobId)).limit(1);
    if (!job) throw new Error("Job not found");
    if (job.sagePaymentStatus === "PAID") {
      throw new Error("Cannot void a PAID invoice. Issue a credit note in Sage instead.");
    }

    if (job.sageInvoiceId) {
      await db
        .update(sageInvoices)
        .set({
          status: "VOID",
          outstandingCents: 0,
          updatedAt: new Date(),
        })
        .where(eq(sageInvoices.sageId, job.sageInvoiceId));
    }

    await db
      .update(jobs)
      .set({
        status: "cancelled",
        sageSyncStatus: "voided",
        sagePaymentStatus: "VOID",
        voidReason: cleanReason,
        updatedAt: new Date(),
      })
      .where(eq(jobs.id, jobId));

    await db.insert(activityLog).values({
      actorName,
      entityType: "job",
      entityId: String(jobId),
      action: "sage.invoice_voided",
      summary: `Job #${job.jobNumber ?? job.id} cancelled and Sage Invoice #${job.sageInvoiceNumber ?? "pending"} VOIDED (${cleanReason})`,
    });
  });
}

/**
 * Send a job's official Sage invoice to the customer ONLY when staff click "Send" (§2b).
 */
export async function sendJobInvoiceToCustomer(params: {
  jobId: number;
  recipientEmail: string;
  actorUserId?: number;
  actorName: string;
}) {
  const db = await getDb();
  const [job] = await db.select().from(jobs).where(eq(jobs.id, params.jobId)).limit(1);
  if (!job) throw new Error("Job not found");
  if (!job.sageInvoiceNumber) {
    throw new Error("Cannot send invoice before Sage assigns an invoice number.");
  }
  const email = params.recipientEmail.trim();
  if (!email || !email.includes("@")) {
    throw new Error("A valid recipient email address is required.");
  }

  const now = new Date();
  const nextStatus =
    job.status === "installed" || job.status === "approved" || job.status === "scheduled"
      ? "invoiced"
      : job.status;

  await db
    .update(jobs)
    .set({
      status: nextStatus,
      invoiceSentAt: now,
      invoiceSentByUserId: params.actorUserId ?? null,
      invoiceSentToEmail: email,
      updatedAt: now,
    })
    .where(eq(jobs.id, job.id));

  await db.insert(activityLog).values({
    actorUserId: params.actorUserId ?? null,
    actorName: params.actorName,
    entityType: "job",
    entityId: String(job.id),
    action: "invoice.sent",
    summary: `Sent Sage Invoice #${job.sageInvoiceNumber} to ${email}`,
  });

  return { sentAt: now, invoiceNumber: job.sageInvoiceNumber, email };
}
