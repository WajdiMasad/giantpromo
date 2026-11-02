import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { Eye, ExternalLink, FileCheck2, Plus, Send } from "lucide-react";
import { getDb } from "@/db";
import { customers, jobs, quotes } from "@/db/schema";
import { formatCAD } from "@/lib/money";

export const dynamic = "force-dynamic";

export default async function QuotesListPage() {
  const db = await getDb();

  const rows = await db
    .select({
      quote: quotes,
      customer: customers,
      jobNumber: jobs.jobNumber,
      jobId: jobs.id,
    })
    .from(quotes)
    .innerJoin(customers, eq(quotes.customerId, customers.id))
    .leftJoin(jobs, eq(jobs.quoteId, quotes.id))
    .orderBy(desc(quotes.id));

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Quotes & Online Approvals</h1>
          <p className="text-sm text-slate-600 mt-0.5">
            Send customers a branded link to view and approve online. Approval automatically creates the Job & allocates its Sage Invoice #.
          </p>
        </div>
        <Link
          href="/quotes/new"
          className="inline-flex items-center gap-2 rounded-xl bg-slate-950 hover:bg-slate-800 text-white font-semibold text-sm px-4 py-2.5 transition"
        >
          <Plus className="w-4 h-4 text-amber-400" />
          New Quote
        </Link>
      </div>

      <div className="rounded-2xl bg-white border border-slate-200/90 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/70 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                <th className="py-3.5 px-4">Quote #</th>
                <th className="py-3.5 px-4">Customer & Project</th>
                <th className="py-3.5 px-4">Province / Tax</th>
                <th className="py-3.5 px-4">Status & Tracking</th>
                <th className="py-3.5 px-4">Linked Sage Job</th>
                <th className="py-3.5 px-4 text-right">Total</th>
                <th className="py-3.5 px-4 text-right">Customer Portal</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map(({ quote, customer, jobNumber, jobId }) => (
                <tr key={quote.id} className="hover:bg-slate-50/80 transition">
                  <td className="py-4 px-4 font-mono font-bold text-xs text-slate-900">
                    {quote.quoteNumber}
                  </td>
                  <td className="py-4 px-4">
                    <div className="font-semibold text-slate-900">{quote.title}</div>
                    <div className="text-xs text-slate-500 mt-0.5">
                      {customer.name} {quote.poReference ? `• PO: ${quote.poReference}` : ""}
                    </div>
                  </td>
                  <td className="py-4 px-4 text-xs text-slate-600">
                    <span className="font-semibold text-slate-800">{quote.siteProvince}</span>{" "}
                    ({quote.taxLabel})
                  </td>
                  <td className="py-4 px-4">
                    {quote.status === "approved" ? (
                      <div className="space-y-0.5">
                        <span className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                          <FileCheck2 className="w-3.5 h-3.5" /> Approved
                        </span>
                        <div className="text-[11px] text-slate-500">
                          Signed by {quote.approvedByName}
                        </div>
                      </div>
                    ) : quote.status === "viewed" ? (
                      <div className="space-y-0.5">
                        <span className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200">
                          <Eye className="w-3.5 h-3.5" /> Viewed by Customer
                        </span>
                        {quote.firstViewedAt && (
                          <div className="text-[11px] text-slate-500">
                            Opened {new Date(quote.firstViewedAt).toLocaleDateString("en-CA")}
                          </div>
                        )}
                      </div>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200 uppercase">
                        <Send className="w-3 h-3" /> {quote.status}
                      </span>
                    )}
                  </td>
                  <td className="py-4 px-4">
                    {jobId ? (
                      <Link
                        href={`/jobs/${jobId}`}
                        className="inline-flex items-center gap-1 font-mono text-xs font-bold px-2.5 py-1 rounded-lg bg-slate-900 text-amber-400 hover:bg-slate-800"
                      >
                        {jobNumber ? `Job #${jobNumber}` : "⏳ Pending Sage #"}
                      </Link>
                    ) : (
                      <span className="text-xs text-slate-400">Awaiting approval</span>
                    )}
                  </td>
                  <td className="py-4 px-4 text-right font-bold text-slate-900">
                    {formatCAD(quote.totalCents)}
                  </td>
                  <td className="py-4 px-4 text-right">
                    <Link
                      href={`/q/${quote.publicToken}`}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-800 font-semibold text-xs px-3 py-1.5 transition"
                    >
                      Approval Link <ExternalLink className="w-3.5 h-3.5 text-amber-600" />
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
