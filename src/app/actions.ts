"use server";

import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { getDb, unwrapDbErrorMessage } from "@/db";
import {
  activityLog,
  customers,
  jobAssignments,
  jobFiles,
  jobs,
  recurringBillingBatchItems,
  recurringBillingPlans,
  users,
  type JobFileKind,
  type PaymentMethod,
  type JobStatus,
} from "@/db/schema";
import { createSessionForUser, getCurrentUser } from "@/lib/auth";
import { toCents } from "@/lib/money";
import {
  checkEquipmentConflict,
  getFleetAvailability,
  type AvailabilityResult,
  type FleetUnitWithAvailability,
} from "@/lib/availability";
import { createStripeSession, finalizeStripePayment } from "@/lib/stripe";
import {
  captureBatch,
  recordInvoicePayment,
  sendJobInvoiceToCustomer,
  voidJobInvoice,
} from "@/lib/invoicing";
import {
  approveAndSendRecurringBatchWorkflow,
  approveProjectWorkflow,
  bookEquipmentRentalWorkflow,
  buildOrGetRecurringBatchWorkflow,
  createProjectWorkflow,
  declineQuoteWorkflow,
  markProjectLostWorkflow,
  returnEquipmentRentalWorkflow,
  sendQuoteToClientWorkflow,
} from "@/lib/workflows";

export async function switchActiveUserAction(formData: FormData) {
  const userId = Number(formData.get("userId"));
  if (!userId) return;
  await createSessionForUser(userId);
  revalidatePath("/", "layout");
}

export async function createProjectAction(input: {
  customerId: number;
  title: string;
  poReference: string;
  siteAddress: string;
  siteProvince: string;
  notes: string;
  customerTerms: string;
  validUntil: string;
  sendNow?: boolean;
  lines: {
    description: string;
    quantity: string;
    unitPriceDollars: string;
    taxExempt?: boolean;
    groupName?: string;
    hiddenFromCustomer?: boolean;
    equipmentId?: number;
    rentalStartDate?: string;
    rentalEndDate?: string;
  }[];
}) {
  try {
    const user = await getCurrentUser();
    const pricedLines = input.lines
      .filter((l) => l.description.trim() !== "")
      .map((l) => ({
        description: l.description.trim(),
        quantity: l.quantity || "1",
        unitPriceCents: toCents(l.unitPriceDollars || "0"),
        taxExempt: Boolean(l.taxExempt),
        groupName: (l.groupName ?? "").trim(),
        hiddenFromCustomer: Boolean(l.hiddenFromCustomer),
        equipmentId: l.equipmentId ?? null,
        rentalStartDate: l.rentalStartDate ?? null,
        rentalEndDate: l.rentalEndDate ?? null,
      }));

    const project = await createProjectWorkflow({
      customerId: input.customerId,
      title: input.title,
      poReference: input.poReference,
      siteAddress: input.siteAddress,
      siteProvince: input.siteProvince,
      notes: input.notes,
      customerTerms: input.customerTerms,
      validUntil: input.validUntil,
      lines: pricedLines,
      sendNow: input.sendNow,
      actorUserId: user?.id,
      actorName: user?.name ?? "Office Staff",
    });

    revalidatePath("/");
    revalidatePath("/projects");
    return {
      ok: true as const,
      projectId: project.id,
      publicToken: project.publicToken,
      quoteNumber: project.quoteNumber,
    };
  } catch (err) {
    return { ok: false as const, error: unwrapDbErrorMessage(err) };
  }
}

export async function checkEquipmentAvailabilityAction(params: {
  equipmentId: number;
  startDate: string;
  endDate?: string | null;
  excludeProjectId?: number;
}): Promise<AvailabilityResult> {
  const db = await getDb();
  return checkEquipmentConflict(db, params);
}

export async function getFleetAvailabilityAction(params: {
  startDate: string;
  endDate?: string | null;
  excludeProjectId?: number;
}): Promise<FleetUnitWithAvailability[]> {
  const db = await getDb();
  return getFleetAvailability(db, params);
}

