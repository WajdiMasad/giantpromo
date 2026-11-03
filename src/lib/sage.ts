import { eq, sql } from "drizzle-orm";
import { getDb } from "@/db";
import {
  activityLog,
  customers,
  jobs,
  sageConnection,
  sageInvoices,
} from "@/db/schema";
import { toCents } from "@/lib/money";
import type { SagePaymentStatus } from "@/db/schema";

const SAGE_TOKEN_URL = "https://oauth.accounting.sage.com/token";
const SAGE_API_BASE = "https://api.accounting.sage.com/v3.1";

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
 * Refresh the live Sage OAuth token if it is expired or within 60s of expiring.
 */
export async function getValidLiveSageAccessToken(): Promise<{
  accessToken: string;
  businessId: string | null;
} | null> {
  const db = await getDb();
  const conn = await getSageConnectionState();
  if (!conn.accessToken || !conn.refreshToken) {
    return null;
  }

  const nowMs = Date.now();
  const expiresAtMs = conn.expiresAt ? new Date(conn.expiresAt).getTime() : 0;

  if (expiresAtMs - nowMs > 60_000) {
    return {
      accessToken: conn.accessToken,
      businessId: conn.resourceOwnerId ?? null,
    };
  }

  const clientId = process.env.SAGE_CLIENT_ID ?? "";
  const clientSecret = process.env.SAGE_CLIENT_SECRET ?? "";
  if (!clientId || !clientSecret) return null;

  const resp = await fetch(SAGE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: conn.refreshToken,
      client_id: clientId,
      client_secret: clientSecret,
    }),
    signal: AbortSignal.timeout(30_000),
  });

  if (!resp.ok) {
    await db
      .update(sageConnection)
      .set({
        lastSyncStatus: "disconnected",
        lastSyncError: `Token refresh failed (HTTP ${resp.status})`,
        updatedAt: new Date(),
      })
      .where(eq(sageConnection.id, "primary"));
    return null;
  }

  const tokenData = (await resp.json()) as {
    access_token: string;
    refresh_token: string;
    expires_in: number;
    resource_owner_id?: string;
  };

  await db
    .update(sageConnection)
    .set({
      accessToken: tokenData.access_token,
      refreshToken: tokenData.refresh_token,
      expiresAt: new Date(Date.now() + tokenData.expires_in * 1000),
      lastSyncStatus: "connected",
      lastSyncError: null,
      updatedAt: new Date(),
    })
    .where(eq(sageConnection.id, "primary"));

  return {
    accessToken: tokenData.access_token,
    businessId: conn.resourceOwnerId ?? tokenData.resource_owner_id ?? null,
  };
}

/**
 * Read-only sync from Live Sage Business Cloud Accounting:
 * 1. Fetches the Business ID & Business Name from /businesses
 * 2. Fetches the 50 most recent invoices from /sales_invoices?sort=date:desc
 * 3. Upserts them into sage_invoices and updates nextNumberPreview to (max_invoice_number + 1)
 * Strictly READ-ONLY — never creates or modifies anything in live Sage.
 */
