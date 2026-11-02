"use client";

import React, { useState, useTransition } from "react";
import {
  CalendarCheck,
  CheckCircle2,
  PauseCircle,
  PlayCircle,
  Plus,
  Send,
  ShieldCheck,
  Sparkles,
  StopCircle,
} from "lucide-react";
import {
  approveAndSendBatchAction,
  createRecurringServicePlanAction,
  generateMonthlyBatchAction,
  toggleRecurringPlanStatusAction,
  toggleSkipBatchItemAction,
} from "@/app/actions";
import { formatCAD } from "@/lib/money";

interface PlanItem {
  id: number;
  customerName: string;
  rentalId: number | null;
  kind: string;
  title: string;
  description: string;
  poReference: string;
  province: string;
  monthlyAmountCents: number;
  startDate: string;
  endDate: string | null;
  status: "active" | "paused" | "ended";
}

interface BatchItemRow {
  id: number;
  planId: number;
  customerName: string;
  planKind: string;
  description: string;
  netCents: number;
  taxCents: number;
  totalCents: number;
  isHalfMonthProrated: boolean;
  changeFlag: string;
  skipThisMonth: boolean;
  sageInvoiceNumber: string | null;
}

interface BatchRow {
  id: number;
  monthKey: string;
  invoiceDate: string;
  status: string;
  isDryRun: boolean;
  approvedAt: string | null;
  executedAt: string | null;
  items: BatchItemRow[];
}

