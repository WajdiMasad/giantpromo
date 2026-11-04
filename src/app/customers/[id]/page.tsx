import Link from "next/link";
import { notFound } from "next/navigation";
import { desc, eq, inArray } from "drizzle-orm";
import {
  ArrowLeft,
  Building2,
  CheckCircle2,
  ExternalLink,
  Mail,
  MapPin,
  Phone,
  Plus,
  Tag,
  User,
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
import { PIPELINE, STAGE_LABEL, pipelineOf, projectRef } from "@/lib/project-status";
import { getHistoricalInvoicesForCustomer } from "@/lib/sage-archive";
import { CustomerHistoricalJobsSection } from "@/components/CustomerHistoricalJobsSection";

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

  // 5. Fetch historical Sage jobs & invoices for this customer
  const historicalSageInvoices = getHistoricalInvoicesForCustomer(customer);
  const sageLifetimeCents = historicalSageInvoices
    .filter((i) => i.status !== "VOID")
    .reduce((sum, i) => sum + i.totalCents, 0);
  const sageUnpaidCents = historicalSageInvoices
    .filter((i) => i.status === "UNPAID" || i.status === "PART_PAID")
    .reduce((sum, i) => sum + i.totalCents, 0);

  // Financial aggregates
  const totalPaidCents = customerPayments.reduce((a, p) => a + p.amountCents, 0);
  const totalBilledCents = customerInvoices
    .filter((i) => i.status === "issued")
    .reduce((a, i) => a + i.totalCents, 0);
  const outstandingBalanceCents =
    Math.max(0, totalBilledCents - totalPaidCents) + sageUnpaidCents;

  const lifetimeSpendCents =
    customerProjects
      .filter((p) =>
        ["approved", "scheduled", "in_progress", "installed", "invoiced", "paid"].includes(p.status)
      )
      .reduce((a, p) => a + p.totalCents, 0) + sageLifetimeCents;

  const activeJobs = customerProjects.filter((p) =>
    ["approved", "scheduled", "in_progress", "installed", "invoiced"].includes(p.status)
  );
  const openQuotes = customerProjects.filter((p) =>
    ["new", "quote_sent", "action_needed"].includes(p.status)
  );

  const activeTab = tabParam ?? "projects";

  const TABS = [
    {
      key: "projects",
      label: `PROJECTS & PAST JOBS (${customerProjects.length + historicalSageInvoices.length})`,
    },
    {
      key: "invoices",
      label: `INVOICES & PAYMENTS (${customerInvoices.length + historicalSageInvoices.length})`,
    },
    { key: "equipment", label: `ACTIVE RENTALS (${customerRentals.length})` },
  ];

  return (
    <div className="flex-1 flex flex-col min-h-0">
      {/* Goodshuffle Pro Full-Bleed Slate-Blue Account Header with Centered Folder Tabs */}
      <div className="bg-[#2b3c4e] text-white px-6 pt-5 pb-0 shrink-0">
        <div className="max-w-7xl mx-auto">
          <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4 pb-5">
            <div className="space-y-1.5 min-w-0">
              <div className="flex items-center gap-2 text-xs text-slate-300 mb-1">
                <Link
                  href="/customers"
                  className="inline-flex items-center gap-1 hover:text-white transition"
                >
                  <ArrowLeft className="w-3.5 h-3.5" /> Directory
                </Link>
                <span>/</span>
                <span className="tabular-nums">Account #{customer.id}</span>
              </div>

              <div className="flex flex-wrap items-center gap-2.5">
                <Building2 className="w-5 h-5 text-[#2b7fff] shrink-0" />
                <h1 className="text-xl sm:text-2xl font-normal tracking-tight text-white">
                  {customer.name}
                </h1>
              </div>

              <div className="text-xs text-slate-300 flex flex-wrap items-center gap-2 pt-0.5">
                <span>{customer.contactPerson || "Commercial Account"}</span>
                <span>•</span>
                <span>
                  {customer.addressLine1}, {customer.city}, {customer.province} {customer.postalCode}
                </span>
                <span>•</span>
                <span>Terms: {customer.paymentTerms || "Net 30"}</span>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 shrink-0">
              <Link
                href={`/projects/new?customerId=${customer.id}`}
                className="inline-flex items-center gap-1.5 rounded-xs bg-[#186ade] hover:bg-[#1458b8] text-white font-semibold text-xs px-3.5 py-2 transition shadow-2xs"
              >
                <Plus className="w-3.5 h-3.5 stroke-[2.5]" />
                New Project for {customer.name}
              </Link>
            </div>
          </div>

          {/* Centered Folder Tabs */}
          <div className="flex items-end justify-center gap-1.5 overflow-x-auto">
            {TABS.map((t) => {
              const active = activeTab === t.key;
              return (
                <Link
                  key={t.key}
                  href={`/customers/${customer.id}?tab=${t.key}`}
                  className={`px-6 py-2.5 text-xs font-bold tracking-wider uppercase rounded-t-xs transition whitespace-nowrap ${
                    active
                      ? "bg-white text-slate-800 border-t-2 border-[#186ade]"
                      : "bg-[#22303f] hover:bg-[#34495e] text-slate-300 hover:text-white"
                  }`}
                >
                  {t.label}
                </Link>
              );
            })}
          </div>
        </div>
      </div>

      {/* Full-Bleed White Account Summary Strip */}
      <div className="bg-white border-b border-slate-200 px-6 py-3 shrink-0 shadow-2xs">
        <div className="max-w-7xl mx-auto grid grid-cols-2 sm:grid-cols-5 divide-y sm:divide-y-0 sm:divide-x divide-slate-200 text-xs">
          <div className="py-1.5 sm:py-0 sm:pr-4">
            <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
              Outstanding Balance
            </div>
            <div
              className={`text-sm font-bold tabular-nums mt-0.5 ${
                outstandingBalanceCents > 0 ? "text-rose-600" : "text-emerald-700"
              }`}
            >
              {formatCAD(outstandingBalanceCents)}
            </div>
          </div>

          <div className="py-1.5 sm:py-0 sm:px-4">
            <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
              Lifetime Revenue
            </div>
            <div className="text-sm font-bold text-slate-800 tabular-nums mt-0.5">
              {formatCAD(lifetimeSpendCents)}
            </div>
          </div>

          <div className="py-1.5 sm:py-0 sm:px-4">
            <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
              Job History &amp; Quotes
            </div>
            <div className="text-xs font-semibold text-slate-700 tabular-nums mt-0.5">
              {historicalSageInvoices.length} Past Jobs • {activeJobs.length} Active • {openQuotes.length} Quotes
            </div>
          </div>

          <div className="py-1.5 sm:py-0 sm:px-4">
            <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
              Payment Terms
            </div>
            <div className="text-xs font-semibold text-slate-700 mt-0.5">
              {customer.paymentTerms || "Net 30"}
            </div>
          </div>

          <div className="py-1.5 sm:py-0 sm:pl-4">
            <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
              Tax Jurisdiction
            </div>
            <div className="text-xs font-semibold text-slate-700 mt-0.5">
              {customer.province} ({customer.taxExempt ? "Tax Exempt" : "Standard HST"})
            </div>
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="p-6 max-w-7xl w-full mx-auto space-y-5">
        {/* 3 Rectangular Account Info Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="rounded-xs bg-white border border-slate-200 p-4 shadow-2xs space-y-2 text-xs">
            <div className="font-bold uppercase tracking-wider text-slate-500 text-[11px] border-b border-slate-100 pb-2 flex items-center gap-1.5">
              <User className="w-3.5 h-3.5 text-slate-400" /> Primary Contact
            </div>
            <div className="font-semibold text-slate-800 text-sm">
              {customer.contactPerson || customer.name}
            </div>
            {customer.email && (
              <a
                href={`mailto:${customer.email}`}
                className="flex items-center gap-1.5 text-[#186ade] hover:underline"
              >
                <Mail className="w-3.5 h-3.5 text-slate-400" /> {customer.email}
              </a>
            )}
            {customer.phone && (
              <a
                href={`tel:${customer.phone}`}
                className="flex items-center gap-1.5 text-slate-700 hover:underline tabular-nums"
              >
                <Phone className="w-3.5 h-3.5 text-slate-400" /> {customer.phone}
              </a>
            )}
          </div>

          <div className="rounded-xs bg-white border border-slate-200 p-4 shadow-2xs space-y-2 text-xs">
            <div className="font-bold uppercase tracking-wider text-slate-500 text-[11px] border-b border-slate-100 pb-2 flex items-center gap-1.5">
              <Building2 className="w-3.5 h-3.5 text-slate-400" /> Billing Address
            </div>
            <div className="font-semibold text-slate-800">{customer.name}</div>
            <div className="text-slate-600">{customer.addressLine1}</div>
            <div className="text-slate-600">
              {customer.city}, {customer.province} {customer.postalCode}
            </div>
          </div>

          <div className="rounded-xs bg-white border border-slate-200 p-4 shadow-2xs space-y-2 text-xs">
            <div className="font-bold uppercase tracking-wider text-slate-500 text-[11px] border-b border-slate-100 pb-2 flex items-center gap-1.5">
              <MapPin className="w-3.5 h-3.5 text-slate-400" /> Installation &amp; Access Notes
            </div>
            {customer.siteNotes ? (
              <p className="text-slate-700 leading-relaxed">{customer.siteNotes}</p>
            ) : (
              <p className="text-slate-400">No special site access notes recorded.</p>
            )}
          </div>
        </div>

        {/* Tab 1: Projects & Quotes */}
        {activeTab === "projects" && (
          <div className="space-y-5">
            {/* Active Jobs Table */}
            <div className="rounded-xs bg-white border border-slate-200 shadow-2xs overflow-hidden">
              <div className="bg-[#f8fafc] border-b border-slate-200 px-4 py-3 flex items-center justify-between">
                <h2 className="text-xs font-bold uppercase tracking-wider text-slate-700">
                  Active Signed Jobs ({activeJobs.length})
                </h2>
              </div>

              {activeJobs.length === 0 ? (
                <div className="p-6 text-center text-xs text-slate-500">
                  No active jobs currently in progress for {customer.name}.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="border-b border-slate-200 text-[11px] font-semibold text-slate-500">
                        <th className="py-2.5 px-4 border-r border-slate-200">Project &amp; Job #</th>
                        <th className="py-2.5 px-4 border-r border-slate-200">Site Location</th>
                        <th className="py-2.5 px-4 border-r border-slate-200">Stage</th>
                        <th className="py-2.5 px-4 border-r border-slate-200">Install Date</th>
                        <th className="py-2.5 px-4 border-r border-slate-200 text-right">Total</th>
                        <th className="py-2.5 px-4 text-right">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                      {activeJobs.map((p) => {
                        const pk = PIPELINE.find((x) => x.key === pipelineOf(p.status))!;
                        return (
                          <tr key={p.id} className="hover:bg-blue-50/30 transition">
                            <td className="py-3 px-4 border-r border-slate-200">
                              <div className="flex items-center gap-2">
                                <Tag
                                  className="w-3.5 h-3.5 shrink-0 fill-current"
                                  style={{ color: pk.tagColor }}
                                />
                                <Link
                                  href={`/projects/${p.id}`}
                                  className="font-semibold text-slate-800 hover:text-[#186ade] hover:underline"
                                >
                                  {p.title}{" "}
                                  <span className="text-slate-400 font-normal tabular-nums">
                                    ({projectRef(p)})
                                  </span>
                                </Link>
                              </div>
                            </td>
                            <td className="py-3 px-4 border-r border-slate-200 text-slate-600">
                              {p.siteAddress || customer.addressLine1}
                            </td>
                            <td className="py-3 px-4 border-r border-slate-200">
                              <span className="text-[11px] font-semibold px-2 py-0.5 rounded-xs bg-emerald-50 text-emerald-800 border border-emerald-200">
                                {STAGE_LABEL[p.status] ?? pk.label}
                              </span>
                            </td>
                            <td className="py-3 px-4 border-r border-slate-200 tabular-nums text-slate-700">
                              {p.scheduledDate || "Unscheduled"}
                            </td>
                            <td className="py-3 px-4 border-r border-slate-200 text-right tabular-nums font-bold text-slate-900">
                              {formatCAD(p.totalCents)}
                            </td>
                            <td className="py-3 px-4 text-right">
                              <Link
                                href={`/projects/${p.id}`}
                                className="rounded-xs border border-slate-300 bg-white hover:bg-slate-50 px-2.5 py-1 text-[11px] font-semibold text-slate-700"
                              >
                                View Job →
                              </Link>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Open Quotes Table */}
            <div className="rounded-xs bg-white border border-slate-200 shadow-2xs overflow-hidden">
              <div className="bg-[#f8fafc] border-b border-slate-200 px-4 py-3">
                <h2 className="text-xs font-bold uppercase tracking-wider text-slate-700">
                  Open Quotes &amp; Proposals ({openQuotes.length})
                </h2>
              </div>

              {openQuotes.length === 0 ? (
                <div className="p-6 text-center text-xs text-slate-500">
                  No open proposals pending decision for {customer.name}.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="border-b border-slate-200 text-[11px] font-semibold text-slate-500">
                        <th className="py-2.5 px-4 border-r border-slate-200">Quote &amp; Title</th>
                        <th className="py-2.5 px-4 border-r border-slate-200">Status</th>
                        <th className="py-2.5 px-4 border-r border-slate-200">Valid Until</th>
                        <th className="py-2.5 px-4 border-r border-slate-200 text-right">Quote Total</th>
                        <th className="py-2.5 px-4 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                      {openQuotes.map((q) => {
                        const pk = PIPELINE.find((x) => x.key === pipelineOf(q.status))!;
                        return (
                          <tr key={q.id} className="hover:bg-blue-50/30 transition">
                            <td className="py-3 px-4 border-r border-slate-200">
                              <div className="flex items-center gap-2">
                                <Tag
                                  className="w-3.5 h-3.5 shrink-0 fill-current"
                                  style={{ color: pk.tagColor }}
                                />
                                <Link
                                  href={`/projects/${q.id}`}
                                  className="font-semibold text-slate-800 hover:text-[#186ade] hover:underline"
                                >
                                  {q.title}{" "}
                                  <span className="text-slate-400 font-normal tabular-nums">
                                    ({q.quoteNumber})
                                  </span>
                                </Link>
                              </div>
                            </td>
                            <td className="py-3 px-4 border-r border-slate-200">
                              <span
                                className="text-[11px] font-semibold px-2 py-0.5 rounded-xs"
                                style={{ backgroundColor: pk.chevronBg, color: pk.chevronText }}
                              >
                                {pk.label}
                              </span>
                            </td>
                            <td className="py-3 px-4 border-r border-slate-200 tabular-nums text-slate-600">
                              {q.validUntil || "—"}
                            </td>
                            <td className="py-3 px-4 border-r border-slate-200 text-right tabular-nums font-bold text-slate-900">
                              {formatCAD(q.totalCents)}
                            </td>
                            <td className="py-3 px-4 text-right whitespace-nowrap">
                              <div className="inline-flex items-center gap-1.5">
                                <a
                                  href={`/q/${q.publicToken}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="rounded-xs border border-slate-300 bg-white hover:bg-slate-50 px-2.5 py-1 text-[11px] font-semibold text-slate-700 inline-flex items-center gap-1"
                                >
                                  <ExternalLink className="w-3 h-3 text-[#186ade]" />
                                  Portal
                                </a>
                                <Link
                                  href={`/projects/${q.id}`}
                                  className="rounded-xs bg-[#186ade] hover:bg-[#1458b8] text-white px-2.5 py-1 text-[11px] font-semibold"
                                >
                                  Open
                                </Link>
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

            {/* Historical Sage Jobs & Invoices for this Customer */}
            <CustomerHistoricalJobsSection
              customerId={customer.id}
              customerName={customer.name}
              invoices={historicalSageInvoices}
            />
          </div>
        )}

        {/* Tab 2: Invoices & Payments */}
        {activeTab === "invoices" && (
          <div className="space-y-5">
            <div className="rounded-xs bg-white border border-slate-200 shadow-2xs overflow-hidden">
              <div className="bg-[#f8fafc] border-b border-slate-200 px-4 py-3">
                <h2 className="text-xs font-bold uppercase tracking-wider text-slate-700">
                  Invoices Ledger ({customerInvoices.length})
                </h2>
              </div>

              {customerInvoices.length === 0 ? (
                <div className="p-6 text-center text-xs text-slate-500">
                  No invoices issued to {customer.name} yet.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="border-b border-slate-200 text-[11px] font-semibold text-slate-500">
                        <th className="py-2.5 px-4 border-r border-slate-200">Invoice #</th>
                        <th className="py-2.5 px-4 border-r border-slate-200">Issue Date</th>
                        <th className="py-2.5 px-4 border-r border-slate-200">Due Date</th>
                        <th className="py-2.5 px-4 border-r border-slate-200">Status</th>
                        <th className="py-2.5 px-4 border-r border-slate-200 text-right">Amount</th>
                        <th className="py-2.5 px-4 text-right">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                      {customerInvoices.map((inv) => (
                        <tr key={inv.id} className="hover:bg-blue-50/30">
                          <td className="py-3 px-4 border-r border-slate-200 tabular-nums font-bold text-slate-900">
                            #{inv.invoiceNumber}
                          </td>
                          <td className="py-3 px-4 border-r border-slate-200 tabular-nums text-slate-600">
                            {inv.issueDate ?? "Draft"}
                          </td>
                          <td className="py-3 px-4 border-r border-slate-200 tabular-nums text-slate-600">
                            {inv.dueDate ?? "—"}
                          </td>
                          <td className="py-3 px-4 border-r border-slate-200">
                            <span
                              className={`inline-flex text-[11px] font-bold uppercase px-2 py-0.5 rounded-xs border ${
                                inv.status === "issued"
                                  ? "bg-blue-50 text-[#186ade] border-blue-200"
                                  : inv.status === "draft"
                                    ? "bg-slate-100 text-slate-700 border-slate-200"
                                    : "bg-rose-50 text-rose-700 border-rose-200"
                              }`}
                            >
                              {inv.status}
                            </span>
                          </td>
                          <td className="py-3 px-4 border-r border-slate-200 tabular-nums font-bold text-slate-900 text-right">
                            {formatCAD(inv.totalCents)}
                          </td>
                          <td className="py-3 px-4 text-right">
                            {inv.projectId && (
                              <Link
                                href={`/projects/${inv.projectId}?tab=billing`}
                                className="text-xs font-semibold text-[#186ade] hover:underline"
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
            <div className="rounded-xs bg-white border border-slate-200 shadow-2xs overflow-hidden">
              <div className="bg-[#f8fafc] border-b border-slate-200 px-4 py-3">
                <h2 className="text-xs font-bold uppercase tracking-wider text-slate-700">
                  Payment History ({customerPayments.length})
                </h2>
              </div>

              {customerPayments.length === 0 ? (
                <div className="p-6 text-center text-xs text-slate-500">
                  No payments recorded for this account.
                </div>
              ) : (
                <div className="divide-y divide-slate-200">
                  {customerPayments.map((p) => (
                    <div
                      key={p.id}
                      className="p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
                    >
                      <div>
                        <div className="font-semibold text-slate-900 tabular-nums">
                          {formatCAD(p.amountCents)} received via {p.method.toUpperCase()}
                        </div>
                        <div className="text-slate-500 mt-0.5 tabular-nums">
                          Received on {p.receivedOn} • {p.reference || "No reference"}
                        </div>
                      </div>
                      <span className="inline-flex items-center gap-1 font-semibold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-xs border border-emerald-200 whitespace-nowrap">
                        <CheckCircle2 className="w-3.5 h-3.5" /> Paid &amp; Logged
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Historical Sage Invoices for this Customer */}
            <CustomerHistoricalJobsSection
              customerId={customer.id}
              customerName={customer.name}
              invoices={historicalSageInvoices}
            />
          </div>
        )}

        {/* Tab 3: Active Rentals & Fleet */}
        {activeTab === "equipment" && (
          <div className="rounded-xs bg-white border border-slate-200 shadow-2xs overflow-hidden">
            <div className="bg-[#f8fafc] border-b border-slate-200 px-4 py-3">
              <h2 className="text-xs font-bold uppercase tracking-wider text-slate-700">
                Deployed Fleet Units ({customerRentals.length})
              </h2>
            </div>

            {customerRentals.length === 0 ? (
              <div className="p-6 text-center text-xs text-slate-500">
                No equipment currently deployed with {customer.name}.
              </div>
            ) : (
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-200 text-[11px] font-semibold text-slate-500">
                    <th className="py-2.5 px-4 border-r border-slate-200">Unit Code &amp; Name</th>
                    <th className="py-2.5 px-4 border-r border-slate-200">Deployed Location</th>
                    <th className="py-2.5 px-4 border-r border-slate-200">Lease Period</th>
                    <th className="py-2.5 px-4 border-r border-slate-200">Status</th>
                    <th className="py-2.5 px-4 text-right">Monthly Rate</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {customerRentals.map(({ rental, unit }) => (
                    <tr key={rental.id} className="hover:bg-blue-50/30">
                      <td className="py-3 px-4 border-r border-slate-200 font-semibold text-slate-800">
                        <span className="tabular-nums font-bold text-[#186ade] mr-1.5">
                          {unit.code}
                        </span>
                        {unit.name}
                      </td>
                      <td className="py-3 px-4 border-r border-slate-200 text-slate-600">
                        {rental.locationAddress}
                      </td>
                      <td className="py-3 px-4 border-r border-slate-200 tabular-nums text-slate-600">
                        {rental.startDate} → {rental.endDate || "Ongoing Monthly"}
                      </td>
                      <td className="py-3 px-4 border-r border-slate-200">
                        <span className="text-[11px] font-semibold px-2 py-0.5 rounded-xs bg-emerald-50 text-emerald-700 border border-emerald-200">
                          {rental.status}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right tabular-nums font-bold text-slate-900">
                        {formatCAD(rental.monthlyRateCents)}/mo
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