export async function sendQuoteToClientAction(projectId: number) {
  try {
    const user = await getCurrentUser();
    await sendQuoteToClientWorkflow({
      projectId,
      actorUserId: user?.id,
      actorName: user?.name ?? "Office Staff",
    });
    revalidatePath("/");
    revalidatePath("/projects");
    revalidatePath(`/projects/${projectId}`);
    return { ok: true as const };
  } catch (err) {
    return { ok: false as const, error: unwrapDbErrorMessage(err) };
  }
}

export async function markProjectLostAction(input: { projectId: number; reason: string }) {
  try {
    const user = await getCurrentUser();
    await markProjectLostWorkflow({
      projectId: input.projectId,
      reason: input.reason,
      actorUserId: user?.id,
      actorName: user?.name ?? "Office Staff",
    });
    revalidatePath("/");
    revalidatePath("/projects");
    revalidatePath(`/projects/${input.projectId}`);
    return { ok: true as const };
  } catch (err) {
    return { ok: false as const, error: unwrapDbErrorMessage(err) };
  }
}

/** Public (customer) action: decline or request changes on a quote. */
export async function declineQuoteAction(input: { publicToken: string; reason: string; name?: string }) {
  try {
    await declineQuoteWorkflow({
      publicToken: input.publicToken,
      reason: input.reason,
      byName: input.name,
    });
    revalidatePath("/");
    revalidatePath("/projects");
    revalidatePath(`/q/${input.publicToken}`);
    return { ok: true as const };
  } catch (err) {
    return { ok: false as const, error: unwrapDbErrorMessage(err) };
  }
}

export async function approveQuoteAction(input: {
  publicToken?: string;
  projectId?: number;
  approvedByName: string;
  approvedByEmail?: string;
  scheduledDate?: string;
}) {
  try {
    const result = await approveProjectWorkflow({
      projectIdOrToken: { projectId: input.projectId, publicToken: input.publicToken },
      approvedByName: input.approvedByName,
      approvedByEmail: input.approvedByEmail,
      scheduledDate: input.scheduledDate,
    });

    revalidatePath("/");
    revalidatePath("/projects");
    revalidatePath(`/projects/${result.project.id}`);
    if (input.publicToken) {
      revalidatePath(`/q/${input.publicToken}`);
    }

    return {
      ok: true as const,
      jobId: result.project.id,
      jobNumber: result.project.jobNumber,
    };
  } catch (err) {
    return { ok: false as const, error: unwrapDbErrorMessage(err) };
  }
}

export async function updateJobStatusAction(input: {
  jobId: number;
  status: JobStatus;
  scheduledDate?: string;
}) {
  try {
    const user = await getCurrentUser();
    const db = await getDb();
    const [job] = await db.select().from(jobs).where(eq(jobs.id, input.jobId)).limit(1);
    if (!job) throw new Error("Job not found");

    const now = new Date();
    await db
      .update(jobs)
      .set({
        status: input.status,
        scheduledDate: input.scheduledDate ?? job.scheduledDate,
        completedAt: input.status === "installed" ? now : job.completedAt,
        updatedAt: now,
      })
      .where(eq(jobs.id, input.jobId));

    await db.insert(activityLog).values({
      actorUserId: user?.id ?? null,
      actorName: user?.name ?? "Staff",
      entityType: "project",
      entityId: String(job.id),
      action: `job.status_${input.status}`,
      summary: `Job #${job.jobNumber ?? job.id} marked ${input.status.replace("_", " ")}`,
    });

    revalidatePath("/");
    revalidatePath("/projects");
    revalidatePath(`/projects/${input.jobId}`);
    revalidatePath("/installer");
    return { ok: true as const };
  } catch (err) {
    return { ok: false as const, error: unwrapDbErrorMessage(err) };
  }
}

export async function sendJobInvoiceAction(input: {
  jobId: number;
  recipientEmail: string;
}) {
  try {
    const user = await getCurrentUser();
    const res = await sendJobInvoiceToCustomer({
      jobId: input.jobId,
      recipientEmail: input.recipientEmail,
      actorUserId: user?.id,
      actorName: user?.name ?? "Office Staff",
    });

    revalidatePath("/");
    revalidatePath("/projects");
    revalidatePath(`/projects/${input.jobId}`);
    return { ok: true as const, invoiceNumber: res.invoiceNumber, email: res.email };
  } catch (err) {
    return { ok: false as const, error: unwrapDbErrorMessage(err) };
  }
}

