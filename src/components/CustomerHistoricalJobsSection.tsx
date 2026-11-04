"use client";

import React, { useMemo, useState } from "react";
import Link from "next/link";
import {
  ChevronLeft,
  ChevronRight,
  CopyPlus,
  FileText,
  Search,
} from "lucide-react";
import type { HistoricalSageInvoice } from "@/lib/sage-archive";
import { formatCAD } from "@/lib/money";

const PAGE_SIZE = 25;

export function CustomerHistoricalJobsSection({
  customerId,
  customerName,
  invoices,
}: {
  customerId: number;
  customerName: string;
  invoices: HistoricalSageInvoice[];
}) {
  const [search, setSearch] = useState("");
  const [yearFilter, setYearFilter] = useState("ALL");
  const [page, setPage] = useState(1);

  const years = useMemo(() => {
    const set = new Set<string>();
    for (const inv of invoices) {
      if (inv.date && inv.date.length >= 4) {
        set.add(inv.date.slice(0, 4));
      }
    }
    return Array.from(set).sort((a, b) => b.localeCompare(a));
  }, [invoices]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return invoices.filter((inv) => {
      if (yearFilter !== "ALL" && !inv.date.startsWith(yearFilter)) return false;
      if (!q) return true;
      if (inv.invoiceNumber.toLowerCase().includes(q)) return true;
      if (inv.reference.toLowerCase().includes(q)) return true;
      if (inv.date.includes(q)) return true;
      return inv.lines.some((l) => l.description.toLowerCase().includes(q));
    });
  }, [invoices, search, yearFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const startIdx = (safePage - 1) * PAGE_SIZE;
  const pageRows = filtered.slice(startIdx, startIdx + PAGE_SIZE);

  const filteredTotalCents = useMemo(
    () =>
      filtered
        .filter((i) => i.status !== "VOID")
        .reduce((sum, i) => sum + i.totalCents, 0),
    [filtered]
  );

  if (invoices.length === 0) {
    return (
      <div className="rounded-xs bg-white border border-slate-200 shadow-2xs p-6 text-center text-xs text-slate-500">
        No past Sage invoices on file for {customerName}.
      </div>
    );
  }

  return (
    <div className="rounded-xs bg-white border border-slate-200 shadow-2xs overflow-hidden">
      {/* Header & Search Filter */}
      <div className="bg-[#f8fafc] border-b border-slate-200 px-4 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 flex-wrap">
          <FileText className="w-4 h-4 text-[#186ade]" />
          <h2 className="text-xs font-bold uppercase tracking-wider text-slate-700">
            Previous Jobs &amp; Sage Invoices ({filtered.length} of {invoices.length})
          </h2>
          <span className="text-xs font-semibold text-slate-500 tabular-nums">
            • {formatCAD(filteredTotalCents)} total billed
          </span>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {years.length > 1 && (
            <select
              value={yearFilter}
              onChange={(e) => {
                setYearFilter(e.target.value);
                setPage(1);
              }}
              className="rounded-xs border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-700 font-medium"
            >
              <option value="ALL">All Years ({invoices.length})</option>
              {years.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          )}

          <div className="relative w-full sm:w-64">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              placeholder="Search past jobs, items, or invoice #…"
              className="w-full rounded-xs border border-slate-300 bg-white pl-8 pr-2.5 py-1.5 text-xs text-slate-800 focus:border-[#186ade] focus:outline-none"
            />
          </div>
        </div>
      </div>

      {/* Jobs & Line Items Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse text-xs">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50/70 text-[11px] font-semibold text-slate-500">
              <th className="py-2.5 px-4 border-r border-slate-200 w-28">Invoice / Job #</th>
              <th className="py-2.5 px-3.5 border-r border-slate-200 w-28">Date</th>
              <th className="py-2.5 px-4 border-r border-slate-200">
                Job Description &amp; Line Items
              </th>
              <th className="py-2.5 px-3.5 border-r border-slate-200 w-24">Status</th>
              <th className="py-2.5 px-3.5 border-r border-slate-200 text-right w-28">
                Net / Tax
              </th>
              <th className="py-2.5 px-3.5 border-r border-slate-200 text-right w-28">
                Total
              </th>
              <th className="py-2.5 px-3.5 text-right w-28">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {pageRows.map((inv) => (
              <tr key={inv.invoiceNumber} className="hover:bg-blue-50/25 align-top transition">
                <td className="py-3 px-4 border-r border-slate-200 tabular-nums">
                  <div className="font-bold text-slate-900">#{inv.invoiceNumber}</div>
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
                    href={`/projects/new?customerId=${customerId}&fromSageInvoice=${inv.invoiceNumber}`}
                    className="inline-flex items-center gap-1 rounded-xs border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 font-semibold text-[11px] px-2.5 py-1 transition"
                    title="Create a new quote pre-filled with this job's items"
                  >
                    <CopyPlus className="w-3 h-3 text-[#186ade]" />
                    Re-Quote
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination Footer */}
      {totalPages > 1 && (
        <div className="bg-[#f8fafc] border-t border-slate-200 px-4 py-2.5 flex items-center justify-between text-xs text-slate-600">
          <div className="tabular-nums">
            Showing {startIdx + 1}–{Math.min(startIdx + PAGE_SIZE, filtered.length)} of{" "}
            {filtered.length} past jobs
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={safePage <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="inline-flex items-center gap-1 rounded-xs border border-slate-300 bg-white hover:bg-slate-50 disabled:opacity-40 px-2.5 py-1 font-semibold text-slate-700 cursor-pointer"
            >
              <ChevronLeft className="w-3.5 h-3.5" /> Prev
            </button>
            <span className="tabular-nums font-medium px-2">
              Page {safePage} of {totalPages}
            </span>
            <button
              type="button"
              disabled={safePage >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              className="inline-flex items-center gap-1 rounded-xs border border-slate-300 bg-white hover:bg-slate-50 disabled:opacity-40 px-2.5 py-1 font-semibold text-slate-700 cursor-pointer"
            >
              Next <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
