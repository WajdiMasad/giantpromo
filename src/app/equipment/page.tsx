import { asc, desc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { customers, equipment, equipmentRentals } from "@/db/schema";
import { EquipmentClientView } from "@/components/EquipmentClientView";

export const dynamic = "force-dynamic";

export default async function EquipmentPage() {
  const db = await getDb();

  const equipmentList = await db
    .select()
    .from(equipment)
    .orderBy(asc(equipment.code));

  const rentalRows = await db
    .select({
      rental: equipmentRentals,
      equip: equipment,
      customer: customers,
    })
    .from(equipmentRentals)
    .innerJoin(equipment, eq(equipmentRentals.equipmentId, equipment.id))
    .innerJoin(customers, eq(equipmentRentals.customerId, customers.id))
    .orderBy(desc(equipmentRentals.startDate));

  const customerList = await db
    .select({
      id: customers.id,
      name: customers.name,
      addressLine1: customers.addressLine1,
      city: customers.city,
    })
    .from(customers)
    .orderBy(asc(customers.name));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">
          Equipment Rentals, Booking Calendar & Live Map
        </h1>
        <p className="text-sm text-slate-600 mt-0.5">
          Database-enforced double-booking protection. Returning an item automatically stops its monthly recurring billing plan.
        </p>
      </div>

      <EquipmentClientView
        equipmentList={equipmentList}
        rentals={rentalRows.map(({ rental, equip, customer }) => ({
          id: rental.id,
          equipmentId: equip.id,
          equipmentCode: equip.code,
          equipmentName: equip.name,
          customerName: customer.name,
          startDate: rental.startDate,
          endDate: rental.endDate,
          monthlyRateCents: rental.monthlyRateCents,
          locationAddress: rental.locationAddress,
          lat: rental.lat ?? 44.668,
          lng: rental.lng ?? -63.61,
          status: rental.status,
          notes: rental.notes ?? "",
        }))}
        customers={customerList}
      />
    </div>
  );
}