export async function voidJobAction(input: { jobId: number; reason: string }) {
  try {
    const user = await getCurrentUser();
    await voidJobInvoice(input.jobId, input.reason, user?.name ?? "Admin");

    revalidatePath("/");
    revalidatePath("/projects");
    revalidatePath(`/projects/${input.jobId}`);
    revalidatePath("/accounting");
    return { ok: true as const };
  } catch (err) {
    return { ok: false as const, error: unwrapDbErrorMessage(err) };
  }
}

export async function recordPaymentAction(input: {
  invoiceId: number;
  amountDollars: string;
  receivedOn: string;
  method: PaymentMethod;
  reference: string;
}) {
  try {
    const user = await getCurrentUser();
    if (!user || !["admin", "office", "accountant"].includes(user.role)) {
      throw new Error("You do not have permission to record payments.");
    }
    await recordInvoicePayment({
      invoiceId: input.invoiceId,
      amountCents: toCents(input.amountDollars || "0"),
      receivedOn: input.receivedOn,
      method: input.method,
      reference: input.reference,
      actorUserId: user.id,
      actorName: user.name,
    });

    revalidatePath("/");
    revalidatePath("/projects");
    revalidatePath("/accounting");
    return { ok: true as const };
  } catch (err) {
    return { ok: false as const, error: unwrapDbErrorMessage(err) };
  }
}

export async function createStripeCheckoutAction(input: {
  projectId: number;
  customerEmail?: string;
  successUrl: string;
  cancelUrl: string;
}) {
  try {
    const session = await createStripeSession(input);
    return {
      ok: true as const,
      url: session.url,
      sessionId: session.sessionId,
      isTestMode: session.isTestMode,
    };
  } catch (err) {
    return { ok: false as const, error: unwrapDbErrorMessage(err) };
  }
}

export async function finalizeStripePaymentAction(input: {
  invoiceId: number;
  amountCents: number;
  sessionId: string;
}) {
  try {
    const user = await getCurrentUser();
    await finalizeStripePayment({
      invoiceId: input.invoiceId,
      amountCents: input.amountCents,
      sessionId: input.sessionId,
      actorName: user?.name ?? "Customer (Stripe Card)",
    });
    revalidatePath("/");
    revalidatePath("/projects");
    revalidatePath("/billing");
    revalidatePath("/accounting");
    return { ok: true as const };
  } catch (err) {
    return { ok: false as const, error: unwrapDbErrorMessage(err) };
  }
}

/** The accountant confirms everything through a date has been entered into the books. */
export async function captureAccountingBatchAction(input: { throughDate: string; note: string }) {
  try {
    const user = await getCurrentUser();
    if (!user || !["admin", "accountant"].includes(user.role)) {
      throw new Error("Only the accountant or an admin can capture sales.");
    }
    const batch = await captureBatch({
      throughDate: input.throughDate,
      note: input.note,
      actorUserId: user.id,
      actorName: user.name,
    });
    revalidatePath("/accounting");
    revalidatePath("/");
    return { ok: true as const, batchId: batch.id };
  } catch (err) {
    return { ok: false as const, error: unwrapDbErrorMessage(err) };
  }
}

export async function toggleAssignInstallerAction(input: {
  jobId: number;
  installerUserId: number;
}) {
  try {
    const db = await getDb();
    const existing = await db
      .select()
      .from(jobAssignments)
      .where(eq(jobAssignments.jobId, input.jobId));

    const match = existing.find((a) => a.userId === input.installerUserId);
    if (match) {
      await db.delete(jobAssignments).where(eq(jobAssignments.id, match.id));
    } else {
      await db.insert(jobAssignments).values({
        jobId: input.jobId,
        userId: input.installerUserId,
      });
    }

    revalidatePath(`/projects/${input.jobId}`);
    revalidatePath("/installer");
    return { ok: true as const };
  } catch (err) {
    return { ok: false as const, error: unwrapDbErrorMessage(err) };
  }
}

