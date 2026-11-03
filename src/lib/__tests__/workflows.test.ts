import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { getDb, resetDbForTests } from "@/db";
import { seedInitialDataIfEmpty } from "@/db/seed";
import * as schema from "@/db/schema";
import {
  approveAndSendRecurringBatchWorkflow,
  approveProjectWorkflow,
  declineQuoteWorkflow,
  markProjectLostWorkflow,
  recordQuoteViewWorkflow,
  sendQuoteToClientWorkflow,
  bookEquipmentRentalWorkflow,
  buildOrGetRecurringBatchWorkflow,
  createProjectWorkflow,
  returnEquipmentRentalWorkflow,
} from "../workflows";
import { sendJobInvoiceToCustomer, voidSageInvoiceForJob } from "../sage";

describe("End-to-end Quote -> Job -> Sage Invoice & Recurring Billing workflows", () => {
  beforeEach(async () => {
    resetDbForTests();
    const db = await getDb();
    await seedInitialDataIfEmpty(db);
  });

  it("allocates Sage master number 232016 upon quote approval and is idempotent on retry", async () => {
    const db = await getDb();
    const [customer] = await db.select().from(schema.customers).limit(1);

    const quote = await createProjectWorkflow({
      customerId: customer!.id,
      title: "Dealership Pylon Sign Faces",
      poReference: "PO-99001",
      siteProvince: "NS",
      lines: [
        { description: "Backlit Translucent Vinyl Faces (x2)", quantity: 2, unitPriceCents: 600_00 },
      ],
      actorName: "Wajdi (AJ) Masad",
    });

    expect(quote.quoteNumber).toBe("Q-1004");
    expect(quote.subtotalCents).toBe(1200_00);
    expect(quote.taxCents).toBe(168_00); // 14% NS HST
    expect(quote.totalCents).toBe(1368_00);

    // Approve quote via public token (as customer does online)
    const { project: job } = await approveProjectWorkflow({
      projectIdOrToken: { publicToken: quote.publicToken },
      approvedByName: "Mark O'Regan",
      approvedByEmail: "marketing@oregans.com",
    });

    // Seed had 232013, 232014, 232015 -> next Sage master number must be 232016!
    expect(job.jobNumber).toBe("232016");
    expect(job.sageInvoiceNumber).toBe("232016");
    expect(job.sageSyncStatus).toBe("synced");
    expect(job.driveFolderUrl).toContain("Invoice-232016");
    // Invoice is NOT emailed at approval (§2b: only when staff click Send)
    expect(job.invoiceSentAt).toBeNull();

    // Approving a second time (retry/double-click) returns the exact same job & number
    const retry = await approveProjectWorkflow({
      projectIdOrToken: { publicToken: quote.publicToken },
      approvedByName: "Mark O'Regan",
    });
    expect(retry.project.id).toBe(job.id);
    expect(retry.project.jobNumber).toBe("232016");

    // Staff clicks "Send Invoice" -> records timestamp and recipient
    const sent = await sendJobInvoiceToCustomer({
      jobId: job.id,
      recipientEmail: "accounting@oregans.com",
      actorName: "Wajdi (AJ) Masad",
    });
    expect(sent.invoiceNumber).toBe("232016");
    expect(sent.email).toBe("accounting@oregans.com");
  });

  it("runs one Project record through New -> Quote Sent -> Action Needed -> Signed with no job number until signed", async () => {
    const db = await getDb();
    const [customer] = await db.select().from(schema.customers).limit(1);

    // Hidden internal-only lines are forced to $0 and flagged
    const draft = await createProjectWorkflow({
      customerId: customer!.id,
      title: "Lobby Wall Graphics",
      siteProvince: "NS",
      lines: [
        { description: "Printed wall mural", quantity: 1, unitPriceCents: 500_00, groupName: "Graphics" },
        { description: "Scissor lift (internal)", quantity: 1, unitPriceCents: 999_00, hiddenFromCustomer: true },
      ],
      actorName: "Admin",
    });
    expect(draft.status).toBe("new");
    expect(draft.jobNumber).toBeNull();
    expect(draft.sageSyncStatus).toBe("not_started");
    expect(draft.subtotalCents).toBe(500_00); // hidden line contributes nothing
    const items = await db
      .select()
      .from(schema.projectItems)
      .where(eq(schema.projectItems.jobId, draft.id));
    expect(items.find((i) => i.hiddenFromCustomer)?.unitPriceCents).toBe(0);
    expect(items.find((i) => i.groupName === "Graphics")).toBeDefined();

    // Send to client
    const sent = await sendQuoteToClientWorkflow({ projectId: draft.id, actorName: "Admin" });
    expect(sent.status).toBe("quote_sent");
    expect(sent.sentAt).not.toBeNull();

    // Client opens it (first view recorded, repeat views within 5 min are not re-logged)
    const viewed = await recordQuoteViewWorkflow(draft.publicToken, "203.0.113.9");
    expect(viewed?.firstViewedAt).not.toBeNull();
    await recordQuoteViewWorkflow(draft.publicToken);
    const viewLogs = await db
      .select()
      .from(schema.activityLog)
      .where(eq(schema.activityLog.action, "project.quote_viewed"));
    expect(viewLogs.length).toBe(1);

    // Client asks for changes -> Action Needed, then staff re-sends, then client signs
    const declined = await declineQuoteWorkflow({
      publicToken: draft.publicToken,
      reason: "Please make the mural 2ft wider",
    });
    expect(declined.status).toBe("action_needed");
    expect(declined.jobNumber).toBeNull();

    await sendQuoteToClientWorkflow({ projectId: draft.id, actorName: "Admin" });
    const { project: signed } = await approveProjectWorkflow({
      projectIdOrToken: { publicToken: draft.publicToken },
      approvedByName: "Sarah Johnson",
    });
    expect(signed.id).toBe(draft.id); // same record, not a copy
    expect(signed.status).toBe("scheduled");
    expect(signed.jobNumber).toBe("232016");
    expect(signed.quoteNumber).toBe(draft.quoteNumber);

    // A signed project can no longer be declined or marked lost
    await expect(
      declineQuoteWorkflow({ publicToken: draft.publicToken, reason: "too late" })
    ).rejects.toThrow();
    await expect(
      markProjectLostWorkflow({ projectId: draft.id, reason: "x", actorName: "Admin" })
    ).rejects.toThrow();
  });

  it("marking an unsigned quote Lost never consumes a Sage number", async () => {
    const db = await getDb();
    const [customer] = await db.select().from(schema.customers).limit(1);
    const lostOne = await createProjectWorkflow({
      customerId: customer!.id,
      title: "Lost opportunity",
      siteProvince: "NS",
      lines: [{ description: "Banner", quantity: 1, unitPriceCents: 100_00 }],
      sendNow: true,
      actorName: "Admin",
    });
    const lost = await markProjectLostWorkflow({
      projectId: lostOne.id,
      reason: "Went with a competitor",
      actorName: "Admin",
    });
    expect(lost.status).toBe("lost");
    expect(lost.jobNumber).toBeNull();

    const next = await createProjectWorkflow({
      customerId: customer!.id,
      title: "Next one",
      siteProvince: "NS",
      lines: [{ description: "Banner", quantity: 1, unitPriceCents: 100_00 }],
      actorName: "Admin",
    });
    const { project } = await approveProjectWorkflow({
      projectIdOrToken: { projectId: next.id },
      approvedByName: "Staff",
    });
    expect(project.jobNumber).toBe("232016"); // the lost quote did not burn a number
  });

  it("voids the Sage invoice when a job is cancelled without breaking sequential numbering", async () => {
    const db = await getDb();
    const [job232015] = await db
      .select()
      .from(schema.jobs)
      .where(eq(schema.jobs.jobNumber, "232015"));

    await voidSageInvoiceForJob(job232015!.id, "Customer postponed campaign to spring", "Admin");

    const [updatedJob] = await db
      .select()
      .from(schema.jobs)
      .where(eq(schema.jobs.id, job232015!.id));
    expect(updatedJob?.status).toBe("cancelled");
    expect(updatedJob?.sagePaymentStatus).toBe("VOID");

    const [sageInv] = await db
      .select()
      .from(schema.sageInvoices)
      .where(eq(schema.sageInvoices.invoiceNumber, "232015"));
    expect(sageInv?.status).toBe("VOID");
    expect(sageInv?.outstandingCents).toBe(0);
  });

  it("stops recurring billing automatically when equipment is returned and runs monthly batches", async () => {
    const db = await getDb();
    const [ms3] = await db
      .select()
      .from(schema.equipment)
      .where(eq(schema.equipment.code, "MS-003"));
    const [cust] = await db.select().from(schema.customers).limit(1);

    // Book MS-003 mid-month in Dec 2026 (2026-12-15) -> half-month rule applies in Dec!
    const rental = await bookEquipmentRentalWorkflow({
      equipmentId: ms3!.id,
      customerId: cust!.id,
      startDate: "2026-12-15",
      monthlyRateCents: 200_00,
      locationAddress: "3240 Kempt Rd, Halifax",
      createRecurringPlan: true,
      actorName: "Admin",
    });

    // Build Dec 2026 dry-run batch
    const decBatch = await buildOrGetRecurringBatchWorkflow({
      monthKey: "2026-12",
      isDryRun: true,
    });
    const decItems = await db
      .select()
      .from(schema.recurringBillingBatchItems)
      .where(eq(schema.recurringBillingBatchItems.batchId, decBatch.id));

    const ms3DecItem = decItems.find((i) => i.description.includes("MS-003"));
    expect(ms3DecItem).toBeDefined();
    expect(ms3DecItem?.isHalfMonthProrated).toBe(true);
    expect(ms3DecItem?.netCents).toBe(100_00); // half of $200.00!
    expect(ms3DecItem?.changeFlag).toBe("half_month_start");

    // Return MS-003 -> automatically ends its recurring billing plan
    const returned = await returnEquipmentRentalWorkflow({
      rentalId: rental.id,
      actorName: "Admin",
    });
    expect(returned.stoppedPlansCount).toBe(1);

    // Build Jan 2027 live batch -> MS-003 is no longer billed because it was returned!
    const janBatch = await buildOrGetRecurringBatchWorkflow({
      monthKey: "2027-01",
      isDryRun: false,
    });
    const janItems = await db
      .select()
      .from(schema.recurringBillingBatchItems)
      .where(eq(schema.recurringBillingBatchItems.batchId, janBatch.id));
    expect(janItems.find((i) => i.description.includes("MS-003"))).toBeUndefined();

    // Approve & execute Jan 2027 batch -> allocates real Sage numbers (232016+)
    const executed = await approveAndSendRecurringBatchWorkflow({
      batchId: janBatch.id,
      actorName: "Wajdi (AJ) Masad",
    });
    expect(executed.status).toBe("sent");
    expect(executed.processedCount).toBeGreaterThan(0);
  });
});
