import { asc } from "drizzle-orm";
import { getDb } from "@/db";
import { customers } from "@/db/schema";
import { ensureSageCustomersLoaded } from "@/db/seed";
import { CustomersClient } from "@/components/CustomersClient";

export const dynamic = "force-dynamic";

export default async function CustomersPage() {
  const db = await getDb();
  await ensureSageCustomersLoaded(db);
  const list = await db
    .select()
    .from(customers)
    .orderBy(asc(customers.name));

  return <CustomersClient customers={list} />;
}