export function RecurringBillingClient({
  plans,
  batches,
  customers,
}: {
  plans: PlanItem[];
  batches: BatchRow[];
  customers: { id: number; name: string; province: string }[];
}) {
  const [isPending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Add new recurring service plan state
  const [showNewPlan, setShowNewPlan] = useState(false);
  const [customerId, setCustomerId] = useState<number>(customers[0]?.id ?? 1);
  const [kind, setKind] = useState<
    "maintenance" | "storage" | "advertising_space" | "service"
  >("maintenance");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [poReference, setPoReference] = useState("");
  const [province, setProvince] = useState(customers[0]?.province ?? "NS");
  const [monthlyAmountDollars, setMonthlyAmountDollars] = useState("250.00");
  const [startDate, setStartDate] = useState("2026-11-15");

  const activePlans = plans.filter((p) => p.status === "active");
  const mrrCents = activePlans.reduce((a, p) => a + p.monthlyAmountCents, 0);

  const kindBadgeClass = (k: string) => {
    switch (k) {
      case "equipment_rental":
        return "bg-blue-50 text-blue-800 border border-blue-200";
      case "maintenance":
        return "bg-amber-50 text-amber-800 border border-amber-200";
      case "storage":
        return "bg-purple-50 text-purple-800 border border-purple-200";
      default:
        return "bg-slate-100 text-slate-700";
    }
  };

  return (
    <div className="space-y-6">
      {feedback && (
        <div className="rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900 px-4 py-3 text-xs sm:text-sm font-semibold">
          {feedback}
        </div>
      )}
      {error && (
        <div className="rounded-xl bg-rose-50 border border-rose-200 text-rose-800 px-4 py-3 text-xs sm:text-sm font-semibold">
          {error}
        </div>
      )}

      {/* Cutover & Batch Control Card */}
      <div className="rounded-3xl bg-slate-950 text-white p-6 sm:p-7 border border-slate-800 space-y-5">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="inline-flex items-center gap-1.5 text-xs font-semibold text-amber-400">
              <Sparkles className="w-3.5 h-3.5" /> Safe Cutover Schedule (Dec 1 Dry Run → Jan 1 Live)
            </div>
            <h2 className="text-lg sm:text-xl font-bold">
              Monthly 1st-of-the-Month Batch Review
            </h2>
            <p className="text-xs text-slate-400 max-w-2xl">
              Review all upcoming monthly invoices in one place. Approve early and schedule for the 1st (built for the Jan 1 New Year&apos;s Day holiday), or run the Dec 1 dry run to compare line-by-line with Sage.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 shrink-0">
            <button
              type="button"
              disabled={isPending}
              onClick={() => {
                setError(null);
                startTransition(async () => {
                  const res = await generateMonthlyBatchAction({
                    monthKey: "2026-12",
                    isDryRun: true,
                  });
                  if (!res.ok) setError(res.error);
                  else setFeedback("Prepared Dec 1, 2026 Parallel Dry-Run Batch for review.");
                });
              }}
              className="rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-white font-semibold text-xs px-4 py-2.5 transition cursor-pointer"
            >
              Prepare Dec 1, 2026 Dry-Run Batch
            </button>

            <button
              type="button"
              disabled={isPending}
              onClick={() => {
                setError(null);
                startTransition(async () => {
                  const res = await generateMonthlyBatchAction({
                    monthKey: "2027-01",
                    isDryRun: false,
                  });
                  if (!res.ok) setError(res.error);
                  else setFeedback("Prepared Jan 1, 2027 Live Cutover Batch for review.");
                });
              }}
              className="rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs px-4 py-2.5 transition shadow-sm cursor-pointer"
            >
              Prepare Jan 1, 2027 Live Batch
            </button>
          </div>
        </div>
      </div>

      {/* Generated Monthly Batches */}
      {batches.map((batch) => {
        const includedItems = batch.items.filter((i) => !i.skipThisMonth);
        const batchNetCents = includedItems.reduce((a, i) => a + i.netCents, 0);
        const batchTaxCents = includedItems.reduce((a, i) => a + i.taxCents, 0);
        const batchTotalCents = includedItems.reduce((a, i) => a + i.totalCents, 0);

        return (
          <div
            key={batch.id}
            className="rounded-3xl bg-white border-2 border-slate-900 shadow-sm overflow-hidden"
          >
            <div className="p-5 bg-slate-50 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <div className="flex flex-wrap items-center gap-2.5">
                  <span className="font-mono text-sm font-black px-2.5 py-1 rounded-lg bg-slate-950 text-amber-400 whitespace-nowrap">
                    {batch.monthKey} BATCH (Dated {batch.invoiceDate})
                  </span>
                  {batch.isDryRun ? (
                    <span className="text-xs font-bold uppercase px-2.5 py-0.5 rounded-full bg-blue-100 text-blue-800 border border-blue-200 whitespace-nowrap">
                      Dry Run (Does Not Touch Live Sage Numbers)
                    </span>
                  ) : (
                    <span className="text-xs font-bold uppercase px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-200 whitespace-nowrap">
                      Live Sage Batch
                    </span>
                  )}
                  <span className="text-xs font-semibold uppercase text-slate-600 whitespace-nowrap">
                    Status: {batch.status.replace("_", " ")}
                  </span>
                </div>
                <div className="text-xs text-slate-600 mt-1">
                  {includedItems.length} active invoices • Net:{" "}
                  <strong>{formatCAD(batchNetCents)}</strong> + Tax:{" "}
                  <strong>{formatCAD(batchTaxCents)}</strong> = Batch Total:{" "}
                  <strong className="text-slate-900">{formatCAD(batchTotalCents)}</strong>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {!batch.isDryRun && batch.status === "draft" && (
                  <button
                    type="button"
                    disabled={isPending}
                    onClick={() => {
                      setError(null);
                      startTransition(async () => {
                        const res = await approveAndSendBatchAction({
                          batchId: batch.id,
                          scheduleForFirst: true,
                        });
                        if (!res.ok) setError(res.error);
                        else
                          setFeedback(
                            `Batch ${batch.monthKey} approved and scheduled to send automatically on ${batch.invoiceDate}!`
                          );
                      });
                    }}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-slate-900 font-semibold text-xs px-3.5 py-2 whitespace-nowrap cursor-pointer"
                  >
                    <CalendarCheck className="w-3.5 h-3.5 text-amber-600" />
                    Approve & Schedule for {batch.invoiceDate}
                  </button>
                )}

                {batch.status !== "sent" && (
                  <button
                    type="button"
                    disabled={isPending}
                    onClick={() => {
                      setError(null);
                      startTransition(async () => {
                        const res = await approveAndSendBatchAction({
                          batchId: batch.id,
                          scheduleForFirst: false,
                        });
                        if (!res.ok) setError(res.error);
                        else
                          setFeedback(
                            batch.isDryRun
                              ? `Completed Dec 1 Dry Run (${res.processedCount} items verified).`
                              : `Approved & sent ${res.processedCount} Sage invoices for ${batch.monthKey}!`
                          );
                      });
                    }}
                    className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs px-4 py-2 shadow-xs whitespace-nowrap cursor-pointer"
                  >
                    <Send className="w-3.5 h-3.5" />
                    {batch.isDryRun
                      ? "Run Dry-Run Comparison"
                      : "Approve & Send All Now"}
                  </button>
                )}
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-sm">
                <thead>
                  <tr className="border-b border-slate-200 bg-white text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                    <th className="py-3 px-4">Include</th>
                    <th className="py-3 px-4">Customer & Description</th>
                    <th className="py-3 px-4">Change / Proration Flag</th>
                    <th className="py-3 px-4">Sage Invoice #</th>
                    <th className="py-3 px-4 text-right">Net</th>
                    <th className="py-3 px-4 text-right">Tax</th>
                    <th className="py-3 px-4 text-right">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {batch.items.map((item) => (
                    <tr
                      key={item.id}
                      className={
                        item.skipThisMonth
                          ? "bg-slate-50 opacity-50 line-through"
                          : "hover:bg-slate-50/70"
                      }
                    >
                      <td className="py-3 px-4">
                        <input
                          type="checkbox"
                          aria-label={`Include ${item.customerName} in ${batch.monthKey} batch`}
                          checked={!item.skipThisMonth}
                          disabled={isPending || Boolean(item.sageInvoiceNumber)}
                          onChange={(e) => {
                            startTransition(async () => {
                              await toggleSkipBatchItemAction({
                                itemId: item.id,
                                skip: !e.target.checked,
                              });
                            });
                          }}
                          className="h-4 w-4 rounded border-slate-300 cursor-pointer"
                        />
                      </td>
                      <td className="py-3 px-4">
                        <div className="font-semibold text-slate-900">
                          {item.customerName}
                        </div>
                        <div className="text-xs text-slate-500">{item.description}</div>
                      </td>
                      <td className="py-3 px-4 whitespace-nowrap">
                        {item.isHalfMonthProrated ? (
                          <span className="text-[11px] font-bold uppercase px-2 py-0.5 rounded-full bg-amber-100 text-amber-900 border border-amber-300">
                            ½ Month Start Rule
                          </span>
                        ) : item.changeFlag === "ending" ? (
                          <span className="text-[11px] font-bold uppercase px-2 py-0.5 rounded-full bg-rose-100 text-rose-800">
                            Ending This Month
                          </span>
                        ) : item.changeFlag === "new" ? (
                          <span className="text-[11px] font-bold uppercase px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800">
                            New Plan
                          </span>
                        ) : (
                          <span className="text-[11px] text-slate-500">
                            Standard Full Month
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-4 font-mono text-xs font-bold whitespace-nowrap">
                        {item.sageInvoiceNumber ? (
                          <span className="px-2 py-0.5 rounded bg-slate-900 text-amber-400">
                            #{item.sageInvoiceNumber}
                          </span>
                        ) : (
                          <span className="text-slate-400">Pending Approval</span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-right text-xs text-slate-700 whitespace-nowrap">
                        {formatCAD(item.netCents)}
                      </td>
                      <td className="py-3 px-4 text-right text-xs text-slate-700 whitespace-nowrap">
                        {formatCAD(item.taxCents)}
                      </td>
                      <td className="py-3 px-4 text-right font-bold text-slate-900 whitespace-nowrap">
                        {formatCAD(item.totalCents)}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="bg-slate-50 border-t-2 border-slate-200 font-bold text-xs text-slate-900">
                    <td colSpan={4} className="py-3 px-4 text-right uppercase tracking-wider text-slate-500">
                      Batch Totals ({includedItems.length} Active Invoices)
                    </td>
                    <td className="py-3 px-4 text-right whitespace-nowrap">
                      {formatCAD(batchNetCents)}
                    </td>
                    <td className="py-3 px-4 text-right whitespace-nowrap">
                      {formatCAD(batchTaxCents)}
                    </td>
                    <td className="py-3 px-4 text-right text-sm whitespace-nowrap">
                      {formatCAD(batchTotalCents)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        );
      })}

      {/* Master List of All Recurring Billing Plans (Rentals + Services) */}
      <div className="rounded-3xl bg-white border border-slate-200/90 shadow-xs overflow-hidden">
        <div className="p-5 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-base font-bold text-slate-900">
                Recurring Billing Plans ({activePlans.length} Active • {formatCAD(mrrCents)}/mo MRR)
              </h2>
              <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full whitespace-nowrap">
                <ShieldCheck className="w-3 h-3" /> Exactly-Once Monthly Lock
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Includes equipment rentals (auto-stopped when returned) and recurring services (maintenance, storage, ad space)
            </p>
          </div>

          <button
            type="button"
            onClick={() => setShowNewPlan((v) => !v)}
            className="inline-flex items-center gap-1.5 rounded-xl bg-slate-950 hover:bg-slate-800 text-white font-semibold text-xs px-4 py-2.5 whitespace-nowrap cursor-pointer"
          >
            <Plus className="w-4 h-4 text-amber-400" />
            {showNewPlan ? "Close Form" : "Add Recurring Service / Plan"}
          </button>
        </div>

        {showNewPlan && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              setError(null);
              startTransition(async () => {
                const res = await createRecurringServicePlanAction({
                  customerId,
                  kind,
                  title,
                  description,
                  poReference,
                  province,
                  monthlyAmountDollars,
                  startDate,
                });
                if (!res.ok) setError(res.error);
                else {
                  setShowNewPlan(false);
                  setTitle("");
                  setDescription("");
                  setFeedback("Added new recurring billing plan!");
                }
              });
            }}
            className="p-5 bg-slate-50 border-b border-slate-200 grid grid-cols-1 sm:grid-cols-3 gap-3.5"
          >
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Customer
              </label>
              <select
                value={customerId}
                onChange={(e) => {
                  const id = Number(e.target.value);
                  setCustomerId(id);
                  const c = customers.find((x) => x.id === id);
                  if (c) setProvince(c.province);
                }}
                className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900"
              >
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} ({c.province})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Plan Category
              </label>
              <select
                value={kind}
                onChange={(e) =>
                  setKind(
                    e.target.value as
                      | "maintenance"
                      | "storage"
                      | "advertising_space"
                      | "service"
                  )
                }
                className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900"
              >
                <option value="maintenance">Monthly Sign Maintenance</option>
                <option value="storage">Signage Storage</option>
                <option value="advertising_space">Advertising / Billboard Space</option>
                <option value="service">Other Recurring Service</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Plan Title
              </label>
              <input
                type="text"
                required
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Monthly Billboard Face Lease — Hwy 102"
                className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Monthly Amount ($ pre-tax)
              </label>
              <input
                type="text"
                required
                value={monthlyAmountDollars}
                onChange={(e) => setMonthlyAmountDollars(e.target.value)}
                className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-mono text-slate-900"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Start Date (2nd–31st = ½ Month First)
              </label>
              <input
                type="date"
                required
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900"
              />
            </div>

            <div className="flex items-end gap-2">
              <div className="flex-1">
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  PO / Ref
                </label>
                <input
                  type="text"
                  value={poReference}
                  onChange={(e) => setPoReference(e.target.value)}
                  placeholder="Optional PO#"
                  className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900"
                />
              </div>
              <button
                type="submit"
                disabled={isPending}
                className="rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs px-4 py-2.5 cursor-pointer"
              >
                Save Plan
              </button>
            </div>
          </form>
        )}

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/70 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                <th className="py-3.5 px-4">Type</th>
                <th className="py-3.5 px-4">Customer & Plan</th>
                <th className="py-3.5 px-4">Term & Schedule</th>
                <th className="py-3.5 px-4">Status</th>
                <th className="py-3.5 px-4 text-right">Monthly Rate</th>
                <th className="py-3.5 px-4 text-right">Controls</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {plans.map((p) => {
                const startedMidMonth = !p.startDate.endsWith("-01");
                return (
                  <tr key={p.id} className="hover:bg-slate-50/70">
                    <td className="py-3.5 px-4 whitespace-nowrap">
                      <span
                        className={`text-[11px] font-bold uppercase px-2.5 py-0.5 rounded-full whitespace-nowrap ${kindBadgeClass(
                          p.kind
                        )}`}
                      >
                        {p.kind.replace("_", " ")}
                      </span>
                    </td>
                    <td className="py-3.5 px-4">
                      <div className="font-semibold text-slate-900">{p.title}</div>
                      <div className="text-xs text-slate-500">
                        {p.customerName} {p.poReference ? `• PO: ${p.poReference}` : ""}
                      </div>
                    </td>
                    <td className="py-3.5 px-4 text-xs text-slate-600">
                      <div className="whitespace-nowrap">
                        Start: <strong>{p.startDate}</strong>
                      </div>
                      {p.endDate && (
                        <div className="mt-0.5">
                          <span className="inline-block text-[11px] font-semibold px-2 py-0.5 rounded bg-rose-50 text-rose-700 border border-rose-200 whitespace-nowrap">
                            Ends {p.endDate}
                          </span>
                        </div>
                      )}
                      {startedMidMonth && !p.endDate && (
                        <span className="text-[11px] text-amber-700 font-medium">
                          Started mid-month (½ mo initial)
                        </span>
                      )}
                    </td>
                    <td className="py-3.5 px-4 whitespace-nowrap">
                      {p.status === "active" ? (
                        <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-0.5 rounded-full whitespace-nowrap">
                          <CheckCircle2 className="w-3 h-3" /> Active
                        </span>
                      ) : p.status === "paused" ? (
                        <span className="inline-flex items-center gap-1 text-xs font-semibold text-amber-700 bg-amber-50 border border-amber-200 px-2.5 py-0.5 rounded-full whitespace-nowrap">
                          Paused
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-xs font-semibold text-slate-500 bg-slate-100 px-2.5 py-0.5 rounded-full whitespace-nowrap">
                          Ended {p.endDate ? `(${p.endDate})` : ""}
                        </span>
                      )}
                    </td>
                    <td className="py-3.5 px-4 text-right font-bold text-slate-900 whitespace-nowrap">
                      {formatCAD(p.monthlyAmountCents)}/mo
                    </td>
                    <td className="py-3.5 px-4 text-right whitespace-nowrap">
                      <div className="inline-flex items-center gap-1.5">
                        {p.status === "active" && (
                          <button
                            type="button"
                            disabled={isPending}
                            onClick={() =>
                              startTransition(async () => {
                                await toggleRecurringPlanStatusAction({
                                  planId: p.id,
                                  status: "paused",
                                });
                              })
                            }
                            className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-xs font-medium text-slate-700 px-2.5 py-1 cursor-pointer"
                          >
                            <PauseCircle className="w-3.5 h-3.5 text-amber-600" /> Pause
                          </button>
                        )}
                        {p.status === "paused" && (
                          <button
                            type="button"
                            disabled={isPending}
                            onClick={() =>
                              startTransition(async () => {
                                await toggleRecurringPlanStatusAction({
                                  planId: p.id,
                                  status: "active",
                                });
                              })
                            }
                            className="inline-flex items-center gap-1 rounded-lg border border-emerald-200 bg-emerald-50 text-xs font-semibold text-emerald-800 px-2.5 py-1 cursor-pointer"
                          >
                            <PlayCircle className="w-3.5 h-3.5" /> Resume
                          </button>
                        )}
                        {p.status !== "ended" && (
                          <button
                            type="button"
                            disabled={isPending}
                            onClick={() =>
                              startTransition(async () => {
                                await toggleRecurringPlanStatusAction({
                                  planId: p.id,
                                  status: "ended",
                                });
                              })
                            }
                            className="inline-flex items-center gap-1 rounded-lg border border-rose-200 bg-rose-50 text-xs font-semibold text-rose-700 px-2.5 py-1 cursor-pointer"
                          >
                            <StopCircle className="w-3.5 h-3.5" /> End Plan
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
