import { asc } from "drizzle-orm";
import { getDb } from "@/db";
import { customers } from "@/db/schema";
import { CustomersClient } from "@/components/CustomersClient";

export const dynamic = "force-dynamic";

export default async function CustomersPage() {
  const db = await getDb();
  const list = await db
    .select()
    .from(customers)
    .orderBy(asc(customers.name));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">
          Customers
        </h1>
        <p className="text-sm text-slate-600 mt-0.5">
          Everyone you quote, bill or rent to, with site access notes and install locations.
        </p>
      </div>

      <CustomersClient customers={list} />
    </div>
  );
}
