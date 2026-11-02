import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { getDb, resetDbForTests, unwrapDbErrorMessage } from "../index";
import { seedInitialDataIfEmpty } from "../seed";
import * as schema from "../schema";

describe("PostgreSQL schema & hard business constraints", () => {
  beforeEach(() => {
    resetDbForTests();
  });

  it("seeds initial Giant Promotions data cleanly", async () => {
    const db = await getDb();
    await seedInitialDataIfEmpty(db);

    const customers = await db.select().from(schema.customers);
    const jobs = await db.select().from(schema.jobs);
    const equip = await db.select().from(schema.equipment);

    expect(customers.length).toBeGreaterThanOrEqual(6);
    expect(jobs.map((j) => j.jobNumber)).toEqual(["232013", "232014", "232015"]);
    expect(equip.length).toBeGreaterThanOrEqual(6);
  });

  it("blocks double-booking equipment at the PostgreSQL database level", async () => {
    const db = await getDb();
    await seedInitialDataIfEmpty(db);

    const [pw1] = await db
      .select()
      .from(schema.equipment)
      .where(eq(schema.equipment.code, "PW-001"));
    const [cust] = await db.select().from(schema.customers).limit(1);

    // PW-001 is already booked 2026-11-01 to 2026-11-30 in seed data.
    // Attempting to book 2026-11-15 to 2026-12-05 must throw an exclusion violation:
    let caughtError: unknown;
    try {
      await db.insert(schema.equipmentRentals).values({
        equipmentId: pw1!.id,
        customerId: cust!.id,
        startDate: "2026-11-15",
        endDate: "2026-12-05",
        monthlyRateCents: 120_00,
        locationAddress: "Conflicting Booking",
        status: "scheduled",
      });
    } catch (err) {
      caughtError = err;
    }
    expect(unwrapDbErrorMessage(caughtError)).toMatch(/already booked/);

    // Booking after 2026-11-30 (e.g. 2026-12-01 to 2026-12-31) succeeds:
    const [nonOverlapping] = await db
      .insert(schema.equipmentRentals)
      .values({
        equipmentId: pw1!.id,
        customerId: cust!.id,
        startDate: "2026-12-01",
        endDate: "2026-12-31",
        monthlyRateCents: 120_00,
        locationAddress: "December Event",
        status: "scheduled",
      })
      .returning();

    expect(nonOverlapping?.startDate).toBe("2026-12-01");
  });

  it("prevents billing any recurring plan twice in the same month", async () => {
    const db = await getDb();
    await seedInitialDataIfEmpty(db);

    const [plan] = await db.select().from(schema.recurringBillingPlans).limit(1);
    const [batch] = await db
      .insert(schema.recurringBillingBatches)
      .values({
        monthKey: "2026-12",
        invoiceDate: "2026-12-01",
        status: "draft",
        isDryRun: true,
      })
      .returning();

    await db.insert(schema.recurringBillingBatchItems).values({
      batchId: batch!.id,
      planId: plan!.id,
      monthKey: "2026-12",
      idempotencyKey: `gp-rec-2026-12-plan-${plan!.id}`,
      description: plan!.description,
      netCents: 175_00,
      taxCents: 24_50,
      totalCents: 199_50,
    });

    // Attempting a second batch item for the same (planId, monthKey) fails hard:
    await expect(
      db.insert(schema.recurringBillingBatchItems).values({
        batchId: batch!.id,
        planId: plan!.id,
        monthKey: "2026-12",
        idempotencyKey: `gp-rec-2026-12-plan-${plan!.id}-dup`,
        description: plan!.description,
        netCents: 175_00,
        taxCents: 24_50,
        totalCents: 199_50,
      })
    ).rejects.toThrow();
  });
});
