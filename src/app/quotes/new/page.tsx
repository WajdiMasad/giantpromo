import { asc } from "drizzle-orm";
import { getDb } from "@/db";
import { customers } from "@/db/schema";
import { QuoteBuilderForm } from "@/components/QuoteBuilderForm";

export const dynamic = "force-dynamic";

export default async function NewQuotePage() {
  const db = await getDb();
  const customerList = await db
    .select()
    .from(customers)
    .orderBy(asc(customers.name));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Build New Quote</h1>
        <p className="text-sm text-slate-600 mt-0.5">
          Select a Sage customer, add line items (or use the built-in Vinyl / Banner / Corex Calculator), and generate an online approval link.
        </p>
      </div>

      <QuoteBuilderForm customers={customerList} />
    </div>
  );
}