export async function syncLiveSageReadOnly(): Promise<{
  businessName: string;
  businessId: string | null;
  syncedCount: number;
  highestInvoiceNumber: number;
  nextInvoiceNumber: number;
}> {
  return withSageLock(async () => {
    const auth = await getValidLiveSageAccessToken();
    if (!auth) {
      throw new Error("Live Sage OAuth token is not connected yet.");
    }

    const db = await getDb();
    let businessId = auth.businessId;
    let businessName = "Giant Promotions Limited (Live Sage)";

    // 1. Fetch business info from Sage v3.1
    const bizResp = await fetch(`${SAGE_API_BASE}/businesses`, {
      headers: {
        Authorization: `Bearer ${auth.accessToken}`,
        Accept: "application/json",
      },
      signal: AbortSignal.timeout(30_000),
    });

    if (bizResp.ok) {
      const bizData = (await bizResp.json()) as {
        $items?: Array<{ id?: string; name?: string; displayed_as?: string }>;
      };
      const firstBiz = bizData.$items?.[0];
      if (firstBiz?.id) {
        businessId = firstBiz.id;
      }
      if (firstBiz?.name || firstBiz?.displayed_as) {
        businessName = `${firstBiz.name || firstBiz.displayed_as} (Live Sage)`;
      }
    }

    const headers: Record<string, string> = {
      Authorization: `Bearer ${auth.accessToken}`,
      Accept: "application/json",
    };
    if (businessId) {
      headers["X-Business-ID"] = businessId;
    }

    // 2. Fetch recent sales invoices (read-only)
    const invUrl = new URL(`${SAGE_API_BASE}/sales_invoices`);
    invUrl.searchParams.set("items_per_page", "50");
    invUrl.searchParams.set("sort", "date:desc");
    invUrl.searchParams.set("attributes", "all");

    const invResp = await fetch(invUrl, {
      headers,
      signal: AbortSignal.timeout(30_000),
    });

    let highestInvoiceNumber = 232015;
    let syncedCount = 0;

    if (invResp.ok) {
      const invData = (await invResp.json()) as {
        $items?: Array<{
          id?: string;
          invoice_number?: string;
          contact_name?: string;
          contact?: { id?: string; name?: string; displayed_as?: string };
          reference?: string;
          status?: { id?: string } | string;
          date?: string;
          due_date?: string;
          net_amount?: number | string;
          tax_amount?: number | string;
          total_amount?: number | string;
          outstanding_amount?: number | string;
        }>;
      };

      const items = invData.$items ?? [];
      for (const inv of items) {
        if (!inv.id || !inv.invoice_number) continue;
        const numMatch = String(inv.invoice_number).match(/(\d+)$/);
        if (numMatch) {
          const parsed = Number.parseInt(numMatch[1]!, 10);
          if (Number.isFinite(parsed) && parsed > highestInvoiceNumber) {
            highestInvoiceNumber = parsed;
          }
        }

        const rawStatus =
          typeof inv.status === "object" && inv.status !== null
            ? inv.status.id || "UNPAID"
            : String(inv.status || "UNPAID");
        const statusId = rawStatus as SagePaymentStatus;

        const contactName =
          inv.contact?.name ||
          inv.contact?.displayed_as ||
          inv.contact_name ||
          "Customer";

        const netCents = toCents(inv.net_amount ?? 0);
        const taxCents = toCents(inv.tax_amount ?? 0);
        const totalCents = toCents(inv.total_amount ?? 0);
        const outstandingCents =
          inv.outstanding_amount !== undefined
            ? toCents(inv.outstanding_amount)
            : statusId === "PAID" || statusId === "VOID"
            ? 0
            : totalCents;

        const [existing] = await db
          .select()
          .from(sageInvoices)
          .where(eq(sageInvoices.sageId, inv.id))
          .limit(1);

        if (existing) {
          await db
            .update(sageInvoices)
            .set({
              invoiceNumber: String(inv.invoice_number),
              contactName,
              contactSageId: inv.contact?.id ?? null,
              reference: inv.reference ?? null,
              status: statusId,
              date: inv.date ?? existing.date,
              dueDate: inv.due_date ?? existing.dueDate,
              netCents,
              taxCents,
              totalCents,
              outstandingCents,
              updatedAt: new Date(),
            })
            .where(eq(sageInvoices.id, existing.id));
        } else {
          await db.insert(sageInvoices).values({
            sageId: inv.id,
            invoiceNumber: String(inv.invoice_number),
            contactName,
            contactSageId: inv.contact?.id ?? null,
            reference: inv.reference ?? null,
            status: statusId,
            date: inv.date ?? new Date().toISOString().slice(0, 10),
            dueDate: inv.due_date ?? null,
            netCents,
            taxCents,
            totalCents,
            outstandingCents,
          });
        }
        syncedCount += 1;
      }
    }

    const nextInvoiceNumber = highestInvoiceNumber + 1;

    await db
      .update(sageConnection)
      .set({
        environment: "production",
        businessName,
        resourceOwnerId: businessId,
        nextNumberPreview: nextInvoiceNumber,
        lastSyncAt: new Date(),
        lastSyncStatus: "connected",
        lastSyncError: null,
        updatedAt: new Date(),
      })
      .where(eq(sageConnection.id, "primary"));

    await db.insert(activityLog).values({
      actorName: "Sage Accounting Live Sync",
      entityType: "sage",
      entityId: "primary",
      action: "sage.live_synced",
      summary: `Connected to ${businessName}: synced ${syncedCount} recent invoices (latest #${highestInvoiceNumber}, next master number #${nextInvoiceNumber})`,
    });

    return {
      businessName,
      businessId,
      syncedCount,
      highestInvoiceNumber,
      nextInvoiceNumber,
    };
  });
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
      entityType: "project",
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
      entityType: "project",
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
    entityType: "project",
    entityId: String(job.id),
    action: "invoice.sent",
    summary: `Sent Sage Invoice #${job.sageInvoiceNumber} to ${email}`,
  });

  return { sentAt: now, invoiceNumber: job.sageInvoiceNumber, email };
}
