import Link from "next/link";
import {
  Building2,
  ChevronLeft,
  ChevronRight,
  CopyPlus,
  FileSearch,
  Filter,
  Search,
} from "lucide-react";
import { getDb } from "@/db";
import { customers } from "@/db/schema";
import { ensureSageCustomersLoaded } from "@/db/seed";
import { searchHistoricalSageInvoices } from "@/lib/sage-archive";
import { formatCAD } from "@/lib/money";

export const dynamic = "force-dynamic";

export default async function SageInvoicesArchivePage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    status?: string;
    year?: string;
    page?: string;
  }>;
}) {
  const params = await searchParams;
  const q = params.q ?? "";
  const status = params.status ?? "ALL";
  const year = params.year ?? "ALL";
  const requestedPage = Number(params.page) || 1;

  const db = await getDb();
  await ensureSageCustomersLoaded(db);
  const allCustomers = await db
    .select({
      id: customers.id,
      sageId: customers.sageId,
      name: customers.name,
    })
    .from(customers);

  const customerBySageId = new Map<string, { id: number; name: string }>();
  for (const c of allCustomers) {
    if (c.sageId) {
      customerBySageId.set(c.sageId, { id: c.id, name: c.name });
    }
  }

  const result = searchHistoricalSageInvoices({
    query: q,
    status,
    year,
    page: requestedPage,
    pageSize: 50,
  });

  function buildHref(overrides: {
    q?: string;
    status?: string;
    year?: string;
    page?: number;
  }) {
    const sp = new URLSearchParams();
    const nextQ = overrides.q !== undefined ? overrides.q : q;
    const nextStatus = overrides.status !== undefined ? overrides.status : status;
    const nextYear = overrides.year !== undefined ? overrides.year : year;
    const nextPage = overrides.page !== undefined ? overrides.page : 1;

    if (nextQ) sp.set("q", nextQ);
    if (nextStatus && nextStatus !== "ALL") sp.set("status", nextStatus);
    if (nextYear && nextYear !== "ALL") sp.set("year", nextYear);
    if (nextPage > 1) sp.set("page", String(nextPage));
    const qs = sp.toString();
    return qs ? `/sage-invoices?${qs}` : "/sage-invoices";
  }

  return (
    <div className="flex-1 flex flex-col min-h-0">
      {/* Goodshuffle Pro Top Bar */}
      <div className="bg-white border-b border-slate-200 px-6 h-16 flex items-center justify-between gap-4 shrink-0">
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-normal text-slate-600 tracking-tight">
            Past Sage Invoices &amp; Jobs
          </h1>
          <span className="text-xs text-slate-500 border-l border-slate-200 pl-3 tabular-nums font-medium">
            {result.statusCounts.ALL?.toLocaleString() ?? "10,356"} Historical Invoices (2022–2026)
          </span>
        </div>

        <div className="flex items-center gap-2">
          <Link
            href="/billing"
            className="inline-flex items-center gap-1.5 rounded-xs border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 font-semibold text-xs px-3 py-2 transition"
          >
            Active Billing Ledger →
          </Link>
        </div>
      </div>

      {/* Split Workspace: Left Filter Sidebar + Right Spreadsheet Table */}
      <div className="flex-1 flex flex-col lg:flex-row min-h-0">
        {/* Left Filter Sidebar */}
        <aside className="w-full lg:w-64 bg-white border-b lg:border-b-0 lg:border-r border-slate-200 p-4 space-y-5 shrink-0">
          <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
              <Filter className="w-3.5 h-3.5 text-slate-400" /> Archive Search
            </span>
            {(q || status !== "ALL" || year !== "ALL") && (
              <Link
                href="/sage-invoices"
                className="text-xs text-[#186ade] hover:underline font-medium"
              >
                Reset
              </Link>
            )}
          </div>

          <form action="/sage-invoices" method="get" className="space-y-2">
            {status !== "ALL" && <input type="hidden" name="status" value={status} />}
            {year !== "ALL" && <input type="hidden" name="year" value={year} />}
            <label
              htmlFor="sage-archive-search"
              className="block text-[11px] font-semibold uppercase tracking-wider text-slate-500"
            >
              Keyword, Client, or Invoice #
            </label>
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                id="sage-archive-search"
                type="text"
                name="q"
                defaultValue={q}
                placeholder="e.g. 230354, coroplast, tent…"
                className="w-full rounded-xs border border-slate-300 bg-white pl-8 pr-2.5 py-1.5 text-xs text-slate-800 focus:border-[#186ade] focus:outline-none"
              />
            </div>
            <button
              type="submit"
              className="w-full rounded-xs bg-[#186ade] hover:bg-[#1458b8] text-white font-semibold text-xs py-1.5 px-3 cursor-pointer transition"
            >
              Search 10,356 Invoices
            </button>
          </form>

          {/* Status Filter */}
          <div className="space-y-1 pt-2 border-t border-slate-100">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-2">
              Payment Status
            </div>
            {(
              [
                ["ALL", "All Invoices"],
                ["PAID", "Paid"],
                ["UNPAID", "Unpaid"],
                ["PART_PAID", "Partially Paid"],
                ["VOID", "Voided"],
              ] as const
            ).map(([stKey, stLabel]) => {
              const active = status === stKey;
              return (
                <Link
                  key={stKey}
                  href={buildHref({ status: stKey, page: 1 })}
                  className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-xs text-xs transition ${
                    active
                      ? "bg-blue-50 text-[#186ade] font-semibold"
                      : "text-slate-600 hover:bg-slate-50"
                  }`}
                >
                  <span>{stLabel}</span>
                  <span className="tabular-nums text-slate-400">
                    {(result.statusCounts[stKey] ?? 0).toLocaleString()}
                  </span>
                </Link>
              );
            })}
          </div>

          {/* Year Filter */}
          <div className="space-y-1 pt-2 border-t border-slate-100">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-2">
              Invoice Year
            </div>
            <div className="flex flex-wrap gap-1.5">
              <Link
                href={buildHref({ year: "ALL", page: 1 })}
                className={`px-2.5 py-1 rounded-xs text-xs font-semibold border transition ${
                  year === "ALL"
                    ? "bg-[#186ade] text-white border-[#186ade]"
                    : "bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100"
                }`}
              >
                All Years
              </Link>
              {result.years.map((yr) => (
                <Link
                  key={yr}
                  href={buildHref({ year: yr, page: 1 })}
                  className={`px-2.5 py-1 rounded-xs text-xs font-semibold border transition tabular-nums ${
                    year === yr
                      ? "bg-[#186ade] text-white border-[#186ade]"
                      : "bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100"
                  }`}
                >
                  {yr}
                </Link>
              ))}
            </div>
          </div>
        </aside>

        {/* Right Spreadsheet Data Table */}
        <div className="flex-1 flex flex-col bg-white min-w-0">
          <div className="flex-1 overflow-x-auto">
            {result.rows.length === 0 ? (
              <div className="p-12 text-center space-y-2">
                <FileSearch className="w-8 h-8 text-slate-300 mx-auto" />
                <div className="text-sm font-semibold text-slate-700">
                  No historical Sage invoices matched your search
                </div>
                <p className="text-xs text-slate-500">
                  Try searching by invoice number (e.g. 230354), client name, or sign material.
                </p>
              </div>
            ) : (
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-200 bg-[#f8fafc] text-[11px] font-bold text-slate-600">
                    <th className="py-3 px-4 border-r border-slate-200 w-28">Invoice #</th>
                    <th className="py-3 px-3.5 border-r border-slate-200 w-28">Date</th>
                    <th className="py-3 px-4 border-r border-slate-200 w-64">
                      Client Account
                    </th>
                    <th className="py-3 px-4 border-r border-slate-200">
                      Job Description &amp; Line Items
                    </th>
                    <th className="py-3 px-3.5 border-r border-slate-200 w-24">Status</th>
                    <th className="py-3 px-3.5 border-r border-slate-200 text-right w-28">
                      Net / Tax
                    </th>
                    <th className="py-3 px-3.5 border-r border-slate-200 text-right w-28">
                      Total
                    </th>
                    <th className="py-3 px-3.5 text-right w-28">Quick Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {result.rows.map((inv) => {
                    const matchedCustomer = customerBySageId.get(inv.customerSageId);
                    return (
                      <tr
                        key={inv.invoiceNumber}
                        className="hover:bg-blue-50/25 align-top transition"
                      >
                        <td className="py-3 px-4 border-r border-slate-200 tabular-nums">
                          <div className="font-bold text-slate-900">
                            #{inv.invoiceNumber}
                          </div>
                          {inv.reference && (
                            <div className="text-[11px] text-slate-500 mt-0.5">
                              PO: {inv.reference}
                            </div>
                          )}
                        </td>
                        <td className="py-3 px-3.5 border-r border-slate-200 tabular-nums text-slate-600 whitespace-nowrap">
                          {inv.date}
                        </td>
                        <td className="py-3 px-4 border-r border-slate-200">
                          <div className="flex items-start gap-2">
                            <Building2 className="w-3.5 h-3.5 text-slate-400 shrink-0 mt-0.5" />
                            <div className="min-w-0">
                              {matchedCustomer ? (
                                <Link
                                  href={`/customers/${matchedCustomer.id}`}
                                  className="font-semibold text-slate-800 hover:text-[#186ade] hover:underline"
                                >
                                  {matchedCustomer.name}
                                </Link>
                              ) : (
                                <span className="font-semibold text-slate-800">
                                  {inv.contactName}
                                </span>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="py-3 px-4 border-r border-slate-200">
                          {inv.lines.length === 0 ? (
                            <span className="text-slate-400">Historical Sage Invoice</span>
                          ) : (
                            <div className="space-y-1.5">
                              {inv.lines.map((line, idx) => (
                                <div
                                  key={idx}
                                  className="flex items-baseline justify-between gap-3 text-slate-800"
                                >
                                  <span className="font-medium leading-snug">
                                    {line.description}
                                  </span>
                                  <span className="text-[11px] text-slate-500 tabular-nums shrink-0">
                                    {line.quantity} × {formatCAD(line.unitPriceCents)}
                                  </span>
                                </div>
                              ))}
                            </div>
                          )}
                        </td>
                        <td className="py-3 px-3.5 border-r border-slate-200 whitespace-nowrap">
                          <span
                            className={`inline-flex text-[11px] font-bold uppercase px-2 py-0.5 rounded-xs border ${
                              inv.status === "PAID"
                                ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                                : inv.status === "UNPAID" || inv.status === "PART_PAID"
                                  ? "bg-amber-50 text-amber-800 border-amber-200"
                                  : "bg-slate-100 text-slate-600 border-slate-200"
                            }`}
                          >
                            {inv.status.replace("_", " ")}
                          </span>
                        </td>
                        <td className="py-3 px-3.5 border-r border-slate-200 text-right tabular-nums text-slate-600 whitespace-nowrap">
                          <div>{formatCAD(inv.subtotalCents)}</div>
                          <div className="text-[11px] text-slate-400">
                            +{formatCAD(inv.taxCents)} tax
                          </div>
                        </td>
                        <td className="py-3 px-3.5 border-r border-slate-200 text-right tabular-nums font-bold text-slate-900 whitespace-nowrap">
                          {formatCAD(inv.totalCents)}
                        </td>
                        <td className="py-3 px-3.5 text-right whitespace-nowrap">
                          <Link
                            href={
                              matchedCustomer
                                ? `/projects/new?customerId=${matchedCustomer.id}&fromSageInvoice=${inv.invoiceNumber}`
                                : `/projects/new?fromSageInvoice=${inv.invoiceNumber}`
                            }
                            className="inline-flex items-center gap-1 rounded-xs border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 font-semibold text-[11px] px-2.5 py-1 transition"
                          >
                            <CopyPlus className="w-3 h-3 text-[#186ade]" />
                            Re-Quote
                          </Link>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>

          {/* Sticky Totals & Pagination Footer */}
          <div className="bg-[#f8fafc] border-t border-slate-200 px-6 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-slate-600 shrink-0">
            <div className="flex flex-wrap items-center gap-4 tabular-nums">
              <span>
                Showing{" "}
                <span className="font-semibold text-slate-800">
                  {result.totalCount === 0
                    ? 0
                    : (result.page - 1) * result.pageSize + 1}
                  –
                  {Math.min(result.page * result.pageSize, result.totalCount)}
                </span>{" "}
                of{" "}
                <span className="font-semibold text-slate-800">
                  {result.totalCount.toLocaleString()}
                </span>{" "}
                matching invoices
              </span>
              <span className="text-slate-300">|</span>
              <span>
                Net:{" "}
                <span className="font-semibold text-slate-800">
                  {formatCAD(result.totalNetCents)}
                </span>
              </span>
              <span>
                Tax:{" "}
                <span className="font-semibold text-slate-800">
                  {formatCAD(result.totalTaxCents)}
                </span>
              </span>
              <span>
                Gross Total:{" "}
                <span className="font-bold text-slate-900">
                  {formatCAD(result.totalGrossCents)}
                </span>
              </span>
            </div>

            {result.totalPages > 1 && (
              <div className="flex items-center gap-2">
                {result.page > 1 ? (
                  <Link
                    href={buildHref({ page: result.page - 1 })}
                    className="inline-flex items-center gap-1 rounded-xs border border-slate-300 bg-white hover:bg-slate-50 px-2.5 py-1 font-semibold text-slate-700"
                  >
                    <ChevronLeft className="w-3.5 h-3.5" /> Prev
                  </Link>
                ) : (
                  <span className="inline-flex items-center gap-1 rounded-xs border border-slate-200 bg-slate-100 opacity-50 px-2.5 py-1 font-semibold text-slate-400">
                    <ChevronLeft className="w-3.5 h-3.5" /> Prev
                  </span>
                )}
                <span className="tabular-nums font-medium px-2">
                  Page {result.page} of {result.totalPages.toLocaleString()}
                </span>
                {result.page < result.totalPages ? (
                  <Link
                    href={buildHref({ page: result.page + 1 })}
                    className="inline-flex items-center gap-1 rounded-xs border border-slate-300 bg-white hover:bg-slate-50 px-2.5 py-1 font-semibold text-slate-700"
                  >
                    Next <ChevronRight className="w-3.5 h-3.5" />
                  </Link>
                ) : (
                  <span className="inline-flex items-center gap-1 rounded-xs border border-slate-200 bg-slate-100 opacity-50 px-2.5 py-1 font-semibold text-slate-400">
                    Next <ChevronRight className="w-3.5 h-3.5" />
                  </span>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
