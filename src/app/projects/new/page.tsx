import { asc } from "drizzle-orm";
import { getDb } from "@/db";
import { customers } from "@/db/schema";
import { QuoteBuilderForm } from "@/components/QuoteBuilderForm";

export const dynamic = "force-dynamic";

export default async function NewProjectPage({
  searchParams,
}: {
  searchParams: Promise<{ customerId?: string }>;
}) {
  const params = await searchParams;
  const requestedCustomerId = params.customerId ? Number(params.customerId) : undefined;

  const db = await getDb();
  const customerList = await db.select().from(customers).orderBy(asc(customers.name));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">New project</h1>
        <p className="text-sm text-slate-600 mt-0.5">
          Pick a customer and add line items (the built-in Vinyl / Banner / Corex calculator helps price signs).
          Save it as a draft, or mark it sent to the client. It becomes a Sage-numbered job the moment they sign.
        </p>
      </div>

      <QuoteBuilderForm customers={customerList} initialCustomerId={requestedCustomerId} />
    </div>
  );
}
