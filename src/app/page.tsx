import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import {
  ArrowRight,
  AlertCircle,
  CheckCircle2,
  Clock,
  DollarSign,
  Eye,
  FileCheck2,
  HardHat,
  Plus,
  Send,
  Signpost,
  TrendingUp,
} from "lucide-react";
import { getDb } from "@/db";
import {
  activityLog,
  customers,
  equipment,
  jobs,
  quotes,
  recurringBillingPlans,
  sageInvoices,
} from "@/db/schema";
import { formatCAD } from "@/lib/money";
import { getSageConnectionState } from "@/lib/sage";
import { DashboardInvoiceActions } from "@/components/DashboardInvoiceActions";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const db = await getDb();
  const sageState = await getSageConnectionState();

  const allQuotes = await db
    .select({
      quote: quotes,
      customer: customers,
    })
    .from(quotes)
    .innerJoin(customers, eq(quotes.customerId, customers.id))
    .orderBy(desc(quotes.createdAt));

  const allJobs = await db
    .select({
      job: jobs,
      customer: customers,
    })
    .from(jobs)
    .innerJoin(customers, eq(jobs.customerId, customers.id))
    .orderBy(desc(jobs.id));

  const allSageInvoices = await db
    .select()
    .from(sageInvoices)
    .orderBy(desc(sageInvoices.invoiceNumber));

  const allEquipment = await db.select().from(equipment);
  const activePlans = await db
    .select()
    .from(recurringBillingPlans)
    .where(eq(recurringBillingPlans.status, "active"));

  const recentActivity = await db
    .select()
    .from(activityLog)
    .orderBy(desc(activityLog.createdAt))
    .limit(8);

  const today = new Date().toISOString().slice(0, 10);

  // KPI calculations
  const nonVoidInvoices = allSageInvoices.filter((i) => i.status !== "VOID");
  const totalInvoicedCents = nonVoidInvoices.reduce((acc, i) => acc + i.totalCents, 0);
  const paidCents = nonVoidInvoices
    .filter((i) => i.status === "PAID")
    .reduce((acc, i) => acc + i.totalCents, 0);

  const overdueInvoices = nonVoidInvoices.filter(
    (i) => i.status !== "PAID" && i.dueDate && i.dueDate < today
  );
  const overdueCents = overdueInvoices.reduce((acc, i) => acc + i.outstandingCents, 0);

  const mrrCents = activePlans.reduce((acc, p) => acc + p.monthlyAmountCents, 0);

  const approvedQuotes = allQuotes.filter((q) => q.quote.status === "approved");
  const declinedQuotes = allQuotes.filter((q) => q.quote.status === "declined");
  const openQuotes = allQuotes.filter((q) =>
    ["draft", "sent", "viewed"].includes(q.quote.status)
  );
  const decidedCount = approvedQuotes.length + declinedQuotes.length;
  const winRatePct =
    decidedCount > 0
      ? Math.round((approvedQuotes.length / decidedCount) * 100)
      : 100;

  // Ready to send: Jobs marked Installed where invoice hasn't been sent yet (§2b)
  const readyToSendJobs = allJobs.filter(
    ({ job }) => job.status === "installed" && !job.invoiceSentAt
  );

  const rentedCount = allEquipment.filter((e) => e.status === "rented").length;

  return (
    <div className="space-y-8">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-amber-600 bg-amber-50 border border-amber-200 px-2.5 py-1 rounded-full mb-2">
            <span>Sage Master Sequence Active • Next #{sageState.nextNumberPreview}</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900">
            Command Center
          </h1>
          <p className="text-sm text-slate-600 mt-1">
            Quotes → Jobs → Sage Invoices & Recurring Equipment Rentals for Giant Promotions Limited
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <Link
            href="/installer"
            className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-slate-800 font-semibold text-sm px-4 py-2.5 transition shadow-xs"
          >
            <HardHat className="w-4 h-4 text-amber-600" />
            Installer View
          </Link>
          <Link
            href="/quotes/new"
            className="inline-flex items-center gap-2 rounded-xl bg-slate-950 hover:bg-slate-800 text-white font-semibold text-sm px-4 py-2.5 transition shadow-sm"
          >
            <Plus className="w-4 h-4 text-amber-400" />
            New Quote
          </Link>
        </div>
      </div>

      {/* Ready-to-Send Invoice Alert Banner (§2b) */}
      {readyToSendJobs.length > 0 && (
        <div className="rounded-2xl bg-amber-50/90 border-2 border-amber-300 p-5 shadow-xs">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            <div className="flex items-start gap-3.5">
              <div className="h-10 w-10 rounded-xl bg-amber-500 text-slate-950 flex items-center justify-center shrink-0 mt-0.5">
                <Send className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-base font-bold text-slate-900">
                  {readyToSendJobs.length} Installed Job{readyToSendJobs.length > 1 ? "s" : ""} Ready to Invoice
                </h2>
                <p className="text-xs sm:text-sm text-slate-700 mt-0.5">
                  Installers marked these jobs complete. Per your rule, customers only receive their Sage invoice when you click <strong>Send Invoice</strong>.
                </p>
              </div>
            </div>
          </div>

          <div className="mt-4 divide-y divide-amber-200/80 bg-white rounded-xl border border-amber-200 overflow-hidden">
            {readyToSendJobs.map(({ job, customer }) => (
              <div
                key={job.id}
                className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
              >
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs font-bold px-2 py-0.5 rounded bg-slate-900 text-amber-400">
                      #{job.jobNumber ?? "Pending"}
                    </span>
                    <Link
                      href={`/jobs/${job.id}`}
                      className="font-semibold text-sm text-slate-900 hover:underline"
                    >
                      {job.title}
                    </Link>
                  </div>
                  <div className="text-xs text-slate-600 mt-1">
                    {customer.name} • PO: {job.poReference || "—"} • Total:{" "}
                    <strong className="text-slate-900">{formatCAD(job.totalCents)}</strong> ({job.taxLabel})
                  </div>
                </div>
                <DashboardInvoiceActions
                  jobId={job.id}
                  invoiceNumber={job.jobNumber ?? ""}
                  defaultEmail={customer.email || ""}
                  totalFormatted={formatCAD(job.totalCents)}
                />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 4 Executive KPI Cards (Pulled from Sage & Live Pipeline) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <div className="rounded-2xl bg-white border border-slate-200/90 p-5 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Sage Billed Revenue
            </span>
            <div className="h-9 w-9 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
              <DollarSign className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-bold text-slate-900 mt-3">
            {formatCAD(totalInvoicedCents)}
          </div>
          <div className="text-xs text-slate-600 mt-1.5 flex items-center justify-between">
            <span>Collected: <strong className="text-emerald-700">{formatCAD(paidCents)}</strong></span>
            <span>+{formatCAD(mrrCents)}/mo recurring</span>
          </div>
        </div>

        <div className="rounded-2xl bg-white border border-slate-200/90 p-5 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Quotes & Win Rate
            </span>
            <div className="h-9 w-9 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
              <TrendingUp className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-bold text-slate-900 mt-3">
            {winRatePct}%{" "}
            <span className="text-sm font-medium text-slate-500">
              ({approvedQuotes.length} won / {openQuotes.length} open)
            </span>
          </div>
          <div className="text-xs text-slate-600 mt-1.5">
            Open pipeline:{" "}
            <strong className="text-slate-900">
              {formatCAD(openQuotes.reduce((acc, q) => acc + q.quote.totalCents, 0))}
            </strong>
          </div>
        </div>

        <div className="rounded-2xl bg-white border border-slate-200/90 p-5 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Overdue in Sage
            </span>
            <div className="h-9 w-9 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center">
              <AlertCircle className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-bold text-rose-600 mt-3">
            {formatCAD(overdueCents)}
          </div>
          <div className="text-xs text-slate-600 mt-1.5">
            {overdueInvoices.length} overdue invoice{overdueInvoices.length === 1 ? "" : "s"} past Net 30
          </div>
        </div>

        <div className="rounded-2xl bg-white border border-slate-200/90 p-5 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Rental Fleet Active
            </span>
            <div className="h-9 w-9 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center">
              <Signpost className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-bold text-slate-900 mt-3">
            {rentedCount} / {allEquipment.length}{" "}
            <span className="text-sm font-medium text-slate-500">units deployed</span>
          </div>
          <div className="text-xs text-slate-600 mt-1.5">
            {activePlans.length} active recurring billing plans
          </div>
        </div>
      </div>

      {/* Two-Column Pipeline: Active Jobs (Sage Master Numbered) + Quotes Pipeline */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Active Jobs */}
        <div className="lg:col-span-7 rounded-2xl bg-white border border-slate-200/90 shadow-xs overflow-hidden">
          <div className="p-5 border-b border-slate-100 flex items-center justify-between">
            <div>
              <h2 className="text-base font-bold text-slate-900">
                Active Jobs (Sage Master Numbered)
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Every approved quote immediately gets its official Sage invoice number
              </p>
            </div>
            <Link
              href="/jobs"
              className="text-xs font-semibold text-slate-700 hover:text-slate-950 inline-flex items-center gap-1"
            >
              All Jobs <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>

          <div className="divide-y divide-slate-100">
            {allJobs.slice(0, 6).map(({ job, customer }) => (
              <div
                key={job.id}
                className="p-4 hover:bg-slate-50/80 transition flex items-center justify-between gap-4"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-mono text-xs font-bold px-2 py-0.5 rounded bg-slate-900 text-amber-400">
                      {job.jobNumber ? `#${job.jobNumber}` : "⏳ Waiting for Sage #"}
                    </span>
                    <StatusPill status={job.status} />
                    {job.priority === "rush" && (
                      <span className="text-[11px] font-bold uppercase px-2 py-0.5 rounded bg-rose-100 text-rose-700">
                        Rush
                      </span>
                    )}
                  </div>
                  <Link
                    href={`/jobs/${job.id}`}
                    className="block font-semibold text-sm text-slate-900 hover:text-amber-600 truncate mt-1.5"
                  >
                    {job.title}
                  </Link>
                  <div className="text-xs text-slate-500 mt-0.5 truncate">
                    {customer.name} • Scheduled: {job.scheduledDate || "TBD"} •{" "}
                    {job.siteProvince} ({job.taxLabel})
                  </div>
                </div>

                <div className="text-right shrink-0">
                  <div className="font-bold text-sm text-slate-900">
                    {formatCAD(job.totalCents)}
                  </div>
                  <Link
                    href={`/jobs/${job.id}`}
                    className="text-xs font-medium text-amber-600 hover:underline"
                  >
                    Open →
                  </Link>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Quotes Pipeline + Customer View Tracking */}
        <div className="lg:col-span-5 rounded-2xl bg-white border border-slate-200/90 shadow-xs overflow-hidden">
          <div className="p-5 border-b border-slate-100 flex items-center justify-between">
            <div>
              <h2 className="text-base font-bold text-slate-900">
                Recent Quotes & Online Approval
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Tracks when customers open and sign their approval link
              </p>
            </div>
            <Link
              href="/quotes"
              className="text-xs font-semibold text-slate-700 hover:text-slate-950 inline-flex items-center gap-1"
            >
              All Quotes <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>

          <div className="divide-y divide-slate-100">
            {allQuotes.slice(0, 5).map(({ quote, customer }) => (
              <div key={quote.id} className="p-4 hover:bg-slate-50/80 transition space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs font-bold text-slate-700 bg-slate-100 px-2 py-0.5 rounded">
                      {quote.quoteNumber}
                    </span>
                    <QuoteStatusBadge status={quote.status} />
                  </div>
                  <span className="font-bold text-sm text-slate-900">
                    {formatCAD(quote.totalCents)}
                  </span>
                </div>
                <div className="font-semibold text-sm text-slate-900 truncate">
                  {quote.title}
                </div>
                <div className="flex items-center justify-between text-xs text-slate-500 pt-0.5">
                  <span className="truncate">{customer.name}</span>
                  <Link
                    href={`/q/${quote.publicToken}`}
                    className="text-amber-600 hover:underline font-medium shrink-0"
                  >
                    Customer Link ↗
                  </Link>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Bottom Row: Overdue Sage Invoices + Live Activity Log */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-7 rounded-2xl bg-white border border-slate-200/90 shadow-xs overflow-hidden">
          <div className="p-5 border-b border-slate-100 flex items-center justify-between">
            <div>
              <h2 className="text-base font-bold text-slate-900">
                Sage Invoices & Overdue Watchlist
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Synced from Sage Accounting (232010 → {sageState.nextNumberPreview - 1})
              </p>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-[11px] font-semibold uppercase tracking-wider text-slate-400 bg-slate-50/50">
                  <th className="py-3 px-4">Sage #</th>
                  <th className="py-3 px-4">Customer</th>
                  <th className="py-3 px-4">Due Date</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4 text-right">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {allSageInvoices.slice(0, 6).map((inv) => {
                  const isOverdue =
                    inv.status === "UNPAID" && inv.dueDate && inv.dueDate < today;
                  return (
                    <tr key={inv.id} className="hover:bg-slate-50/80">
                      <td className="py-3 px-4 font-mono font-bold text-xs text-slate-900">
                        #{inv.invoiceNumber}
                      </td>
                      <td className="py-3 px-4">
                        <div className="font-medium text-slate-900 text-xs sm:text-sm">
                          {inv.contactName}
                        </div>
                        <div className="text-[11px] text-slate-500">{inv.reference}</div>
                      </td>
                      <td className="py-3 px-4 text-xs text-slate-600">
                        {inv.dueDate || "—"}
                      </td>
                      <td className="py-3 px-4">
                        {inv.status === "PAID" ? (
                          <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                            <CheckCircle2 className="w-3 h-3" /> PAID
                          </span>
                        ) : inv.status === "VOID" ? (
                          <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-500 line-through">
                            VOID
                          </span>
                        ) : isOverdue ? (
                          <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-rose-50 text-rose-700 border border-rose-200">
                            <AlertCircle className="w-3 h-3" /> OVERDUE
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200">
                            <Clock className="w-3 h-3" /> UNPAID
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-right font-semibold text-slate-900">
                        {formatCAD(inv.totalCents)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Activity Audit Feed */}
        <div className="lg:col-span-5 rounded-2xl bg-white border border-slate-200/90 shadow-xs overflow-hidden">
          <div className="p-5 border-b border-slate-100">
            <h2 className="text-base font-bold text-slate-900">Audit Trail</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Every quote approval, Sage number allocation & equipment return
            </p>
          </div>
          <div className="p-4 space-y-3.5">
            {recentActivity.map((act) => (
              <div key={act.id} className="flex items-start gap-3 text-xs">
                <div className="h-2 w-2 rounded-full bg-amber-500 mt-1.5 shrink-0" />
                <div className="min-w-0 flex-1">
                  <div className="font-medium text-slate-900">{act.summary}</div>
                  <div className="text-[11px] text-slate-500 mt-0.5">
                    {act.actorName} • {new Date(act.createdAt).toLocaleString("en-CA")}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  const styles: Record<string, string> = {
    approved: "bg-blue-50 text-blue-700 border-blue-200",
    scheduled: "bg-indigo-50 text-indigo-700 border-indigo-200",
    in_progress: "bg-amber-50 text-amber-800 border-amber-200",
    installed: "bg-emerald-50 text-emerald-700 border-emerald-200",
    invoiced: "bg-purple-50 text-purple-700 border-purple-200",
    paid: "bg-emerald-100 text-emerald-800 border-emerald-300",
    cancelled: "bg-slate-100 text-slate-500 border-slate-200 line-through",
  };
  return (
    <span
      className={`text-[11px] font-semibold uppercase px-2 py-0.5 rounded-full border ${
        styles[status] ?? "bg-slate-100 text-slate-700 border-slate-200"
      }`}
    >
      {status.replace("_", " ")}
    </span>
  );
}

function QuoteStatusBadge({ status }: { status: string }) {
  if (status === "approved") {
    return (
      <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
        <FileCheck2 className="w-3 h-3" /> Approved
      </span>
    );
  }
  if (status === "viewed") {
    return (
      <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200">
        <Eye className="w-3 h-3" /> Customer Viewed
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200 uppercase">
      {status}
    </span>
  );
}
