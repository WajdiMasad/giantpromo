import { and, desc, eq, inArray, ne } from "drizzle-orm";
import type { AppDatabase } from "@/db";
import {
  customers,
  equipment,
  equipmentRentals,
  projectItems,
  projects,
  type Equipment,
} from "@/db/schema";

export type EquipmentAvailabilityStatus =
  | "available"
  | "potential_conflict"
  | "hard_conflict"
  | "maintenance"
  | "retired";

export interface ConflictDetails {
  kind: "rental" | "signed_job" | "draft_quote" | "maintenance" | "retired";
  refNumber?: string;
  customerName?: string;
  startDate?: string;
  endDate?: string | null;
  locationAddress?: string;
  notes?: string;
  validUntil?: string | null;
}

export interface AvailabilityResult {
  status: EquipmentAvailabilityStatus;
  summary: string;
  details?: ConflictDetails;
}

export interface FleetUnitWithAvailability {
  equipment: Equipment;
  availability: AvailabilityResult;
}

/** Check if two inclusive ISO date ranges [s1, e1] and [s2, e2] overlap. Null endDate means open-ended ongoing. */
export function datesOverlap(
  s1: string,
  e1: string | null | undefined,
  s2: string,
  e2: string | null | undefined
): boolean {
  const end1 = e1 && e1.trim() !== "" ? e1 : "9999-12-31";
  const end2 = e2 && e2.trim() !== "" ? e2 : "9999-12-31";
  return s1 <= end2 && end1 >= s2;
}

/**
 * Real-time Goodshuffle Pro-style conflict detection engine for Giant Promotions fleet.
 * Determines whether a specific equipment unit is:
 *  - 🟢 Available (in yard at 3797 Mackintosh St)
 *  - 🟡 Potential Conflict (held on another open, unsigned draft quote)
 *  - 🔴 Hard Conflict (booked on an active/scheduled rental or signed job)
 *  - 🟠 Maintenance / Out of service
 */
