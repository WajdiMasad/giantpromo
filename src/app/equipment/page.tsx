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
    <div className="flex-1 flex flex-col min-h-0">
      <div className="bg-white border-b border-slate-200 px-6 h-16 flex items-center justify-between gap-4 shrink-0">
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-normal text-slate-600 tracking-tight">
            Inventory &amp; Fleet Map
          </h1>
          <span className="text-xs text-slate-400 border-l border-slate-200 pl-3 tabular-nums">
            {equipmentList.length} Fleet Units • {rentalRows.length} Active Deployments
          </span>
        </div>
      </div>

      <div className="p-6 max-w-7xl w-full mx-auto">
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
    </div>
  );
}
