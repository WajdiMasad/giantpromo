import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { getDb, resetDbForTests } from "@/db";
import { seedInitialDataIfEmpty } from "@/db/seed";
import * as schema from "@/db/schema";
import {
  approveAndSendRecurringBatchWorkflow,
  approveQuoteAndCreateJobWorkflow,
  bookEquipmentRentalWorkflow,
  buildOrGetRecurringBatchWorkflow,
  createQuoteWorkflow,
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

    const quote = await createQuoteWorkflow({
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
    const { job } = await approveQuoteAndCreateJobWorkflow({
      quoteIdOrToken: { publicToken: quote.publicToken },
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
    const retry = await approveQuoteAndCreateJobWorkflow({
      quoteIdOrToken: { publicToken: quote.publicToken },
      approvedByName: "Mark O'Regan",
    });
    expect(retry.job.id).toBe(job.id);
    expect(retry.job.jobNumber).toBe("232016");

    // Staff clicks "Send Invoice" -> records timestamp and recipient
    const sent = await sendJobInvoiceToCustomer({
      jobId: job.id,
      recipientEmail: "accounting@oregans.com",
      actorName: "Wajdi (AJ) Masad",
    });
    expect(sent.invoiceNumber).toBe("232016");
    expect(sent.email).toBe("accounting@oregans.com");
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