export async function uploadJobPhotoAction(formData: FormData) {
  try {
    const jobId = Number(formData.get("jobId"));
    const caption = String(formData.get("caption") ?? "").trim();
    const kind = (String(formData.get("kind") ?? "install_photo") as JobFileKind) || "install_photo";
    const file = formData.get("file") as File | null;

    if (!jobId || !file || file.size === 0) {
      throw new Error("Please select a photo or file to upload.");
    }
    if (file.size > 20 * 1024 * 1024) {
      throw new Error("File exceeds 20 MB limit.");
    }

    const user = await getCurrentUser();
    const db = await getDb();
    const [job] = await db.select().from(jobs).where(eq(jobs.id, jobId)).limit(1);
    if (!job) throw new Error("Job not found");

    const ext = path.extname(file.name).toLowerCase() || ".jpg";
    const safeFilename = `job_${job.jobNumber ?? job.id}_${Date.now()}_${crypto.randomBytes(4).toString("hex")}${ext}`;
    const relDir = path.join("uploads", "jobs", String(job.id));
    const absDir = path.join(process.cwd(), "public", relDir);
    await fs.mkdir(absDir, { recursive: true });

    const buffer = Buffer.from(await file.arrayBuffer());
    await fs.writeFile(path.join(absDir, safeFilename), buffer);

    const publicPath = `/uploads/jobs/${job.id}/${safeFilename}`;
    const driveFolderLabel = job.jobNumber ? `Invoice-${job.jobNumber}` : `Job-${job.id}`;

    await db.insert(jobFiles).values({
      jobId: job.id,
      uploadedByUserId: user?.id ?? null,
      uploadedByName: user?.name ?? "Installer",
      kind,
      filename: safeFilename,
      originalName: file.name,
      mimeType: file.type || "image/jpeg",
      sizeBytes: file.size,
      storagePath: publicPath,
      caption,
      driveFileId: `drive-file-${safeFilename}`,
      driveUrl: `https://drive.google.com/drive/folders/${driveFolderLabel}`,
      driveMirrorStatus: "synced",
    });

    await db.insert(activityLog).values({
      actorUserId: user?.id ?? null,
      actorName: user?.name ?? "Installer",
      entityType: "project",
      entityId: String(job.id),
      action: "job.file_uploaded",
      summary: `Uploaded ${kind.replace("_", " ")} "${file.name}" to Job #${job.jobNumber ?? job.id} (mirrored to Drive)`,
    });

    revalidatePath(`/projects/${job.id}`);
    revalidatePath("/installer");
    return { ok: true as const };
  } catch (err) {
    return { ok: false as const, error: unwrapDbErrorMessage(err) };
  }
}

export async function bookEquipmentRentalAction(input: {
  equipmentId: number;
  customerId: number;
  startDate: string;
  endDate?: string;
  monthlyRateDollars: string;
  locationAddress: string;
  poReference?: string;
  notes?: string;
}) {
  try {
    const user = await getCurrentUser();
    const rental = await bookEquipmentRentalWorkflow({
      equipmentId: input.equipmentId,
      customerId: input.customerId,
      startDate: input.startDate,
      endDate: input.endDate || null,
      monthlyRateCents: toCents(input.monthlyRateDollars || "175"),
      locationAddress: input.locationAddress,
      poReference: input.poReference,
      notes: input.notes,
      createRecurringPlan: true,
      actorName: user?.name ?? "Office Staff",
    });

    revalidatePath("/");
    revalidatePath("/equipment");
    revalidatePath("/billing");
    return { ok: true as const, rentalId: rental.id };
  } catch (err) {
    return { ok: false as const, error: unwrapDbErrorMessage(err) };
  }
}

export async function returnEquipmentRentalAction(rentalId: number) {
  try {
    const user = await getCurrentUser();
    const res = await returnEquipmentRentalWorkflow({
      rentalId,
      actorName: user?.name ?? "Office Staff",
    });

    revalidatePath("/");
    revalidatePath("/equipment");
    revalidatePath("/billing");
    return { ok: true as const, stoppedPlansCount: res.stoppedPlansCount };
  } catch (err) {
    return { ok: false as const, error: unwrapDbErrorMessage(err) };
  }
}

