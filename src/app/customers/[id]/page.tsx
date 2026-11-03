import Link from "next/link";
import { notFound } from "next/navigation";
import { asc, desc, eq, inArray } from "drizzle-orm";
import {
  ArrowLeft,
  Building,
  CheckCircle2,
  Clock,
  ExternalLink,
  FileText,
  Mail,
  MapPin,
  Phone,
  Plus,
  Receipt,
  Truck,
} from "lucide-react";
import { getDb } from "@/db";
import {
  customers,
  equipment,
  equipmentRentals,
  invoices,
  payments,
  projects,
} from "@/db/schema";
import { formatCAD } from "@/lib/money";
import { PIPELINE, STAGE_LABEL, isSigned, pipelineOf, projectRef } from "@/lib/project-status";

export const dynamic = "force-dynamic";

export default async function CustomerDetailPage(props: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const { id } = await props.params;
  const { tab: tabParam } = await props.searchParams;
  const customerId = Number(id);
  if (!customerId) notFound();

  const db = await getDb();

  // 1. Fetch customer
  const [customer] = await db
    .select()
    .from(customers)
    .where(eq(customers.id, customerId))
    .limit(1);

  if (!customer) notFound();

  // 2. Fetch projects (quotes & jobs)
  const customerProjects = await db
    .select()
    .from(projects)
    .where(eq(projects.customerId, customerId))
    .orderBy(desc(projects.id));

  // 3. Fetch invoices & payments
  const customerInvoices = await db
    .select()
    .from(invoices)
    .where(eq(invoices.customerId, customerId))
    .orderBy(desc(invoices.id));

  const invoiceIds = customerInvoices.map((i) => i.id);
  const customerPayments =
    invoiceIds.length > 0
      ? await db
          .select()
          .from(payments)
          .where(inArray(payments.invoiceId, invoiceIds))
          .orderBy(desc(payments.receivedOn))
      : [];

  // 4. Fetch active equipment rentals
  const customerRentals = await db
    .select({
      rental: equipmentRentals,
      unit: equipment,
    })
    .from(equipmentRentals)
    .innerJoin(equipment, eq(equipmentRentals.equipmentId, equipment.id))
    .where(eq(equipmentRentals.customerId, customerId))
    .orderBy(desc(equipmentRentals.startDate));

  // Financial aggregates
  const totalPaidCents = customerPayments.reduce((a, p) => a + p.amountCents, 0);
  const totalBilledCents = customerInvoices
    .filter((i) => i.status === "issued")
    .reduce((a, i) => a + i.totalCents, 0);
  const outstandingBalanceCents = Math.max(0, totalBilledCents - totalPaidCents);

  const lifetimeSpendCents = customerProjects
    .filter((p) => ["installed", "invoiced", "paid"].includes(p.status))
    .reduce((a, p) => a + p.totalCents, 0);

  const activeJobs = customerProjects.filter((p) =>
    ["approved", "scheduled", "in_progress", "installed", "invoiced"].includes(p.status)
  );
  const openQuotes = customerProjects.filter((p) =>
    ["new", "quote_sent", "action_needed"].includes(p.status)
  );

  const activeTab = tabParam ?? "projects";

  return (
    <div className="space-y-6">
      {/* Back Link */}
      <div className="flex items-center justify-between">
        <Link
          href="/customers"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-600 hover:text-slate-900"
        >
          <ArrowLeft className="w-4 h-4" /> All customers
        </Link>
        <Link
          href={`/projects/new?customerId=${customer.id}`}
          className="inline-flex items-center gap-2 rounded-xl bg-slate-950 hover:bg-slate-800 text-white font-semibold text-xs px-4 py-2.5 transition cursor-pointer"
        >
          <Plus className="w-4 h-4 text-amber-400" />
          New Quote for {customer.name}
        </Link>
      </div>

      {/* Customer Header Banner */}
      <div className="rounded-3xl bg-slate-950 text-white p-6 sm:p-8 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
          <div className="space-y-1.5">
            <div className="flex items-center gap-2">
              <span className="font-mono text-xs font-bold px-2 py-0.5 rounded bg-slate-800 text-slate-300">
                CLIENT #{customer.id}
              </span>
              <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                {customer.province} TAX RULES ({customer.taxExempt ? "TAX EXEMPT" : "STANDARD HST"})
              </span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-white">
              {customer.name}
            </h1>
            {customer.companyName && customer.companyName !== customer.name && (
              <div className="text-sm text-slate-400 flex items-center gap-1.5">
                <Building className="w-3.5 h-3.5" />
                {customer.companyName}
              </div>
            )}
          </div>

          {/* Quick Metrics Chips */}
          <div className="flex flex-wrap sm:flex-col items-start sm:items-end gap-2 text-right">
            <div className="bg-slate-900 border border-slate-800 px-3.5 py-2 rounded-xl">
              <div className="text-[11px] text-slate-400 uppercase tracking-wider">Outstanding Balance</div>
              <div
                className={`text-lg font-bold font-mono ${
                  outstandingBalanceCents > 0 ? "text-amber-400" : "text-emerald-400"
                }`}
              >
                {formatCAD(outstandingBalanceCents)}
              </div>
            </div>
            <div className="bg-slate-900 border border-slate-800 px-3.5 py-1.5 rounded-xl text-xs">
              <span className="text-slate-400">Lifetime Revenue: </span>
              <strong className="text-white font-mono">{formatCAD(lifetimeSpendCents)}</strong>
            </div>
          </div>
        </div>

        {/* Contact Coordinates & Payment Terms */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 pt-3 border-t border-slate-800/80 text-xs">
          <div>
            <div className="text-slate-400 uppercase tracking-wider text-[10px] font-semibold mb-0.5">
              Contact Person
            </div>
            <div className="font-semibold text-slate-200">
              {customer.contactPerson || "Primary Contact"}
            </div>
          </div>

          <div>
            <div className="text-slate-400 uppercase tracking-wider text-[10px] font-semibold mb-0.5">
              Email & Phone
            </div>
            <div className="space-y-0.5">
              {customer.email ? (
                <a href={`mailto:${customer.email}`} className="text-amber-400 hover:underline block truncate">
                  {customer.email}
                </a>
              ) : (
                <span className="text-slate-500">—</span>
              )}
              {customer.phone && (
                <a href={`tel:${customer.phone}`} className="text-slate-300 hover:text-white block font-mono">
                  {customer.phone}
                </a>
              )}
            </div>
          </div>

          <div>
            <div className="text-slate-400 uppercase tracking-wider text-[10px] font-semibold mb-0.5">
              Billing Address
            </div>
            <div className="text-slate-300">
              {customer.addressLine1 ? (
                <>
                  <div>{customer.addressLine1}</div>
                  <div>
                    {customer.city}, {customer.province} {customer.postalCode}
                  </div>
                </>
              ) : (
                <span className="text-slate-500">—</span>
              )}
            </div>
          </div>

          <div>
            <div className="text-slate-400 uppercase tracking-wider text-[10px] font-semibold mb-0.5">
              Payment Terms
            </div>
            <div className="font-semibold text-slate-200">{customer.paymentTerms || "Net 30"}</div>
          </div>
        </div>

        {/* Site & Access Notes */}
        {customer.siteNotes && (
          <div className="rounded-xl bg-slate-900 border border-slate-800 p-3 text-xs text-slate-300 flex items-start gap-2">
            <MapPin className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
            <div>
              <strong className="text-white">Installation & Site Access Notes: </strong>
              {customer.siteNotes}
            </div>
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="border-b border-slate-200 flex gap-2">
        {[
          { key: "projects", label: `Projects & Quotes (${customerProjects.length})` },
          { key: "invoices", label: `Invoices & Payments (${customerInvoices.length})` },
          { key: "equipment", label: `Active Rentals & Fleet (${customerRentals.length})` },
        ].map((t) => (
          <Link
            key={t.key}
            href={`/customers/${customer.id}?tab=${t.key}`}
            className={`px-4 py-2.5 text-sm font-semibold whitespace-nowrap border-b-2 -mb-px transition ${
              activeTab === t.key
                ? "border-amber-500 text-slate-900"
                : "border-transparent text-slate-500 hover:text-slate-800"
            }`}
          >
            {t.label}
          </Link>
        ))}
      </div>

      {/* Tab 1: Projects & Quotes */}
      {activeTab === "projects" && (
        <div className="space-y-6">
          {/* Active Jobs Section */}
          <div className="rounded-2xl bg-white border border-slate-200/90 shadow-xs overflow-hidden">
            <div className="p-4 sm:p-5 border-b border-slate-100 flex items-center justify-between">
              <div>
                <h2 className="text-base font-bold text-slate-900">
                  Active Jobs ({activeJobs.length})
                </h2>
                <p className="text-xs text-slate-500">
                  Confirmed contracts currently in progress or awaiting installation/invoicing
                </p>
              </div>
            </div>

            {activeJobs.length === 0 ? (
              <div className="p-6 text-center text-xs text-slate-500">
                No active jobs currently in progress for {customer.name}.
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {activeJobs.map((p) => {
                  const pk = PIPELINE.find((x) => x.key === pipelineOf(p.status))!;
                  return (
                    <div
                      key={p.id}
                      className="p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-slate-50/70 transition"
                    >
                      <div className="space-y-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-mono text-xs font-black px-2 py-0.5 rounded bg-slate-900 text-amber-400">
                            {p.jobNumber ? `#${p.jobNumber}` : projectRef(p)}
                          </span>
                          <span className={`inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full border bg-white ${pk.chip}`}>
                            <span className={`w-1.5 h-1.5 rounded-full ${pk.dot}`} />
                            {STAGE_LABEL[p.status] ?? pk.label}
                          </span>
                          {p.scheduledDate && (
                            <span className="text-xs text-slate-500 flex items-center gap-1">
                              <Clock className="w-3 h-3 text-slate-400" />
                              Scheduled: {p.scheduledDate}
                            </span>
                          )}
                        </div>
                        <h3 className="font-bold text-sm text-slate-900 truncate">
                          {p.title}
                        </h3>
                        {p.siteAddress && (
                          <div className="text-xs text-slate-500 flex items-center gap-1">
                            <MapPin className="w-3 h-3 text-slate-400 shrink-0" />
                            {p.siteAddress}
                          </div>
                        )}
                      </div>

                      <div className="flex items-center justify-between sm:justify-end gap-4 shrink-0">
                        <div className="text-right">
                          <div className="font-bold font-mono text-sm text-slate-900">
                            {formatCAD(p.totalCents)}
                          </div>
                          <div className="text-[11px] text-slate-400">
                            Subtotal {formatCAD(p.subtotalCents)}
                          </div>
                        </div>
                        <Link
                          href={`/projects/${p.id}`}
                          className="rounded-xl border border-slate-300 hover:bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-800 transition"
                        >
                          View Job →
                        </Link>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Open Quotes Section */}
          <div className="rounded-2xl bg-white border border-slate-200/90 shadow-xs overflow-hidden">
            <div className="p-4 sm:p-5 border-b border-slate-100 flex items-center justify-between">
              <div>
                <h2 className="text-base font-bold text-slate-900">
                  Open Quotes ({openQuotes.length})
                </h2>
                <p className="text-xs text-slate-500">
                  Proposals awaiting customer approval or requested revisions
                </p>
              </div>
            </div>

            {openQuotes.length === 0 ? (
              <div className="p-6 text-center text-xs text-slate-500">
                No open proposals pending decision for {customer.name}.
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {openQuotes.map((q) => {
                  const pk = PIPELINE.find((x) => x.key === pipelineOf(q.status))!;
                  return (
                    <div
                      key={q.id}
                      className="p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-slate-50/70 transition"
                    >
                      <div className="space-y-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-mono text-xs font-bold px-2 py-0.5 rounded bg-slate-100 text-slate-700">
                            {q.quoteNumber}
                          </span>
                          <span className={`inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full border bg-white ${pk.chip}`}>
                            <span className={`w-1.5 h-1.5 rounded-full ${pk.dot}`} />
                            {pk.label}
                          </span>
                          {q.validUntil && (
                            <span className="text-xs text-slate-500">
                              Valid until: {q.validUntil}
                            </span>
                          )}
                        </div>
                        <h3 className="font-bold text-sm text-slate-900 truncate">
                          {q.title}
                        </h3>
                      </div>

                      <div className="flex items-center justify-between sm:justify-end gap-4 shrink-0">
                        <div className="text-right">
                          <div className="font-bold font-mono text-sm text-slate-900">
                            {formatCAD(q.totalCents)}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <a
                            href={`/q/${q.publicToken}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="rounded-xl border border-slate-300 hover:bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-800 transition inline-flex items-center gap-1"
                          >
                            <ExternalLink className="w-3 h-3 text-slate-500" />
                            Client Portal
                          </a>
                          <Link
                            href={`/projects/${q.id}`}
                            className="rounded-xl bg-slate-900 hover:bg-slate-800 text-white px-3 py-1.5 text-xs font-semibold transition"
                          >
                            Details →
                          </Link>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Tab 2: Invoices & Payments */}
      {activeTab === "invoices" && (
        <div className="space-y-6">
          <div className="rounded-2xl bg-white border border-slate-200/90 shadow-xs overflow-hidden">
            <div className="p-4 sm:p-5 border-b border-slate-100">
              <h2 className="text-base font-bold text-slate-900">
                Invoices Ledger ({customerInvoices.length})
              </h2>
            </div>

            {customerInvoices.length === 0 ? (
              <div className="p-6 text-center text-xs text-slate-500">
                No invoices issued to {customer.name} yet.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50/70 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                      <th className="py-3 px-4">Invoice #</th>
                      <th className="py-3 px-4">Date</th>
                      <th className="py-3 px-4">Due Date</th>
                      <th className="py-3 px-4">Status</th>
                      <th className="py-3 px-4 text-right">Amount</th>
                      <th className="py-3 px-4 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {customerInvoices.map((inv) => (
                      <tr key={inv.id} className="hover:bg-slate-50/60">
                        <td className="py-3.5 px-4 font-mono font-bold text-slate-900">
                          #{inv.invoiceNumber}
                        </td>
                        <td className="py-3.5 px-4 text-xs text-slate-600">
                          {inv.issueDate ?? "Draft"}
                        </td>
                        <td className="py-3.5 px-4 text-xs text-slate-600">
                          {inv.dueDate ?? "—"}
                        </td>
                        <td className="py-3.5 px-4">
                          <span
                            className={`inline-flex text-[11px] font-bold px-2 py-0.5 rounded-full ${
                              inv.status === "issued"
                                ? "bg-purple-50 text-purple-700 border border-purple-200"
                                : inv.status === "draft"
                                ? "bg-slate-100 text-slate-700"
                                : "bg-rose-50 text-rose-700 border border-rose-200"
                            }`}
                          >
                            {inv.status}
                          </span>
                        </td>
                        <td className="py-3.5 px-4 font-mono font-bold text-slate-900 text-right">
                          {formatCAD(inv.totalCents)}
                        </td>
                        <td className="py-3.5 px-4 text-right">
                          {inv.projectId && (
                            <Link
                              href={`/projects/${inv.projectId}?tab=billing`}
                              className="text-xs font-semibold text-amber-600 hover:underline"
                            >
                              View Billing →
                            </Link>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Payments Received */}
          <div className="rounded-2xl bg-white border border-slate-200/90 shadow-xs overflow-hidden">
            <div className="p-4 sm:p-5 border-b border-slate-100">
              <h2 className="text-base font-bold text-slate-900">
                Payment History ({customerPayments.length})
              </h2>
            </div>

            {customerPayments.length === 0 ? (
              <div className="p-6 text-center text-xs text-slate-500">
                No payments recorded for this account.
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {customerPayments.map((p) => (
                  <div
                    key={p.id}
                    className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
                  >
                    <div>
                      <div className="font-semibold text-slate-900 text-sm">
                        {formatCAD(p.amountCents)} received via {p.method}
                      </div>
                      <div className="text-slate-500 mt-0.5">
                        Received on {p.receivedOn} • {p.reference || "No reference"}
                      </div>
                    </div>
                    <span className="inline-flex items-center gap-1 font-semibold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-full border border-emerald-200 whitespace-nowrap">
                      <CheckCircle2 className="w-3 h-3" /> Paid & Logged
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Tab 3: Active Rentals & Fleet */}
      {activeTab === "equipment" && (
        <div className="rounded-2xl bg-white border border-slate-200/90 shadow-xs overflow-hidden">
          <div className="p-4 sm:p-5 border-b border-slate-100">
            <h2 className="text-base font-bold text-slate-900">
              Deployed Fleet Units ({customerRentals.length})
            </h2>
            <p className="text-xs text-slate-500">
              Roadside signs, trailers, or event items stationed at this customer&apos;s properties
            </p>
          </div>

          {customerRentals.length === 0 ? (
            <div className="p-6 text-center text-xs text-slate-500">
              No equipment currently deployed with {customer.name}.
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {customerRentals.map(({ rental, unit }) => (
                <div
                  key={rental.id}
                  className="p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs font-black px-2 py-0.5 rounded bg-slate-900 text-amber-400">
                        {unit.code}
                      </span>
                      <span className="font-bold text-slate-900 text-sm">{unit.name}</span>
                      <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                        {rental.status}
                      </span>
                    </div>
                    <div className="text-xs text-slate-600 flex items-center gap-1">
                      <MapPin className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                      {rental.locationAddress}
                    </div>
                    <div className="text-xs text-slate-500 font-mono">
                      Rental period: {rental.startDate} → {rental.endDate || "Ongoing Monthly"}
                    </div>
                  </div>

                  <div className="text-right shrink-0">
                    <div className="font-mono font-bold text-sm text-slate-900">
                      {formatCAD(rental.monthlyRateCents)}/mo
                    </div>
                    <Link
                      href="/equipment"
                      className="text-xs font-semibold text-amber-600 hover:underline"
                    >
                      View on HRM Map →
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
