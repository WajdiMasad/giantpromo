import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { getDb, resetDbForTests } from "@/db";
import { seedInitialDataIfEmpty } from "@/db/seed";
import * as schema from "@/db/schema";
import {
  allocateInvoiceNumber,
  captureBatch,
  getBatchContents,
  getNextInvoiceNumberPreview,
  getPendingCapture,
  paymentTermsDays,
  recordInvoicePayment,
  sendJobInvoiceToCustomer,
  taxPortionOfPayment,
  voidJobInvoice,
} from "../invoicing";

const FAR_FUTURE = "2099-12-31";

async function projectByJobNumber(n: string) {
  const db = await getDb();
  const [p] = await db.select().from(schema.projects).where(eq(schema.projects.jobNumber, n));
  return p!;
}

describe("Invoicing, payments and accountant capture", () => {
  beforeEach(async () => {
    resetDbForTests();
    const db = await getDb();
    await seedInitialDataIfEmpty(db);
  });

  it("owns the number sequence: starts at 232016 and never repeats", async () => {
    expect(await getNextInvoiceNumberPreview()).toBe(232016);
    const results = await Promise.all([allocateInvoiceNumber(), allocateInvoiceNumber(), allocateInvoiceNumber()]);
    expect(new Set(results).size).toBe(3); // concurrent calls get distinct numbers
    expect([...results].sort()).toEqual(["232016", "232017", "232018"]);
    expect(await getNextInvoiceNumberPreview()).toBe(232019);
  });

  it("parses customer payment terms", () => {
    expect(paymentTermsDays("Net 30")).toBe(30);
    expect(paymentTermsDays("Net 15")).toBe(15);
    expect(paymentTermsDays("Due on receipt")).toBe(0);
    expect(paymentTermsDays(null)).toBe(30);
  });

  it("only bills an invoice when it is sent; a draft cannot take payments", async () => {
    const job = await projectByJobNumber("232013");
    const db = await getDb();
    const [draft] = await db.select().from(schema.invoices).where(eq(schema.invoices.id, job.invoiceId!));
    expect(draft!.status).toBe("draft");
    expect(draft!.issueDate).toBeNull();

    await expect(
      recordInvoicePayment({ invoiceId: draft!.id, amountCents: 100_00, method: "cheque", actorName: "Office" })
    ).rejects.toThrow(/Send the invoice first/);

    const sent = await sendJobInvoiceToCustomer({
      jobId: job.id,
      recipientEmail: "cbeaton@steeleauto.com",
      actorName: "Office",
    });
    const [issued] = await db.select().from(schema.invoices).where(eq(schema.invoices.id, draft!.id));
    expect(issued!.status).toBe("issued");
    expect(issued!.issueDate).toBe(sent.issueDate);
    expect(issued!.dueDate).not.toBeNull();

    const [after] = await db.select().from(schema.projects).where(eq(schema.projects.id, job.id));
    expect(after!.status).toBe("invoiced");

    // Re-sending never changes the issue date
    const resent = await sendJobInvoiceToCustomer({ jobId: job.id, recipientEmail: "other@x.com", actorName: "Office" });
    expect(resent.issueDate).toBe(sent.issueDate);
  });

  it("tracks part and full payment and refuses overpayment", async () => {
    const job = await projectByJobNumber("232013");
    await sendJobInvoiceToCustomer({ jobId: job.id, recipientEmail: "a@b.com", actorName: "Office" });
    const db = await getDb();

    await recordInvoicePayment({ invoiceId: job.invoiceId!, amountCents: 1000_00, method: "etransfer", actorName: "Office" });
    let [p] = await db.select().from(schema.projects).where(eq(schema.projects.id, job.id));
    expect(p!.paymentStatus).toBe("part_paid");

    await expect(
      recordInvoicePayment({ invoiceId: job.invoiceId!, amountCents: 99999_00, method: "cheque", actorName: "Office" })
    ).rejects.toThrow(/more than the amount still owing/);

    await recordInvoicePayment({ invoiceId: job.invoiceId!, amountCents: 1736_00, method: "cheque", actorName: "Office" });
    [p] = await db.select().from(schema.projects).where(eq(schema.projects.id, job.id));
    expect(p!.paymentStatus).toBe("paid");
    expect(p!.status).toBe("paid");

    // An invoice with money on it cannot simply be voided
    await expect(voidJobInvoice(job.id, "oops", "Admin")).rejects.toThrow(/credit note/);
  });

  it("splits HST out of a payment in proportion to its invoice", () => {
    expect(taxPortionOfPayment(1368_00, 168_00, 1368_00)).toBe(168_00);
    expect(taxPortionOfPayment(684_00, 168_00, 1368_00)).toBe(84_00);
    expect(taxPortionOfPayment(100, 0, 0)).toBe(0);
  });

  it("accountant capture: totals are right, nothing is captured twice, and nothing is missed", async () => {
    const job13 = await projectByJobNumber("232013");
    await sendJobInvoiceToCustomer({ jobId: job13.id, recipientEmail: "a@b.com", actorName: "Office" });

    // Pending = 232011 (issued 2026-11-01, unpaid-captured) + 232013 (just sent) and the cheque for 232011.
    // 232010/232012 were captured in the seeded past batch; drafts (232014/232015) are NOT included.
    const pending = await getPendingCapture(FAR_FUTURE);
    expect(pending.invoices.map((i) => i.invoiceNumber).sort()).toEqual(["232011", "232013"]);
    expect(pending.totals.salesNetCents).toBe(4100_00 + 2400_00);
    expect(pending.totals.hstCents).toBe(574_00 + 336_00);
    expect(pending.totals.salesTotalCents).toBe(4674_00 + 2736_00);
    expect(pending.payments.length).toBe(1);
    expect(pending.totals.paymentsCents).toBe(4674_00);
    expect(pending.totals.hstInPaymentsCents).toBe(574_00); // the whole invoice was paid

    const batch = await captureBatch({ throughDate: FAR_FUTURE, actorName: "Accountant", note: "week 1" });
    expect(batch.invoiceCount).toBe(2);
    expect(batch.paymentCount).toBe(1);
    expect(batch.salesTotalCents).toBe(7410_00);

    // Nothing left; capturing again is refused
    const again = await getPendingCapture(FAR_FUTURE);
    expect(again.totals.invoiceCount + again.totals.paymentCount + again.totals.voidCount).toBe(0);
    await expect(captureBatch({ throughDate: FAR_FUTURE, actorName: "Accountant" })).rejects.toThrow(/nothing new/);

    // A void of a never-sent draft still shows up (so the number is accounted for), at $0
    const job14 = await projectByJobNumber("232014");
    await voidJobInvoice(job14.id, "Cancelled before billing", "Admin");
    // A void of an invoice that was ALREADY captured must show up in the next capture
    await voidJobInvoice(job13.id, "Wrong customer", "Admin").catch(() => undefined); // has no payments -> allowed
    const next = await getPendingCapture(FAR_FUTURE);
    const voidNumbers = next.voids.map((v) => v.invoiceNumber).sort();
    expect(voidNumbers).toEqual(["232013", "232014"]);
    expect(next.totals.salesNetCents).toBe(0); // voids never count as sales

    const batch2 = await captureBatch({ throughDate: FAR_FUTURE, actorName: "Accountant" });
    expect(batch2.voidCount).toBe(2);

    // Re-downloading batch 1 still shows 232013 as a sale (it really was captured as one then)
    const b1 = await getBatchContents(batch.id);
    expect(b1!.invoices.map((i) => i.invoiceNumber).sort()).toEqual(["232011", "232013"]);
    const b2 = await getBatchContents(batch2.id);
    expect(b2!.voids.map((i) => i.invoiceNumber).sort()).toEqual(["232013", "232014"]);
    expect(b2!.invoices.length).toBe(0);
  });

  it("respects the cut-off date: later items wait for the next capture", async () => {
    const pendingEarly = await getPendingCapture("2026-10-31");
    expect(pendingEarly.invoices.length).toBe(0); // 232011 was issued on 2026-11-01
    const pendingLater = await getPendingCapture("2026-11-01");
    expect(pendingLater.invoices.map((i) => i.invoiceNumber)).toEqual(["232011"]);
    expect(pendingLater.payments.length).toBe(0); // the cheque arrived 2026-11-02
  });
});