export async function createRecurringServicePlanAction(input: {
  customerId: number;
  kind: "maintenance" | "storage" | "advertising_space" | "service";
  title: string;
  description: string;
  poReference: string;
  province: string;
  monthlyAmountDollars: string;
  startDate: string;
}) {
  try {
    const user = await getCurrentUser();
    const db = await getDb();
    const [plan] = await db
      .insert(recurringBillingPlans)
      .values({
        customerId: input.customerId,
        rentalId: null,
        kind: input.kind,
        title: input.title.trim(),
        description: input.description.trim() || input.title.trim(),
        poReference: input.poReference.trim(),
        province: input.province || "NS",
        monthlyAmountCents: toCents(input.monthlyAmountDollars),
        startDate: input.startDate,
        status: "active",
      })
      .returning();

    await db.insert(activityLog).values({
      actorUserId: user?.id ?? null,
      actorName: user?.name ?? "Office Staff",
      entityType: "billing",
      entityId: String(plan!.id),
      action: "plan.created",
      summary: `Created recurring ${input.kind.replace("_", " ")} plan "${input.title}"`,
    });

    revalidatePath("/billing");
    return { ok: true as const, planId: plan!.id };
  } catch (err) {
    return { ok: false as const, error: unwrapDbErrorMessage(err) };
  }
}

export async function toggleRecurringPlanStatusAction(input: {
  planId: number;
  status: "active" | "paused" | "ended";
}) {
  try {
    const db = await getDb();
    const today = new Date().toISOString().slice(0, 10);
    await db
      .update(recurringBillingPlans)
      .set({
        status: input.status,
        endDate: input.status === "ended" ? today : null,
        updatedAt: new Date(),
      })
      .where(eq(recurringBillingPlans.id, input.planId));

    revalidatePath("/billing");
    return { ok: true as const };
  } catch (err) {
    return { ok: false as const, error: unwrapDbErrorMessage(err) };
  }
}

export async function generateMonthlyBatchAction(input: {
  monthKey: string;
  isDryRun: boolean;
}) {
  try {
    const batch = await buildOrGetRecurringBatchWorkflow(input);
    revalidatePath("/billing");
    return { ok: true as const, batchId: batch.id };
  } catch (err) {
    return { ok: false as const, error: unwrapDbErrorMessage(err) };
  }
}

export async function toggleSkipBatchItemAction(input: {
  itemId: number;
  skip: boolean;
}) {
  try {
    const db = await getDb();
    await db
      .update(recurringBillingBatchItems)
      .set({ skipThisMonth: input.skip })
      .where(eq(recurringBillingBatchItems.id, input.itemId));

    revalidatePath("/billing");
    return { ok: true as const };
  } catch (err) {
    return { ok: false as const, error: unwrapDbErrorMessage(err) };
  }
}

export async function approveAndSendBatchAction(input: {
  batchId: number;
  scheduleForFirst?: boolean;
}) {
  try {
    const user = await getCurrentUser();
    const res = await approveAndSendRecurringBatchWorkflow({
      batchId: input.batchId,
      scheduleForFirst: input.scheduleForFirst,
      actorUserId: user?.id,
      actorName: user?.name ?? "Admin",
    });

    revalidatePath("/");
    revalidatePath("/billing");
    return { ok: true as const, ...res };
  } catch (err) {
    return { ok: false as const, error: unwrapDbErrorMessage(err) };
  }
}

export async function createCustomerAction(input: {
  name: string;
  companyName: string;
  contactPerson: string;
  email: string;
  phone: string;
  addressLine1: string;
  city: string;
  province: string;
  postalCode: string;
  siteNotes: string;
}) {
  try {
    const db = await getDb();
    const [created] = await db
      .insert(customers)
      .values({
        name: input.name.trim(),
        companyName: input.companyName.trim() || input.name.trim(),
        contactPerson: input.contactPerson.trim(),
        email: input.email.trim(),
        phone: input.phone.trim(),
        addressLine1: input.addressLine1.trim(),
        city: input.city.trim() || "Halifax",
        province: input.province || "NS",
        postalCode: input.postalCode.trim(),
        siteNotes: input.siteNotes.trim(),
        lat: 44.665,
        lng: -63.61,
      })
      .returning();

    revalidatePath("/customers");
    revalidatePath("/projects/new");
    revalidatePath("/equipment");
    return { ok: true as const, customerId: created!.id };
  } catch (err) {
    return { ok: false as const, error: unwrapDbErrorMessage(err) };
  }
}
