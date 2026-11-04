"use client";

import React, { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import {
  AlertCircle,
  CheckCircle2,
  Receipt,
  Search,
  X,
} from "lucide-react";
import { recordPaymentAction } from "@/app/actions";
import { centsToDecimalString, formatCAD } from "@/lib/money";
import type { PaymentMethod } from "@/db/schema";

export interface InvoiceRow {
  id: number;
  invoiceNumber: string;
  projectId: number | null;
  customerId: number;
  customerName: string;
  customerEmail: string | null;
  projectTitle: string;
  status: string; // draft, issued, void
  issueDate: string | null;
  dueDate: string | null;
  totalCents: number;
  paidCents: number;
  balanceCents: number;
  isOverdue: boolean;
  daysOverdue: number;
  agingBucket: "current" | "1_30" | "31_60" | "60_plus";
  paymentsCount: number;
}

export function BillingLedgerClient({
  invoices,
}: {
  invoices: InvoiceRow[];
}) {
  const [filter, setFilter] = useState<"all" | "unpaid" | "overdue" | "paid" | "draft">("unpaid");
  const [search, setSearch] = useState("");
  const [isPending, startTransition] = useTransition();

  // Payment Recording Modal State
  const [activePaymentInvoice, setActivePaymentInvoice] = useState<InvoiceRow | null>(null);
  const [payAmountDollars, setPayAmountDollars] = useState("");
  const [payMethod, setPayMethod] = useState<PaymentMethod>("etransfer");
  const [payReference, setPayReference] = useState("");
  const [payDate, setPayDate] = useState(new Date().toISOString().slice(0, 10));
  const [paymentFeedback, setPaymentFeedback] = useState<string | null>(null);
  const [paymentError, setPaymentError] = useState<string | null>(null);

  // Financial Metrics
  const metrics = useMemo(() => {
    let totalAR = 0;
    let overdueAR = 0;
    let overdueCount = 0;
    let currentAR = 0;
    let over30AR = 0;

    for (const inv of invoices) {
      if (inv.status === "issued" && inv.balanceCents > 0) {
        totalAR += inv.balanceCents;
        if (inv.isOverdue) {
          overdueAR += inv.balanceCents;
          overdueCount++;
        } else {
          currentAR += inv.balanceCents;
        }
        if (inv.daysOverdue > 30) {
          over30AR += inv.balanceCents;
        }
      }
    }

    return { totalAR, overdueAR, overdueCount, currentAR, over30AR };
  }, [invoices]);

  const filteredInvoices = useMemo(() => {
    const q = search.trim().toLowerCase();
    return invoices.filter((inv) => {
      if (filter === "unpaid") {
        if (inv.status !== "issued" || inv.balanceCents <= 0) return false;
      } else if (filter === "overdue") {
        if (!inv.isOverdue) return false;
      } else if (filter === "paid") {
        if (inv.status !== "issued" || inv.balanceCents > 0) return false;
      } else if (filter === "draft") {
        if (inv.status !== "draft") return false;
      }

      if (!q) return true;
      return (
        inv.invoiceNumber.toLowerCase().includes(q) ||
        inv.customerName.toLowerCase().includes(q) ||
        inv.projectTitle.toLowerCase().includes(q)
      );
    });
  }, [invoices, filter, search]);

  const openPaymentModal = (inv: InvoiceRow) => {
    setActivePaymentInvoice(inv);
    setPayAmountDollars(centsToDecimalString(inv.balanceCents));
    setPayMethod("etransfer");
    setPayReference("");
    setPayDate(new Date().toISOString().slice(0, 10));
    setPaymentFeedback(null);
    setPaymentError(null);
  };

  const handleRecordPayment = (e: React.FormEvent) => {
    e.preventDefault();
    if (!activePaymentInvoice) return;
    setPaymentError(null);

    startTransition(async () => {
      const res = await recordPaymentAction({
        invoiceId: activePaymentInvoice.id,
        amountDollars: payAmountDollars,
        receivedOn: payDate,
        method: payMethod,
        reference: payReference || `Payment for #${activePaymentInvoice.invoiceNumber}`,
      });

      if (!res.ok) {
        setPaymentError(res.error);
      } else {
        setPaymentFeedback(`✓ Recorded payment for Invoice #${activePaymentInvoice.invoiceNumber}`);
        setTimeout(() => {
          setActivePaymentInvoice(null);
          setPaymentFeedback(null);
        }, 1200);
      }
    });
  };

  return (
    <div className="space-y-5">
      {/* Goodshuffle Pro Unified AR Aging Strip */}
      <div className="rounded-xs bg-white border border-slate-200 shadow-2xs grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 divide-y sm:divide-y-0 sm:divide-x divide-slate-200">
        <div className="p-4">
          <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
            Total Receivables (AR)
          </div>
          <div className="text-xl font-bold tabular-nums text-slate-800 mt-1">
            {formatCAD(metrics.totalAR)}
          </div>
          <div className="text-[11px] text-slate-500 mt-0.5">
            Issued invoices awaiting payment
          </div>
        </div>

        <div className="p-4">
          <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
            Current / Within Terms
          </div>
          <div className="text-xl font-bold tabular-nums text-emerald-700 mt-1">
            {formatCAD(metrics.currentAR)}
          </div>
          <div className="text-[11px] text-slate-500 mt-0.5">Within Net 30 due date</div>
        </div>

        <div className="p-4">
          <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
            Overdue Balance
          </div>
          <div
            className={`text-xl font-bold tabular-nums mt-1 ${
              metrics.overdueAR > 0 ? "text-rose-600" : "text-slate-800"
            }`}
          >
            {formatCAD(metrics.overdueAR)}
          </div>
          <div className="text-[11px] text-slate-500 mt-0.5">
            {metrics.overdueCount} {metrics.overdueCount === 1 ? "invoice" : "invoices"} past due
          </div>
        </div>

        <div className="p-4">
          <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
            30+ Days Overdue
          </div>
          <div
            className={`text-xl font-bold tabular-nums mt-1 ${
              metrics.over30AR > 0 ? "text-amber-600" : "text-slate-400"
            }`}
          >
            {formatCAD(metrics.over30AR)}
          </div>
          <div className="text-[11px] text-slate-500 mt-0.5">Aged receivables follow-up</div>
        </div>
      </div>

      {/* Filter Bar & Spreadsheet Table */}
      <div className="rounded-xs bg-white border border-slate-200 shadow-2xs overflow-hidden">
        <div className="bg-[#f8fafc] border-b border-slate-200 px-4 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-1.5">
            {[
              { key: "unpaid", label: "Awaiting Payment" },
              { key: "overdue", label: "Overdue" },
              { key: "paid", label: "Paid" },
              { key: "draft", label: "Drafts (Unbilled)" },
              { key: "all", label: "All Invoices" },
            ].map((tab) => (
              <button
                key={tab.key}
                type="button"
                onClick={() => setFilter(tab.key as typeof filter)}
                className={`rounded-xs px-3 py-1.5 text-xs font-semibold transition cursor-pointer ${
                  filter === tab.key
                    ? "bg-[#186ade] text-white shadow-2xs"
                    : "bg-white hover:bg-slate-100 text-slate-700 border border-slate-300"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="relative w-full sm:w-64">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search invoice #, client, job…"
              className="w-full rounded-xs border border-slate-300 bg-white pl-8 pr-2.5 py-1.5 text-xs text-slate-800 focus:border-[#186ade] focus:outline-none"
            />
          </div>
        </div>

        {filteredInvoices.length === 0 ? (
          <div className="p-8 text-center text-xs text-slate-500">
            No invoices match the selected filter.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-200 bg-white font-bold text-[11px] text-slate-500">
                  <th className="py-2.5 px-4 border-r border-slate-200">Invoice #</th>
                  <th className="py-2.5 px-4 border-r border-slate-200">Customer</th>
                  <th className="py-2.5 px-4 border-r border-slate-200">Project / Job</th>
                  <th className="py-2.5 px-4 border-r border-slate-200">Due Date</th>
                  <th className="py-2.5 px-4 border-r border-slate-200">Status</th>
                  <th className="py-2.5 px-4 border-r border-slate-200 text-right">Total</th>
                  <th className="py-2.5 px-4 border-r border-slate-200 text-right">Balance Due</th>
                  <th className="py-2.5 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {filteredInvoices.map((inv) => {
                  const isPaid = inv.balanceCents <= 0 && inv.status === "issued";
                  return (
                    <tr key={inv.id} className="hover:bg-blue-50/30 transition">
                      <td className="py-3 px-4 border-r border-slate-200 tabular-nums font-bold text-slate-900">
                        #{inv.invoiceNumber}
                      </td>
                      <td className="py-3 px-4 border-r border-slate-200 font-semibold text-slate-800">
                        <Link
                          href={`/customers/${inv.customerId}`}
                          className="hover:text-[#186ade] hover:underline"
                        >
                          {inv.customerName}
                        </Link>
                      </td>
                      <td className="py-3 px-4 border-r border-slate-200 text-slate-600 max-w-xs truncate">
                        {inv.projectId ? (
                          <Link
                            href={`/projects/${inv.projectId}?tab=billing`}
                            className="hover:text-[#186ade] hover:underline"
                          >
                            {inv.projectTitle}
                          </Link>
                        ) : (
                          inv.projectTitle
                        )}
                      </td>
                      <td className="py-3 px-4 border-r border-slate-200 tabular-nums text-slate-600">
                        {inv.dueDate ?? "—"}
                        {inv.isOverdue && (
                          <span className="block text-[10px] text-rose-600 font-bold">
                            {inv.daysOverdue}d overdue
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-4 border-r border-slate-200">
                        {isPaid ? (
                          <span className="inline-flex items-center gap-1 font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-xs border border-emerald-200">
                            <CheckCircle2 className="w-3 h-3" /> Paid
                          </span>
                        ) : inv.isOverdue ? (
                          <span className="inline-flex items-center gap-1 font-bold text-rose-700 bg-rose-50 px-2 py-0.5 rounded-xs border border-rose-200">
                            <AlertCircle className="w-3 h-3" /> Overdue
                          </span>
                        ) : inv.status === "issued" ? (
                          <span className="inline-flex items-center gap-1 font-bold text-[#186ade] bg-blue-50 px-2 py-0.5 rounded-xs border border-blue-200">
                            Issued
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 font-semibold text-slate-600 bg-slate-100 px-2 py-0.5 rounded-xs border border-slate-200">
                            Draft
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-4 border-r border-slate-200 tabular-nums font-semibold text-slate-800 text-right">
                        {formatCAD(inv.totalCents)}
                      </td>
                      <td className="py-3 px-4 border-r border-slate-200 tabular-nums font-bold text-right">
                        <span
                          className={
                            inv.balanceCents > 0
                              ? inv.isOverdue
                                ? "text-rose-600"
                                : "text-slate-900"
                              : "text-slate-400"
                          }
                        >
                          {formatCAD(inv.balanceCents)}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {inv.status === "issued" && inv.balanceCents > 0 && (
                            <button
                              type="button"
                              onClick={() => openPaymentModal(inv)}
                              className="rounded-xs bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-[11px] px-2.5 py-1 transition cursor-pointer shadow-2xs whitespace-nowrap"
                            >
                              + Record Payment
                            </button>
                          )}
                          {inv.projectId && (
                            <Link
                              href={`/projects/${inv.projectId}?tab=billing`}
                              className="rounded-xs border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 text-[11px] font-semibold px-2.5 py-1 transition whitespace-nowrap"
                            >
                              View
                            </Link>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Record Payment Dialog */}
      {activePaymentInvoice && (
        <div className="fixed inset-0 z-50 bg-slate-950/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xs max-w-md w-full border border-slate-200 shadow-xl p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <div className="flex items-center gap-2">
                <Receipt className="w-4 h-4 text-[#186ade]" />
                <h3 className="font-bold text-sm text-slate-900">
                  Record Payment — Invoice #{activePaymentInvoice.invoiceNumber}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setActivePaymentInvoice(null)}
                className="text-slate-400 hover:text-slate-700 p-1 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="bg-[#f8fafc] p-3 rounded-xs border border-slate-200 text-xs flex justify-between">
              <div>
                <span className="text-slate-500">Customer: </span>
                <strong className="text-slate-900">{activePaymentInvoice.customerName}</strong>
              </div>
              <div>
                <span className="text-slate-500">Balance Due: </span>
                <strong className="text-slate-900 tabular-nums">
                  {formatCAD(activePaymentInvoice.balanceCents)}
                </strong>
              </div>
            </div>

            {paymentFeedback && (
              <div className="p-3 rounded-xs bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs font-semibold">
                {paymentFeedback}
              </div>
            )}

            {paymentError && (
              <div className="p-3 rounded-xs bg-rose-50 border border-rose-200 text-rose-800 text-xs font-semibold">
                {paymentError}
              </div>
            )}

            <form onSubmit={handleRecordPayment} className="space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="pay-amount" className="block font-semibold text-slate-700 mb-1">
                    Amount Received ($ CAD) *
                  </label>
                  <input
                    id="pay-amount"
                    type="text"
                    required
                    value={payAmountDollars}
                    onChange={(e) => setPayAmountDollars(e.target.value)}
                    className="w-full rounded-xs border border-slate-300 px-2.5 py-1.5 tabular-nums text-xs text-slate-900"
                  />
                </div>
                <div>
                  <label htmlFor="pay-date" className="block font-semibold text-slate-700 mb-1">
                    Date Received *
                  </label>
                  <input
                    id="pay-date"
                    type="date"
                    required
                    value={payDate}
                    onChange={(e) => setPayDate(e.target.value)}
                    className="w-full rounded-xs border border-slate-300 px-2.5 py-1.5 text-xs text-slate-900"
                  />
                </div>
              </div>

              <div>
                <label htmlFor="pay-method" className="block font-semibold text-slate-700 mb-1">
                  Payment Method *
                </label>
                <select
                  id="pay-method"
                  value={payMethod}
                  onChange={(e) => setPayMethod(e.target.value as PaymentMethod)}
                  className="w-full rounded-xs border border-slate-300 px-2.5 py-1.5 text-xs text-slate-900"
                >
                  <option value="etransfer">Interac e-Transfer</option>
                  <option value="cheque">Cheque</option>
                  <option value="card">Credit Card (Stripe / Terminal)</option>
                  <option value="cash">Cash</option>
                  <option value="other">EFT / Direct Deposit</option>
                </select>
              </div>

              <div>
                <label htmlFor="pay-ref" className="block font-semibold text-slate-700 mb-1">
                  Reference / Cheque Number
                </label>
                <input
                  id="pay-ref"
                  type="text"
                  value={payReference}
                  onChange={(e) => setPayReference(e.target.value)}
                  placeholder="e.g. e-Transfer Ref #88129 or Cheque #4921"
                  className="w-full rounded-xs border border-slate-300 px-2.5 py-1.5 text-xs text-slate-900"
                />
              </div>

              <div className="pt-2 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setActivePaymentInvoice(null)}
                  className="rounded-xs border border-slate-300 hover:bg-slate-50 text-slate-700 font-semibold px-3.5 py-2 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isPending}
                  className="rounded-xs bg-[#186ade] hover:bg-[#1458b8] disabled:opacity-50 text-white font-semibold px-4 py-2 transition cursor-pointer shadow-2xs"
                >
                  {isPending ? "Recording…" : "Save Payment"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