export async function checkEquipmentConflict(
  db: AppDatabase,
  params: {
    equipmentId: number;
    startDate: string; // YYYY-MM-DD
    endDate?: string | null; // YYYY-MM-DD (null = open-ended monthly)
    excludeProjectId?: number;
  }
): Promise<AvailabilityResult> {
  const { equipmentId, startDate, endDate, excludeProjectId } = params;

  // 1. Fetch equipment unit
  const [unit] = await db
    .select()
    .from(equipment)
    .where(eq(equipment.id, equipmentId))
    .limit(1);

  if (!unit) {
    return {
      status: "retired",
      summary: `Equipment #${equipmentId} not found in fleet catalogue`,
      details: { kind: "retired" },
    };
  }

  if (unit.status === "retired") {
    return {
      status: "retired",
      summary: `${unit.code} (${unit.name}) has been retired from active service`,
      details: { kind: "retired", notes: unit.conditionNotes || "" },
    };
  }

  if (unit.status === "maintenance") {
    return {
      status: "maintenance",
      summary: `${unit.code} is currently in yard maintenance: ${unit.conditionNotes || "Under repair/cleaning"}`,
      details: {
        kind: "maintenance",
        notes: unit.conditionNotes || "In yard maintenance",
      },
    };
  }

  // 2. Check Hard Conflict: Active / scheduled equipment rentals in equipment_rentals table
  const activeRentals = await db
    .select({
      rental: equipmentRentals,
      customer: customers,
    })
    .from(equipmentRentals)
    .innerJoin(customers, eq(equipmentRentals.customerId, customers.id))
    .where(
      and(
        eq(equipmentRentals.equipmentId, equipmentId),
        inArray(equipmentRentals.status, ["active", "scheduled"])
      )
    )
    .orderBy(desc(equipmentRentals.startDate));

  for (const { rental, customer } of activeRentals) {
    if (datesOverlap(startDate, endDate, rental.startDate, rental.endDate)) {
      const ongoing = !rental.endDate || rental.endDate.trim() === "";
      return {
        status: "hard_conflict",
        summary: `Already booked for ${customer.name} (${rental.startDate} → ${ongoing ? "Ongoing" : rental.endDate})`,
        details: {
          kind: "rental",
          customerName: customer.name,
          startDate: rental.startDate,
          endDate: rental.endDate,
          locationAddress: rental.locationAddress,
          notes: rental.notes || undefined,
        },
      };
    }
  }

  // 3. Check Hard Conflict: Signed / approved projects with equipment line items
  const signedProjectRows = await db
    .select({
      item: projectItems,
      project: projects,
      customer: customers,
    })
    .from(projectItems)
    .innerJoin(projects, eq(projectItems.jobId, projects.id))
    .innerJoin(customers, eq(projects.customerId, customers.id))
    .where(
      and(
        eq(projectItems.equipmentId, equipmentId),
        inArray(projects.status, [
          "approved",
          "scheduled",
          "in_progress",
          "installed",
          "invoiced",
          "paid",
        ]),
        excludeProjectId ? ne(projects.id, excludeProjectId) : undefined
      )
    );

  for (const { item, project, customer } of signedProjectRows) {
    const itemStart =
      item.rentalStartDate || project.scheduledDate || new Date().toISOString().slice(0, 10);
    const itemEnd = item.rentalEndDate;
    if (datesOverlap(startDate, endDate, itemStart, itemEnd)) {
      const ongoing = !itemEnd || itemEnd.trim() === "";
      return {
        status: "hard_conflict",
        summary: `Booked on Job #${project.jobNumber || project.quoteNumber} for ${customer.name} (${itemStart} → ${ongoing ? "Ongoing" : itemEnd})`,
        details: {
          kind: "signed_job",
          refNumber: project.jobNumber || project.quoteNumber,
          customerName: customer.name,
          startDate: itemStart,
          endDate: itemEnd,
          locationAddress: project.siteAddress || undefined,
        },
      };
    }
  }

  // 4. Check Potential Conflict: Open draft quotes in flight (new, quote_sent, action_needed)
  const openQuoteRows = await db
    .select({
      item: projectItems,
      project: projects,
      customer: customers,
    })
    .from(projectItems)
    .innerJoin(projects, eq(projectItems.jobId, projects.id))
    .innerJoin(customers, eq(projects.customerId, customers.id))
    .where(
      and(
        eq(projectItems.equipmentId, equipmentId),
        inArray(projects.status, ["new", "quote_sent", "action_needed"]),
        excludeProjectId ? ne(projects.id, excludeProjectId) : undefined
      )
    );

  for (const { item, project, customer } of openQuoteRows) {
    const itemStart =
      item.rentalStartDate || project.scheduledDate || new Date().toISOString().slice(0, 10);
    const itemEnd = item.rentalEndDate;
    if (datesOverlap(startDate, endDate, itemStart, itemEnd)) {
      const ongoing = !itemEnd || itemEnd.trim() === "";
      return {
        status: "potential_conflict",
        summary: `Held on Quote ${project.quoteNumber} for ${customer.name} (${itemStart} → ${ongoing ? "Ongoing" : itemEnd}${project.validUntil ? ` • quote valid until ${project.validUntil}` : ""})`,
        details: {
          kind: "draft_quote",
          refNumber: project.quoteNumber,
          customerName: customer.name,
          startDate: itemStart,
          endDate: itemEnd,
          validUntil: project.validUntil,
        },
      };
    }
  }

  // 5. No conflict: Unit is available in yard!
  return {
    status: "available",
    summary: "Available in yard at 3797 Mackintosh St (Ready for deployment)",
  };
}

/**
 * Returns the entire fleet catalogue annotated with real-time availability for the specified date window.
 */
export async function getFleetAvailability(
  db: AppDatabase,
  params: {
    startDate: string;
    endDate?: string | null;
    excludeProjectId?: number;
  }
): Promise<FleetUnitWithAvailability[]> {
  const allUnits = await db.select().from(equipment).orderBy(equipment.code);

  const results: FleetUnitWithAvailability[] = [];
  for (const unit of allUnits) {
    const availability = await checkEquipmentConflict(db, {
      equipmentId: unit.id,
      startDate: params.startDate,
      endDate: params.endDate,
      excludeProjectId: params.excludeProjectId,
    });
    results.push({ equipment: unit, availability });
  }

  return results;
}
