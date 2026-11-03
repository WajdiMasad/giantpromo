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
  { key: "capture", label: "To capture" },
  { key: "batches", label: "Past captures" },
  { key: "ledger", label: "All invoices" },
] as const;

export default async function AccountingPage(props: {
  searchParams: Promise<{ tab?: string; through?: string; q?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user || !["admin", "accountant"].includes(user.role)) {
    return (
      <div className="max-w-xl mx-auto rounded-2xl bg-white border border-slate-200 p-8 text-center space-y-2">
        <ShieldAlert className="w-8 h-8 text-amber-500 mx-auto" />
        <h1 className="text-lg font-bold text-slate-900">Accounting is for the accountant and admins</h1>
        <p className="text-sm text-slate-600">Switch to the accountant account, or ask an admin for access.</p>
      </div>
    );
  }

  const sp = await props.searchParams;
  const tab = TABS.find((t) => t.key === sp.tab)?.key ?? "capture";
  const today = new Date().toISOString().slice(0, 10);
  const through = /^\d{4}-\d{2}-\d{2}$/.test(sp.through ?? "") ? sp.through! : today;
  const db = await getDb();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Accounting</h1>
        <p className="text-sm text-slate-600 mt-0.5">
          Everything billed and received lives in this app. Capture it into Sage Accounting in one pass, then lock it in.
        </p>
      </div>

      <div className="border-b border-slate-200 flex gap-1 overflow-x-auto">
        {TABS.map((t) => (
          <Link
            key={t.key}
            href={`/accounting?tab=${t.key}`}
            className={`px-4 py-2.5 text-sm font-semibold whitespace-nowrap border-b-2 -mb-px ${
              tab === t.key ? "border-amber-500 text-slate-900" : "border-transparent text-slate-500 hover:text-slate-800"
            }`}
          >
            {t.label}
          </Link>
        ))}
      </div>

      {tab === "capture" && (await CaptureTab({ through, today }))}
      {tab === "batches" && (await BatchesTab())}
      {tab === "ledger" && (await LedgerTab({ q: sp.q ?? "" }))}
    </div>
  );

  async function CaptureTab({ through, today }: { through: string; today: string }) {
    const pending = await getPendingCapture(through);
    const t = pending.totals;
    const nothing = t.invoiceCount + t.voidCount + t.paymentCount === 0;
    const exportQs = (type: string) => `/accounting/export?type=${type}&through=${through}`;

    return (
      <div className="space-y-6">
        <form action="/accounting" className="flex flex-wrap items-end gap-3">
          <input type="hidden" name="tab" value="capture" />
          <div>
            <label htmlFor="through" className="block text-xs font-semibold text-slate-700 mb-1">
              Capture everything through
            </label>
            <input
              id="through"
              type="date"
              name="through"
              defaultValue={through}
              max={today}
              className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
            />
          </div>
          <button type="submit" className="rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-semibold text-xs px-4 py-2.5 cursor-pointer">
            Update
          </button>
        </form>

        <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
          {[
            { label: "Total sales (before tax)", value: formatCAD(t.salesNetCents), sub: `${t.invoiceCount} invoices` },
            { label: "HST charged on those sales", value: formatCAD(t.hstCents), sub: "collected from customers" },
            { label: "Total invoiced", value: formatCAD(t.salesTotalCents), sub: "sales + HST" },
            { label: "Payments received", value: formatCAD(t.paymentsCents), sub: `${t.paymentCount} payments` },
            { label: "HST inside those payments", value: formatCAD(t.hstInPaymentsCents), sub: "for cash-basis reporting" },
          ].map((c) => (
            <div key={c.label} className="rounded-2xl bg-white border border-slate-200 p-4">
              <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">{c.label}</div>
              <div className="text-xl font-black text-slate-900 mt-1">{c.value}</div>
              <div className="text-xs text-slate-500">{c.sub}</div>
            </div>
          ))}
        </div>

        {nothing ? (
          <div className="rounded-2xl bg-emerald-50 border border-emerald-200 p-6 text-sm text-emerald-950">
            You&apos;re all caught up through {through}. Nothing new has been issued, voided or paid.
          </div>
        ) : (
          <>
            <div className="flex flex-wrap gap-2">
              <a href={exportQs("invoices")} className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-slate-800 font-semibold text-xs px-3.5 py-2.5">
                <Download className="w-3.5 h-3.5" /> Download invoices (CSV)
              </a>
              <a href={exportQs("payments")} className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-slate-800 font-semibold text-xs px-3.5 py-2.5">
                <Download className="w-3.5 h-3.5" /> Download payments (CSV)
              </a>
            </div>

            <Section title={`Invoices issued (${t.invoiceCount})`}>
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50/70 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                    <th className="py-2.5 px-4">Invoice #</th><th className="py-2.5 px-4">Date</th><th className="py-2.5 px-4">Customer</th>
                    <th className="py-2.5 px-4 text-right">Net</th><th className="py-2.5 px-4 text-right">HST</th><th className="py-2.5 px-4 text-right">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {pending.invoices.map((i) => (
                    <tr key={i.id}>
                      <td className="py-2.5 px-4 font-mono text-xs font-bold">{i.invoiceNumber}</td>
                      <td className="py-2.5 px-4 text-xs whitespace-nowrap">{i.issueDate}</td>
                      <td className="py-2.5 px-4 text-xs">{i.customerName}<div className="text-slate-400">{i.description}</div></td>
                      <td className="py-2.5 px-4 text-right text-xs whitespace-nowrap">{formatCAD(i.subtotalCents)}</td>
                      <td className="py-2.5 px-4 text-right text-xs whitespace-nowrap">{formatCAD(i.taxCents)}</td>
                      <td className="py-2.5 px-4 text-right text-xs font-bold whitespace-nowrap">{formatCAD(i.totalCents)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Section>

            {pending.voids.length > 0 && (
              <Section title={`Voided invoices (${t.voidCount}) — enter as void so the numbers have no gaps`}>
                <table className="w-full text-left text-sm">
                  <tbody className="divide-y divide-slate-100">
                    {pending.voids.map((v) => (
                      <tr key={v.id}>
                        <td className="py-2.5 px-4 font-mono text-xs font-bold line-through">{v.invoiceNumber}</td>
                        <td className="py-2.5 px-4 text-xs">{v.customerName}</td>
                        <td className="py-2.5 px-4 text-xs text-slate-600">{v.voidReason}</td>
                        <td className="py-2.5 px-4 text-xs text-right text-slate-500">
                          {v.capturedBatchId && v.capturedBatchId !== null ? "Was in an earlier capture" : "Never captured"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Section>
            )}

            <Section title={`Payments received (${t.paymentCount})`}>
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50/70 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                    <th className="py-2.5 px-4">Received</th><th className="py-2.5 px-4">Invoice #</th><th className="py-2.5 px-4">Customer</th>
                    <th className="py-2.5 px-4">Method</th><th className="py-2.5 px-4 text-right">Amount</th><th className="py-2.5 px-4 text-right">HST inside</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {pending.payments.map((p) => (
                    <tr key={p.id}>
                      <td className="py-2.5 px-4 text-xs whitespace-nowrap">{p.receivedOn}</td>
                      <td className="py-2.5 px-4 font-mono text-xs font-bold">{p.invoiceNumber}</td>
                      <td className="py-2.5 px-4 text-xs">{p.customerName}</td>
                      <td className="py-2.5 px-4 text-xs">{p.method}{p.reference ? ` • ${p.reference}` : ""}</td>
                      <td className="py-2.5 px-4 text-right text-xs font-bold whitespace-nowrap">{formatCAD(p.amountCents)}</td>
                      <td className="py-2.5 px-4 text-right text-xs whitespace-nowrap">{formatCAD(p.taxPortionCents)}</td>
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
      <Section title="Past captures">
        {batches.length === 0 ? (
          <div className="p-6 text-sm text-slate-500">Nothing captured yet.</div>
        ) : (
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/70 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                <th className="py-2.5 px-4">Batch</th><th className="py-2.5 px-4">Through</th><th className="py-2.5 px-4">Captured by</th>
                <th className="py-2.5 px-4 text-right">Invoices</th><th className="py-2.5 px-4 text-right">Sales (net)</th>
                <th className="py-2.5 px-4 text-right">HST</th><th className="py-2.5 px-4 text-right">Payments</th><th className="py-2.5 px-4">Files</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {batches.map((b) => (
                <tr key={b.id}>
                  <td className="py-2.5 px-4 font-mono text-xs font-bold">#{b.id}<div className="text-slate-400 font-sans font-normal">{b.note}</div></td>
                  <td className="py-2.5 px-4 text-xs whitespace-nowrap">{b.throughDate}</td>
                  <td className="py-2.5 px-4 text-xs">{b.capturedByName}<div className="text-slate-400">{new Date(b.createdAt).toLocaleDateString("en-CA")}</div></td>
                  <td className="py-2.5 px-4 text-right text-xs">{b.invoiceCount}{b.voidCount ? ` (+${b.voidCount} void)` : ""}</td>
                  <td className="py-2.5 px-4 text-right text-xs whitespace-nowrap">{formatCAD(b.salesNetCents)}</td>
                  <td className="py-2.5 px-4 text-right text-xs whitespace-nowrap">{formatCAD(b.hstCents)}</td>
                  <td className="py-2.5 px-4 text-right text-xs whitespace-nowrap">{formatCAD(b.paymentsCents)}</td>
                  <td className="py-2.5 px-4 text-xs whitespace-nowrap">
                    <a className="text-amber-600 font-semibold hover:underline" href={`/accounting/export?type=invoices&batch=${b.id}`}>Invoices</a>
                    {" • "}
                    <a className="text-amber-600 font-semibold hover:underline" href={`/accounting/export?type=payments&batch=${b.id}`}>Payments</a>
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
        <div className="grid grid-cols-2 gap-4 max-w-xl">
          <div className="rounded-2xl bg-white border border-slate-200 p-4">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Owing to us</div>
            <div className="text-xl font-black text-slate-900">{formatCAD(owing)}</div>
          </div>
          <div className="rounded-2xl bg-white border border-rose-200 p-4">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-rose-600">Overdue</div>
            <div className="text-xl font-black text-rose-600">{formatCAD(overdue)}</div>
          </div>
        </div>
        <form action="/accounting" className="max-w-md">
          <input type="hidden" name="tab" value="ledger" />
          <label htmlFor="ledger-q" className="sr-only">Search invoices</label>
          <input id="ledger-q" name="q" defaultValue={q} placeholder="Search invoice #, customer, PO…" className="w-full rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm text-slate-900" />
        </form>
        <Section title={`All invoices (${filtered.length})`}>
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/70 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                <th className="py-2.5 px-4">Invoice #</th><th className="py-2.5 px-4">Customer</th><th className="py-2.5 px-4">Date</th>
                <th className="py-2.5 px-4">Status</th><th className="py-2.5 px-4 text-right">Total</th><th className="py-2.5 px-4 text-right">Paid</th>
                <th className="py-2.5 px-4 text-right">Owing</th><th className="py-2.5 px-4">In books</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.map(({ inv, customerName }) => {
                const paid = paidBy.get(inv.id) ?? 0;
                const owingRow = inv.status === "issued" ? inv.totalCents - paid : 0;
                const late = inv.status === "issued" && inv.dueDate && inv.dueDate < today && owingRow > 0;
                return (
                  <tr key={inv.id}>
                    <td className="py-2.5 px-4 font-mono text-xs font-bold">
                      {inv.projectId ? <Link href={`/projects/${inv.projectId}?tab=billing`} className="hover:underline">{inv.invoiceNumber}</Link> : inv.invoiceNumber}
                    </td>
                    <td className="py-2.5 px-4 text-xs">{customerName}<div className="text-slate-400">{inv.description}</div></td>
                    <td className="py-2.5 px-4 text-xs whitespace-nowrap">{inv.issueDate ?? "—"}{late && <div className="text-rose-600 font-semibold">Overdue</div>}</td>
                    <td className="py-2.5 px-4 text-xs uppercase font-semibold">{inv.status}</td>
                    <td className="py-2.5 px-4 text-right text-xs whitespace-nowrap">{formatCAD(inv.totalCents)}</td>
                    <td className="py-2.5 px-4 text-right text-xs whitespace-nowrap">{formatCAD(paid)}</td>
                    <td className="py-2.5 px-4 text-right text-xs font-bold whitespace-nowrap">{formatCAD(owingRow)}</td>
                    <td className="py-2.5 px-4 text-xs">{inv.capturedBatchId ? `#${inv.capturedBatchId}` : "—"}</td>
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
    <div className="rounded-2xl bg-white border border-slate-200/90 shadow-xs overflow-hidden">
      <div className="px-4 py-3 border-b border-slate-100 text-sm font-bold text-slate-900">{title}</div>
      <div className="overflow-x-auto">{children}</div>
    </div>
  );
}
