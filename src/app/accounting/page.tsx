import type React from "react";
import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { Download, ShieldAlert } from "lucide-react";
import { getDb } from "@/db";
import { accountingBatches, customers, invoices, payments } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth";
import { formatCAD } from "@/lib/money";
import { getPendingCapture } from "@/lib/invoicing";
import { AccountingCaptureClient } from "@/components/AccountingCaptureClient";

export const dynamic = "force-dynamic";

const TABS = [
  { key: "capture", label: "To Capture" },
  { key: "batches", label: "Past Captures" },
  { key: "ledger", label: "All Invoices" },
] as const;

export default async function AccountingPage(props: {
  searchParams: Promise<{ tab?: string; through?: string; q?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user || !["admin", "accountant"].includes(user.role)) {
    return (
      <div className="p-6 max-w-xl mx-auto">
        <div className="rounded-xs bg-white border border-slate-200 p-8 text-center space-y-2">
          <ShieldAlert className="w-8 h-8 text-amber-500 mx-auto" />
          <h1 className="text-base font-bold text-slate-900">
            Accounting Portal Restricted
          </h1>
          <p className="text-xs text-slate-600">
            Switch to the Accountant or Admin account in the bottom-left sidebar to view accounting batch captures.
          </p>
        </div>
      </div>
    );
  }

  const sp = await props.searchParams;
  const tab = TABS.find((t) => t.key === sp.tab)?.key ?? "capture";
  const today = new Date().toISOString().slice(0, 10);
  const through = /^\d{4}-\d{2}-\d{2}$/.test(sp.through ?? "") ? sp.through! : today;
  const db = await getDb();

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <div className="bg-white border-b border-slate-200 px-6 h-16 flex flex-wrap items-center justify-between gap-4 shrink-0">
        <h1 className="text-xl font-normal text-slate-600 tracking-tight">
          Accounting &amp; Batch Export
        </h1>

        <div className="flex items-center gap-1">
          {TABS.map((t) => (
            <Link
              key={t.key}
              href={`/accounting?tab=${t.key}`}
              className={`px-3.5 py-1.5 text-xs font-semibold rounded-xs transition ${
                tab === t.key
                  ? "bg-[#186ade] text-white shadow-2xs"
                  : "text-slate-600 hover:bg-slate-100"
              }`}
            >
              {t.label}
            </Link>
          ))}
        </div>
      </div>

      <div className="p-6 max-w-7xl w-full mx-auto space-y-6">
        {tab === "capture" && (await CaptureTab({ through, today }))}
        {tab === "batches" && (await BatchesTab())}
        {tab === "ledger" && (await LedgerTab({ q: sp.q ?? "" }))}
      </div>
    </div>
  );

  async function CaptureTab({ through, today }: { through: string; today: string }) {
    const pending = await getPendingCapture(through);
    const t = pending.totals;
    const nothing = t.invoiceCount + t.voidCount + t.paymentCount === 0;
    const exportQs = (type: string) => `/accounting/export?type=${type}&through=${through}`;

    return (
      <div className="space-y-5">
        <div className="rounded-xs bg-white border border-slate-200 p-4 flex flex-wrap items-end justify-between gap-4">
          <form action="/accounting" className="flex flex-wrap items-end gap-3">
            <input type="hidden" name="tab" value="capture" />
            <div>
              <label htmlFor="through" className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1">
                Capture Period Through
              </label>
              <input
                id="through"
                type="date"
                name="through"
                defaultValue={through}
                max={today}
                className="rounded-xs border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-900"
              />
            </div>
            <button
              type="submit"
              className="rounded-xs bg-[#186ade] hover:bg-[#1458b8] text-white font-semibold text-xs px-4 py-1.5 cursor-pointer"
            >
              Update Cutoff
            </button>
          </form>

          {!nothing && (
            <div className="flex flex-wrap gap-2">
              <a
                href={exportQs("invoices")}
                className="inline-flex items-center gap-1.5 rounded-xs border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 font-semibold text-xs px-3 py-1.5"
              >
                <Download className="w-3.5 h-3.5 text-[#186ade]" /> Export Invoices (CSV)
              </a>
              <a
                href={exportQs("payments")}
                className="inline-flex items-center gap-1.5 rounded-xs border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 font-semibold text-xs px-3 py-1.5"
              >
                <Download className="w-3.5 h-3.5 text-[#186ade]" /> Export Payments (CSV)
              </a>
            </div>
          )}
        </div>

        <div className="rounded-xs bg-white border border-slate-200 shadow-2xs grid grid-cols-2 lg:grid-cols-5 divide-y lg:divide-y-0 lg:divide-x divide-slate-200">
          {[
            { label: "Total Sales (Before Tax)", value: formatCAD(t.salesNetCents), sub: `${t.invoiceCount} invoices` },
            { label: "HST Charged", value: formatCAD(t.hstCents), sub: "collected on sales" },
            { label: "Total Invoiced", value: formatCAD(t.salesTotalCents), sub: "sales + HST" },
            { label: "Payments Received", value: formatCAD(t.paymentsCents), sub: `${t.paymentCount} payments` },
            { label: "HST Inside Payments", value: formatCAD(t.hstInPaymentsCents), sub: "cash-basis tax" },
          ].map((c) => (
            <div key={c.label} className="p-4">
              <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{c.label}</div>
              <div className="text-lg font-bold text-slate-900 tabular-nums mt-1">{c.value}</div>
              <div className="text-[11px] text-slate-500">{c.sub}</div>
            </div>
          ))}
        </div>

        {nothing ? (
          <div className="rounded-xs bg-emerald-50 border border-emerald-200 p-5 text-xs text-emerald-950">
            All transactions through {through} have already been captured.
          </div>
        ) : (
          <>
            <Section title={`Invoices Issued (${t.invoiceCount})`}>
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-200 bg-white text-[11px] font-bold text-slate-500">
                    <th className="py-2.5 px-4 border-r border-slate-200">Invoice #</th>
                    <th className="py-2.5 px-4 border-r border-slate-200">Date</th>
                    <th className="py-2.5 px-4 border-r border-slate-200">Customer</th>
                    <th className="py-2.5 px-4 border-r border-slate-200 text-right">Net</th>
                    <th className="py-2.5 px-4 border-r border-slate-200 text-right">HST</th>
                    <th className="py-2.5 px-4 text-right">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {pending.invoices.map((i) => (
                    <tr key={i.id}>
                      <td className="py-2.5 px-4 border-r border-slate-200 tabular-nums font-bold">#{i.invoiceNumber}</td>
                      <td className="py-2.5 px-4 border-r border-slate-200 tabular-nums whitespace-nowrap">{i.issueDate}</td>
                      <td className="py-2.5 px-4 border-r border-slate-200">
                        <span className="font-semibold text-slate-800">{i.customerName}</span>
                        <div className="text-[11px] text-slate-400">{i.description}</div>
                      </td>
                      <td className="py-2.5 px-4 border-r border-slate-200 text-right tabular-nums whitespace-nowrap">{formatCAD(i.subtotalCents)}</td>
                      <td className="py-2.5 px-4 border-r border-slate-200 text-right tabular-nums whitespace-nowrap">{formatCAD(i.taxCents)}</td>
                      <td className="py-2.5 px-4 text-right tabular-nums font-bold whitespace-nowrap">{formatCAD(i.totalCents)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Section>

            {pending.voids.length > 0 && (
              <Section title={`Voided Invoices (${t.voidCount})`}>
                <table className="w-full text-left border-collapse text-xs">
                  <tbody className="divide-y divide-slate-200">
                    {pending.voids.map((v) => (
                      <tr key={v.id}>
                        <td className="py-2.5 px-4 border-r border-slate-200 tabular-nums font-bold line-through">#{v.invoiceNumber}</td>
                        <td className="py-2.5 px-4 border-r border-slate-200">{v.customerName}</td>
                        <td className="py-2.5 px-4 border-r border-slate-200 text-slate-600">{v.voidReason}</td>
                        <td className="py-2.5 px-4 text-right text-slate-500">
                          {v.capturedBatchId && v.capturedBatchId !== null ? "Was in an earlier capture" : "Never captured"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Section>
            )}

            <Section title={`Payments Received (${t.paymentCount})`}>
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-200 bg-white text-[11px] font-bold text-slate-500">
                    <th className="py-2.5 px-4 border-r border-slate-200">Received</th>
                    <th className="py-2.5 px-4 border-r border-slate-200">Invoice #</th>
                    <th className="py-2.5 px-4 border-r border-slate-200">Customer</th>
                    <th className="py-2.5 px-4 border-r border-slate-200">Method</th>
                    <th className="py-2.5 px-4 border-r border-slate-200 text-right">Amount</th>
                    <th className="py-2.5 px-4 text-right">HST Inside</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {pending.payments.map((p) => (
                    <tr key={p.id}>
                      <td className="py-2.5 px-4 border-r border-slate-200 tabular-nums whitespace-nowrap">{p.receivedOn}</td>
                      <td className="py-2.5 px-4 border-r border-slate-200 tabular-nums font-bold">#{p.invoiceNumber}</td>
                      <td className="py-2.5 px-4 border-r border-slate-200">{p.customerName}</td>
                      <td className="py-2.5 px-4 border-r border-slate-200">{p.method}{p.reference ? ` • ${p.reference}` : ""}</td>
                      <td className="py-2.5 px-4 border-r border-slate-200 text-right tabular-nums font-bold whitespace-nowrap">{formatCAD(p.amountCents)}</td>
                      <td className="py-2.5 px-4 text-right tabular-nums whitespace-nowrap">{formatCAD(p.taxPortionCents)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Section>

            <AccountingCaptureClient
              throughDate={through}
              summary={`${t.invoiceCount} invoices, ${t.voidCount} voids, ${t.paymentCount} payments`}
            />
          </>
        )}
      </div>
    );
  }

  async function BatchesTab() {
    const batches = await db.select().from(accountingBatches).orderBy(desc(accountingBatches.id));
    return (
      <Section title="Past Accounting Captures">
        {batches.length === 0 ? (
          <div className="p-6 text-xs text-slate-500">Nothing captured yet.</div>
        ) : (
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-200 bg-white text-[11px] font-bold text-slate-500">
                <th className="py-2.5 px-4 border-r border-slate-200">Batch</th>
                <th className="py-2.5 px-4 border-r border-slate-200">Through</th>
                <th className="py-2.5 px-4 border-r border-slate-200">Captured By</th>
                <th className="py-2.5 px-4 border-r border-slate-200 text-right">Invoices</th>
                <th className="py-2.5 px-4 border-r border-slate-200 text-right">Sales (Net)</th>
                <th className="py-2.5 px-4 border-r border-slate-200 text-right">HST</th>
                <th className="py-2.5 px-4 border-r border-slate-200 text-right">Payments</th>
                <th className="py-2.5 px-4">CSV Exports</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {batches.map((b) => (
                <tr key={b.id}>
                  <td className="py-2.5 px-4 border-r border-slate-200 tabular-nums font-bold">
                    #{b.id}
                    <div className="text-slate-400 font-normal">{b.note}</div>
                  </td>
                  <td className="py-2.5 px-4 border-r border-slate-200 tabular-nums whitespace-nowrap">{b.throughDate}</td>
                  <td className="py-2.5 px-4 border-r border-slate-200">
                    {b.capturedByName}
                    <div className="text-slate-400 tabular-nums">{new Date(b.createdAt).toLocaleDateString("en-CA")}</div>
                  </td>
                  <td className="py-2.5 px-4 border-r border-slate-200 text-right tabular-nums">{b.invoiceCount}{b.voidCount ? ` (+${b.voidCount} void)` : ""}</td>
                  <td className="py-2.5 px-4 border-r border-slate-200 text-right tabular-nums whitespace-nowrap">{formatCAD(b.salesNetCents)}</td>
                  <td className="py-2.5 px-4 border-r border-slate-200 text-right tabular-nums whitespace-nowrap">{formatCAD(b.hstCents)}</td>
                  <td className="py-2.5 px-4 border-r border-slate-200 text-right tabular-nums whitespace-nowrap">{formatCAD(b.paymentsCents)}</td>
                  <td className="py-2.5 px-4 whitespace-nowrap">
                    <a className="text-[#186ade] font-semibold hover:underline" href={`/accounting/export?type=invoices&batch=${b.id}`}>Invoices</a>
                    {" • "}
                    <a className="text-[#186ade] font-semibold hover:underline" href={`/accounting/export?type=payments&batch=${b.id}`}>Payments</a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Section>
    );
  }

  async function LedgerTab({ q }: { q: string }) {
    const rows = await db
      .select({ inv: invoices, customerName: customers.name })
      .from(invoices)
      .innerJoin(customers, eq(invoices.customerId, customers.id))
      .orderBy(desc(invoices.invoiceNumber));
    const allPayments = await db.select().from(payments);
    const paidBy = new Map<number, number>();
    for (const p of allPayments) paidBy.set(p.invoiceId, (paidBy.get(p.invoiceId) ?? 0) + p.amountCents);

    const query = q.trim().toLowerCase();
    const filtered = rows.filter(({ inv, customerName }) =>
      !query ? true : [inv.invoiceNumber, customerName, inv.reference ?? "", inv.description ?? ""].join(" ").toLowerCase().includes(query)
    );

    const issued = rows.filter(({ inv }) => inv.status === "issued");
    const owing = issued.reduce((a, { inv }) => a + (inv.totalCents - (paidBy.get(inv.id) ?? 0)), 0);
    const overdue = issued.reduce(
      (a, { inv }) => (inv.dueDate && inv.dueDate < today ? a + (inv.totalCents - (paidBy.get(inv.id) ?? 0)) : a),
      0
    );

    return (
      <div className="space-y-4">
        <div className="rounded-xs bg-white border border-slate-200 shadow-2xs grid grid-cols-2 divide-x divide-slate-200 max-w-xl">
          <div className="p-4">
            <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Total Owing</div>
            <div className="text-lg font-bold text-slate-900 tabular-nums mt-0.5">{formatCAD(owing)}</div>
          </div>
          <div className="p-4">
            <div className="text-[10px] font-bold uppercase tracking-wider text-rose-600">Overdue</div>
            <div className="text-lg font-bold text-rose-600 tabular-nums mt-0.5">{formatCAD(overdue)}</div>
          </div>
        </div>
        <form action="/accounting" className="max-w-md">
          <input type="hidden" name="tab" value="ledger" />
          <label htmlFor="ledger-q" className="sr-only">Search invoices</label>
          <input id="ledger-q" name="q" defaultValue={q} placeholder="Search invoice #, customer, PO…" className="w-full rounded-xs border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900" />
        </form>
        <Section title={`All Invoices (${filtered.length})`}>
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-200 bg-white text-[11px] font-bold text-slate-500">
                <th className="py-2.5 px-4 border-r border-slate-200">Invoice #</th>
                <th className="py-2.5 px-4 border-r border-slate-200">Customer</th>
                <th className="py-2.5 px-4 border-r border-slate-200">Date</th>
                <th className="py-2.5 px-4 border-r border-slate-200">Status</th>
                <th className="py-2.5 px-4 border-r border-slate-200 text-right">Total</th>
                <th className="py-2.5 px-4 border-r border-slate-200 text-right">Paid</th>
                <th className="py-2.5 px-4 border-r border-slate-200 text-right">Owing</th>
                <th className="py-2.5 px-4">Batch</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {filtered.map(({ inv, customerName }) => {
                const paid = paidBy.get(inv.id) ?? 0;
                const owingRow = inv.status === "issued" ? inv.totalCents - paid : 0;
                const late = inv.status === "issued" && inv.dueDate && inv.dueDate < today && owingRow > 0;
                return (
                  <tr key={inv.id}>
                    <td className="py-2.5 px-4 border-r border-slate-200 tabular-nums font-bold">
                      {inv.projectId ? <Link href={`/projects/${inv.projectId}?tab=billing`} className="text-[#186ade] hover:underline">#{inv.invoiceNumber}</Link> : `#${inv.invoiceNumber}`}
                    </td>
                    <td className="py-2.5 px-4 border-r border-slate-200">{customerName}<div className="text-slate-400">{inv.description}</div></td>
                    <td className="py-2.5 px-4 border-r border-slate-200 tabular-nums whitespace-nowrap">{inv.issueDate ?? "—"}{late && <div className="text-rose-600 font-semibold">Overdue</div>}</td>
                    <td className="py-2.5 px-4 border-r border-slate-200 uppercase font-semibold">{inv.status}</td>
                    <td className="py-2.5 px-4 border-r border-slate-200 text-right tabular-nums whitespace-nowrap">{formatCAD(inv.totalCents)}</td>
                    <td className="py-2.5 px-4 border-r border-slate-200 text-right tabular-nums whitespace-nowrap">{formatCAD(paid)}</td>
                    <td className="py-2.5 px-4 border-r border-slate-200 text-right tabular-nums font-bold whitespace-nowrap">{formatCAD(owingRow)}</td>
                    <td className="py-2.5 px-4 tabular-nums">{inv.capturedBatchId ? `#${inv.capturedBatchId}` : "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Section>
      </div>
    );
  }
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xs bg-white border border-slate-200 shadow-2xs overflow-hidden">
      <div className="bg-[#f8fafc] px-4 py-2.5 border-b border-slate-200 text-xs font-bold uppercase tracking-wider text-slate-700">{title}</div>
      <div className="overflow-x-auto">{children}</div>
    </div>
  );
}
