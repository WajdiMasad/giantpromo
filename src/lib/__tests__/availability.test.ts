import { describe, expect, it, beforeEach } from "vitest";
import { getDb, resetDbForTests } from "@/db";
import { seedInitialDataIfEmpty } from "@/db/seed";
import {
  customers,
  equipment,
  equipmentRentals,
  projectItems,
  projects,
} from "@/db/schema";
import {
  checkEquipmentConflict,
  datesOverlap,
  getFleetAvailability,
} from "../availability";

describe("Goodshuffle Pro-style Equipment Availability Engine", () => {
  beforeEach(async () => {
    process.env.PGLITE_MEMORY = "1";
    resetDbForTests();
    const db = await getDb();
    await seedInitialDataIfEmpty(db);
  });

  it("calculates date interval overlaps accurately, including ongoing monthly leases", () => {
    // Non-overlapping
    expect(datesOverlap("2026-11-01", "2026-11-10", "2026-11-15", "2026-11-30")).toBe(false);
    expect(datesOverlap("2026-11-20", "2026-11-25", "2026-11-01", "2026-11-15")).toBe(false);

    // Overlapping
    expect(datesOverlap("2026-11-01", "2026-11-15", "2026-11-10", "2026-11-20")).toBe(true);
    expect(datesOverlap("2026-11-01", "2026-11-15", "2026-11-15", "2026-11-20")).toBe(true);

    // Ongoing leases (null/blank end date)
    expect(datesOverlap("2026-09-01", null, "2026-12-01", "2026-12-31")).toBe(true);
    expect(datesOverlap("2026-12-01", "2026-12-31", "2026-09-01", "")).toBe(true);
  });

  it("detects 🟢 Available vs 🔴 Hard Conflict on active rental bookings", async () => {
    const db = await getDb();

    // 1. MS-003 is unbooked in seed -> should be available
    const [ms3] = await db
      .select()
      .from(equipment)
      .where(equipment.code ? undefined : undefined);
    const ms3Unit = (await db.select().from(equipment)).find((e) => e.code === "MS-003")!;
    expect(ms3Unit).toBeDefined();

    const availRes = await checkEquipmentConflict(db, {
      equipmentId: ms3Unit.id,
      startDate: "2026-12-01",
      endDate: "2026-12-31",
    });
    expect(availRes.status).toBe("available");
    expect(availRes.summary).toContain("Available in yard");

    // 2. MS-001 is actively rented to Steele Auto from 2026-09-01 ongoing
    const ms1Unit = (await db.select().from(equipment)).find((e) => e.code === "MS-001")!;
    expect(ms1Unit).toBeDefined();

    const conflictRes = await checkEquipmentConflict(db, {
      equipmentId: ms1Unit.id,
      startDate: "2026-12-01",
      endDate: "2026-12-31",
    });
    expect(conflictRes.status).toBe("hard_conflict");
    expect(conflictRes.summary).toContain("Already booked for Steele Auto Group");
    expect(conflictRes.details?.customerName).toBe("Steele Auto Group");
  });

  it("detects 🟡 Potential Conflict when an item is placed on an open draft quote", async () => {
    const db = await getDb();
    const ms3Unit = (await db.select().from(equipment)).find((e) => e.code === "MS-003")!;
    const [cust] = await db.select().from(customers).limit(1);

    // Create a draft quote proposing MS-003 for Nov 20-25
    const [quote] = await db
      .insert(projects)
      .values({
        quoteNumber: "Q-TEST-CONFLICT",
        publicToken: "qtok-test-conflict",
        idempotencyKey: "test-conflict-key-1",
        customerId: cust!.id,
        title: "Tentative Event Rental",
        status: "quote_sent",
        validUntil: "2026-11-30",
      })
      .returning();

    await db.insert(projectItems).values({
      jobId: quote!.id,
      description: "MS-003 Mobile Sign Trailer Rental",
      equipmentId: ms3Unit.id,
      rentalStartDate: "2026-11-20",
      rentalEndDate: "2026-11-25",
      unitPriceCents: 150_00,
      netCents: 150_00,
      taxCents: 21_00,
      totalCents: 171_00,
    });

    // Checking MS-003 for Nov 22-24 should report a POTENTIAL conflict
    const res = await checkEquipmentConflict(db, {
      equipmentId: ms3Unit.id,
      startDate: "2026-11-22",
      endDate: "2026-11-24",
    });
    expect(res.status).toBe("potential_conflict");
    expect(res.summary).toContain("Held on Quote Q-TEST-CONFLICT");
    expect(res.summary).toContain(cust!.name);

    // But if we exclude this draft quote (e.g. while editing it), it should be available
    const excludedRes = await checkEquipmentConflict(db, {
      equipmentId: ms3Unit.id,
      startDate: "2026-11-22",
      endDate: "2026-11-24",
      excludeProjectId: quote!.id,
    });
    expect(excludedRes.status).toBe("available");
  });

  it("flags maintenance units and returns fleet availability in batch", async () => {
    const db = await getDb();
    const [cust] = await db.select().from(customers).limit(1);

    // Create a temporary unit in maintenance
    const [maintUnit] = await db
      .insert(equipment)
      .values({
        code: "MS-MAINT-TEST",
        name: "Mobile Sign Unit in Shop",
        status: "maintenance",
        conditionNotes: "Welding trailer hitch bracket",
      })
      .returning();

    const maintRes = await checkEquipmentConflict(db, {
      equipmentId: maintUnit!.id,
      startDate: "2026-12-01",
      endDate: "2026-12-10",
    });
    expect(maintRes.status).toBe("maintenance");
    expect(maintRes.summary).toContain("Welding trailer hitch bracket");

    // Fleet availability batch check
    const fleet = await getFleetAvailability(db, {
      startDate: "2026-12-01",
      endDate: "2026-12-10",
    });
    expect(fleet.length).toBeGreaterThanOrEqual(6);
    const ms1 = fleet.find((f) => f.equipment.code === "MS-001");
    expect(ms1?.availability.status).toBe("hard_conflict");
  });
});
