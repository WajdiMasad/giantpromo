import Link from "next/link";
import { asc } from "drizzle-orm";
import { ArrowLeft } from "lucide-react";
import { getDb } from "@/db";
import { customers } from "@/db/schema";
import { ensureSageCustomersLoaded } from "@/db/seed";
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
  await ensureSageCustomersLoaded(db);
  const customerList = await db.select().from(customers).orderBy(asc(customers.name));

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <div className="bg-white border-b border-slate-200 px-6 h-16 flex items-center justify-between gap-4 shrink-0">
        <div className="flex items-center gap-3">
          <Link
            href="/projects"
            className="inline-flex items-center gap-1 text-xs font-semibold text-slate-500 hover:text-slate-800"
          >
            <ArrowLeft className="w-3.5 h-3.5" /> Projects
          </Link>
          <span className="text-slate-300">/</span>
          <h1 className="text-xl font-normal text-slate-600 tracking-tight">
            Create New Project
          </h1>
        </div>
      </div>

      <div className="p-6 max-w-7xl w-full mx-auto">
        <QuoteBuilderForm customers={customerList} initialCustomerId={requestedCustomerId} />
      </div>
    </div>
  );
}
