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
          Customers (Synced with Sage Contacts)
        </h1>
        <p className="text-sm text-slate-600 mt-0.5">
          Sage is the master customer list, enriched with site access notes and Halifax / Atlantic install coordinates.
        </p>
      </div>

      <CustomersClient customers={list} />
    </div>
  );
}
