import Link from "next/link";
import { notFound } from "next/navigation";
import { and, asc, desc, eq } from "drizzle-orm";
import {
  ArrowLeft,
  Building2,
  CheckCircle2,
  ExternalLink,
  EyeOff,
  FolderOpen,
  Mail,
  MapPin,
  Phone,
  Tag,
  User,
} from "lucide-react";
import { getDb } from "@/db";
import {
  activityLog,
  customers,
  jobAssignments,
  jobFiles,
  invoices,
  jobItems,
  payments,
  projects,
  users,
} from "@/db/schema";
import { formatCAD } from "@/lib/money";
import {
  PIPELINE,
  STAGE_LABEL,
  isSigned,
  isUnsignedQuote,
  pipelineOf,
  projectRef,
} from "@/lib/project-status";
import { JobDetailClientControls } from "@/components/JobDetailClientControls";
import { ProjectQuoteActions } from "@/components/ProjectQuoteActions";

export const dynamic = "force-dynamic";

const TABS = [
  { key: "contract", label: "CONTRACT" },
  { key: "billing", label: "BILLING" },
  { key: "fulfillment", label: "FULFILLMENT" },
  { key: "log", label: "LOGS" },
] as const;

export default async function ProjectDetailPage(props: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const { id } = await props.params;
  const { tab: tabParam } = await props.searchParams;
  const projectId = Number(id);
  if (!projectId) notFound();
  const tab = TABS.find((t) => t.key === tabParam)?.key ?? "contract";

  const db = await getDb();
  const [row] = await db
    .select({ project: projects, customer: customers })
    .from(projects)
    .innerJoin(customers, eq(projects.customerId, customers.id))
    .where(eq(projects.id, projectId))
    .limit(1);
  if (!row) notFound();
  const { project, customer } = row;

  const items = await db
    .select()
    .from(jobItems)
    .where(eq(jobItems.jobId, project.id))
    .orderBy(asc(jobItems.sortOrder));
  const files = await db
    .select()
    .from(jobFiles)
    .where(eq(jobFiles.jobId, project.id))
    .orderBy(desc(jobFiles.createdAt));
  const assignments = await db
    .select()
    .from(jobAssignments)
    .where(eq(jobAssignments.jobId, project.id));
  const allInstallers = await db.select().from(users).where(eq(users.role, "installer"));
  const logs = await db
    .select()
    .from(activityLog)
    .where(and(eq(activityLog.entityType, "project"), eq(activityLog.entityId, String(project.id))))
    .orderBy(desc(activityLog.createdAt));

  const invoice = project.invoiceId
    ? ((await db.select().from(invoices).where(eq(invoices.id, project.invoiceId)).limit(1))[0] ?? null)
    : null;
  const invoicePayments = invoice
    ? await db.select().from(payments).where(eq(payments.invoiceId, invoice.id)).orderBy(desc(payments.receivedOn))
    : [];
  const paidCents = invoicePayments.reduce((a, pay) => a + pay.amountCents, 0);
  const balanceCents = invoice && invoice.status !== "void" ? invoice.totalCents - paidCents : 0;

  const signed = isSigned(project.status);
  const unsigned = isUnsignedQuote(project.status);
  const pk = PIPELINE.find((p) => p.key === pipelineOf(project.status))!;
  const mapsQuery = encodeURIComponent(
    project.siteAddress || `${customer.addressLine1}, ${customer.city}, ${customer.province}`
  );

  // Group line items (items without a group go in a default group)
  const groups = new Map<string, typeof items>();
  for (const it of items) {
    const g = it.groupName || "Signage, Production & Installation";
    groups.set(g, [...(groups.get(g) ?? []), it]);
  }

  return (
    <div className="flex-1 flex flex-col min-h-0">
      {/* Goodshuffle Pro Full-Bleed Slate-Blue Project Header with Centered Folder Tabs */}
      <div className="bg-[#2b3c4e] text-white px-6 pt-5 pb-0 shrink-0 print:bg-white print:text-slate-900 print:border-b print:border-slate-300">
        <div className="max-w-7xl mx-auto">
          <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4 pb-5">
            <div className="space-y-1.5 min-w-0">
              <div className="flex items-center gap-2 text-xs text-slate-300 mb-1">
                <Link
                  href="/projects"
                  className="inline-flex items-center gap-1 hover:text-white transition"
                >
                  <ArrowLeft className="w-3.5 h-3.5" /> Projects
                </Link>
                <span>/</span>
                <span className="tabular-nums">{projectRef(project)}</span>
                {project.jobNumber && (
                  <>
                    <span>•</span>
                    <span className="text-slate-400 tabular-nums">Quote {project.quoteNumber}</span>
                  </>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-2.5">
                <Tag
                  className="w-5 h-5 shrink-0 fill-current"
                  style={{ color: pk.tagColor }}
                />
                <h1 className="text-xl sm:text-2xl font-normal tracking-tight text-white">
                  {project.title}{" "}
                  <span className="text-slate-300 font-light tabular-nums">
                    ({projectRef(project)})
                  </span>
                </h1>
                {project.priority === "rush" && (
                  <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-xs bg-rose-600 text-white">
                    Rush
                  </span>
                )}
              </div>

              <div className="text-xs text-slate-300 flex flex-wrap items-center gap-2 pt-0.5">
                <span className="font-semibold text-white">
                  {STAGE_LABEL[project.status] ?? pk.label}
                </span>
                <span>•</span>
                <Link href={`/customers/${customer.id}`} className="hover:underline text-slate-200">
                  {customer.name}
                </Link>
                <span>•</span>
                <span>{project.siteAddress || customer.addressLine1 || "Halifax, NS"}</span>
                {project.poReference && (
                  <>
                    <span>•</span>
                    <span>PO: {project.poReference}</span>
                  </>
                )}
              </div>
            </div>

            {/* Right Toolbar */}
            <div className="flex flex-wrap items-center gap-2 shrink-0 print:hidden">
              {project.driveFolderUrl && (
                <span className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-200 bg-[#22303f] border border-white/10 px-3 py-1.5 rounded-xs">
                  <FolderOpen className="w-3.5 h-3.5 text-amber-400" />
                  Drive: Invoice #{project.jobNumber}
                </span>
              )}
              <Link
                href={`/q/${project.publicToken}`}
                target="_blank"
                className="inline-flex items-center gap-1.5 text-xs font-semibold bg-[#186ade] hover:bg-[#1458b8] text-white px-3.5 py-1.5 rounded-xs transition shadow-2xs"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                Client Proposal Portal
              </Link>
            </div>
          </div>

          {/* Centered Goodshuffle Folder Tabs */}
          <div className="flex items-end justify-center gap-1.5 overflow-x-auto print:hidden">
            {TABS.map((t) => {
              const active = tab === t.key;
              return (
                <Link
                  key={t.key}
                  href={`/projects/${project.id}?tab=${t.key}`}
                  className={`px-6 py-2.5 text-xs font-bold tracking-wider uppercase rounded-t-xs transition whitespace-nowrap ${
                    active
                      ? "bg-white text-slate-800 border-t-2 border-[#186ade]"
                      : "bg-[#22303f] hover:bg-[#34495e] text-slate-300 hover:text-white"
                  }`}
                >
                  {t.label}
                  {t.key === "fulfillment" && files.length > 0 && (
                    <span className="ml-1.5 text-[10px] bg-slate-200 text-slate-700 rounded-xs px-1.5 py-0.2 tabular-nums">
                      {files.length}
                    </span>
                  )}
                </Link>
              );
            })}
          </div>
        </div>
      </div>

      {/* Full-Bleed White KPI Summary Strip directly below folder tabs */}
      <div className="bg-white border-b border-slate-200 px-6 py-3 shrink-0 shadow-2xs">
        <div className="max-w-7xl mx-auto grid grid-cols-2 sm:grid-cols-5 divide-y sm:divide-y-0 sm:divide-x divide-slate-200 text-xs">
          <div className="py-1.5 sm:py-0 sm:pr-4 flex items-center gap-2">
            <span
              className="inline-flex items-center gap-1.5 font-bold px-2.5 py-1 rounded-xs text-xs"
              style={{ backgroundColor: pk.chevronBg, color: pk.chevronText }}
            >
              {pk.label}
            </span>
            {signed && (
              <span className="text-slate-600 font-medium truncate">
                {STAGE_LABEL[project.status]}
              </span>
            )}
          </div>

          <div className="py-1.5 sm:py-0 sm:px-4">
            <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
              Contract Total
            </div>
            <div className="text-sm font-bold text-slate-800 tabular-nums mt-0.5">
              {formatCAD(project.totalCents)}{" "}
              <span className="text-[11px] font-normal text-slate-500">
                ({project.taxLabel})
              </span>
            </div>
          </div>

          <div className="py-1.5 sm:py-0 sm:px-4">
            <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
              {signed ? "Scheduled Install" : "Quote Expiration"}
            </div>
            <div className="text-xs font-semibold text-slate-700 tabular-nums mt-0.5">
              {signed
                ? project.scheduledDate || "Not scheduled"
                : project.validUntil || "30 days"}
            </div>
          </div>

          <div className="py-1.5 sm:py-0 sm:px-4">
            <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
              Last Signed
            </div>
            <div className="text-xs font-semibold text-slate-700 mt-0.5 truncate">
              {project.approvedAt
                ? `${new Date(project.approvedAt).toLocaleDateString("en-CA")} (${project.approvedByName})`
                : "Unsigned"}
            </div>
          </div>

          <div className="py-1.5 sm:py-0 sm:pl-4">
            <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
              Billing Status
            </div>
            <div className="text-xs font-semibold mt-0.5 truncate">
              {project.invoiceSentAt ? (
                <span className="text-emerald-700 inline-flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  Invoiced ({new Date(project.invoiceSentAt).toLocaleDateString("en-CA")})
                </span>
              ) : signed ? (
                <span className="text-amber-700">Invoice #{project.jobNumber} (Draft)</span>
              ) : project.sentAt ? (
                <span className="text-slate-700">
                  Sent {new Date(project.sentAt).toLocaleDateString("en-CA")}
                </span>
              ) : (
                <span className="text-slate-400">Not sent yet</span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Main Content Workspace */}
      <div className="p-6 max-w-7xl w-full mx-auto space-y-5">
        {project.status === "action_needed" && project.declineReason && (
          <div className="rounded-xs bg-rose-50 border border-rose-300 p-4 text-xs text-rose-900">
            <strong>Client Revision Request:</strong> {project.declineReason}
          </div>
        )}

        {/* Interactive Workflow Controls */}
        {unsigned && (
          <ProjectQuoteActions
            projectId={project.id}
            publicToken={project.publicToken}
            status={project.status}
            sentAt={project.sentAt?.toISOString() ?? null}
            customerContact={customer.contactPerson || customer.name}
            customerEmail={customer.email || ""}
            quoteNumber={project.quoteNumber}
            title={project.title}
          />
        )}
        {signed && (
          <JobDetailClientControls
            job={{
              id: project.id,
              jobNumber: project.jobNumber,
              status: project.status,
              scheduledDate: project.scheduledDate || "",
              paymentStatus: project.paymentStatus,
              invoiceId: project.invoiceId,
              invoiceStatus: invoice?.status ?? null,
              totalFormatted: formatCAD(project.totalCents),
              balanceCents,
              balanceFormatted: formatCAD(balanceCents),
              invoiceSentAt: project.invoiceSentAt?.toISOString() ?? null,
              invoiceSentToEmail: project.invoiceSentToEmail,
            }}
            customerEmail={customer.email || ""}
            installers={allInstallers.map((u) => ({
              id: u.id,
              name: u.name,
              assigned: assignments.some((a) => a.userId === u.id),
            }))}
          />
        )}

        {/* TAB 1: CONTRACT (Goodshuffle 3-column metadata + Line Item Groups) */}
        {tab === "contract" && (
          <div className="space-y-5">
            {/* 3 Rectangular Metadata Cards: Sales Office, Client Contact, Venue / Site */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* Card 1: Sales Office */}
              <div className="rounded-xs bg-white border border-slate-200 p-4 shadow-2xs space-y-2 text-xs">
                <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                  <span className="font-bold uppercase tracking-wider text-slate-500 text-[11px] flex items-center gap-1.5">
                    <Building2 className="w-3.5 h-3.5 text-slate-400" /> Sales Office
                  </span>
                  <span className="text-[11px] text-slate-400">Halifax HQ</span>
                </div>
                <div className="font-semibold text-slate-800">Giant Promotions Limited</div>
                <div className="text-slate-600">3797 Mackintosh Street, Halifax, NS B3K 5A7</div>
                <div className="pt-1 flex items-center gap-2 text-slate-600">
                  <span className="w-5 h-5 rounded-full bg-[#186ade] text-white font-bold text-[10px] flex items-center justify-center">
                    AJ
                  </span>
                  <span>Sales Lead: Wajdi (AJ) Masad</span>
                </div>
              </div>

              {/* Card 2: Client Contact */}
              <div className="rounded-xs bg-white border border-slate-200 p-4 shadow-2xs space-y-2 text-xs">
                <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                  <span className="font-bold uppercase tracking-wider text-slate-500 text-[11px] flex items-center gap-1.5">
                    <User className="w-3.5 h-3.5 text-slate-400" /> Client Contact
                  </span>
                  <Link
                    href={`/customers/${customer.id}`}
                    className="text-[11px] font-semibold text-[#186ade] hover:underline"
                  >
                    View Account →
                  </Link>
                </div>
                <div className="font-semibold text-slate-800 text-sm">{customer.name}</div>
                {customer.contactPerson && !customer.contactPerson.includes("@") && (
                  <div className="text-slate-600">Attn: {customer.contactPerson}</div>
                )}
                <div className="space-y-1 pt-0.5">
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
              </div>

              {/* Card 3: Installation Venue / Site */}
              <div className="rounded-xs bg-white border border-slate-200 p-4 shadow-2xs space-y-2 text-xs">
                <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                  <span className="font-bold uppercase tracking-wider text-slate-500 text-[11px] flex items-center gap-1.5">
                    <MapPin className="w-3.5 h-3.5 text-slate-400" /> Installation Site
                  </span>
                  <a
                    href={`https://www.google.com/maps/search/?api=1&query=${mapsQuery}`}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#186ade] hover:underline"
                  >
                    Google Maps <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
                <div className="font-semibold text-slate-800">
                  {project.siteAddress || customer.addressLine1}
                </div>
                <div className="text-slate-600">
                  Province Tax Jurisdiction: <strong>{project.siteProvince}</strong> ({project.taxLabel})
                </div>
                {customer.siteNotes && (
                  <div className="rounded-xs bg-amber-50 border border-amber-200 px-2.5 py-1.5 text-amber-950 text-[11px]">
                    <strong>Access Note:</strong> {customer.siteNotes}
                  </div>
                )}
              </div>
            </div>

            {/* Grouped Line Items Table (Goodshuffle Pro Contract Style) */}
            <div className="space-y-4">
              {[...groups.entries()].map(([groupName, groupItems]) => {
                const groupNet = groupItems.reduce((a, i) => a + i.netCents, 0);
                return (
                  <div
                    key={groupName}
                    className="rounded-xs bg-white border border-slate-200 shadow-2xs overflow-hidden"
                  >
                    <div className="bg-[#f8fafc] border-b border-slate-200 px-4 py-2.5 flex items-center justify-between">
                      <span className="text-xs font-bold uppercase tracking-wider text-slate-700">
                        {groupName}
                      </span>
                      <span className="text-xs font-bold text-slate-800 tabular-nums">
                        Group Subtotal: {formatCAD(groupNet)}
                      </span>
                    </div>

                    <div className="overflow-x-auto">
                      <table className="w-full text-left border-collapse text-xs">
                        <thead>
                          <tr className="border-b border-slate-200 text-[11px] font-semibold text-slate-500 bg-white">
                            <th className="py-2.5 px-4 border-r border-slate-200">Item &amp; Description</th>
                            <th className="py-2.5 px-4 border-r border-slate-200">Schedule / Attributes</th>
                            <th className="py-2.5 px-4 border-r border-slate-200 text-right w-20">Qty</th>
                            <th className="py-2.5 px-4 border-r border-slate-200 text-right w-28">Unit Price</th>
                            <th className="py-2.5 px-4 text-right w-28">Total</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-200">
                          {groupItems.map((item) => (
                            <tr
                              key={item.id}
                              className={item.hiddenFromCustomer ? "bg-slate-50/70" : "hover:bg-slate-50/50"}
                            >
                              <td className="py-3 px-4 border-r border-slate-200">
                                <div className="font-semibold text-slate-800 flex flex-wrap items-center gap-2">
                                  {item.description}
                                  {item.hiddenFromCustomer && (
                                    <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase px-1.5 py-0.5 rounded-xs bg-slate-200 text-slate-700">
                                      <EyeOff className="w-3 h-3" /> Internal Only
                                    </span>
                                  )}
                                  {item.equipmentId && (
                                    <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase px-1.5 py-0.5 rounded-xs bg-blue-50 text-[#186ade] border border-blue-200">
                                      Fleet Unit
                                    </span>
                                  )}
                                </div>
                              </td>
                              <td className="py-3 px-4 border-r border-slate-200 text-slate-500 tabular-nums">
                                {item.rentalStartDate
                                  ? `${item.rentalStartDate} → ${item.rentalEndDate || "Ongoing Monthly"}`
                                  : project.scheduledDate
                                    ? `Install: ${project.scheduledDate}`
                                    : "Standard Production"}
                              </td>
                              <td className="py-3 px-4 border-r border-slate-200 text-right tabular-nums text-slate-700">
                                {item.quantity}
                              </td>
                              <td className="py-3 px-4 border-r border-slate-200 text-right tabular-nums text-slate-700">
                                {formatCAD(item.unitPriceCents)}
                              </td>
                              <td className="py-3 px-4 text-right tabular-nums font-bold text-slate-900">
                                {formatCAD(item.netCents)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Bottom Contract Notes + Totals Summary */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
              <div className="lg:col-span-7 rounded-xs bg-white border border-slate-200 p-4 shadow-2xs space-y-3 text-xs text-slate-700">
                <div>
                  <div className="font-bold uppercase tracking-wider text-slate-500 text-[11px] mb-1">
                    Project Scope &amp; Notes
                  </div>
                  <p className="text-slate-700 leading-relaxed">
                    {project.description || "Standard commercial fabrication and site installation."}
                  </p>
                </div>
                {project.customerTerms && (
                  <div className="pt-2 border-t border-slate-100">
                    <div className="font-bold uppercase tracking-wider text-slate-500 text-[11px] mb-1">
                      Contract Terms
                    </div>
                    <p className="text-slate-600">{project.customerTerms}</p>
                  </div>
                )}
              </div>

              <div className="lg:col-span-5 rounded-xs bg-white border border-slate-200 p-4 shadow-2xs space-y-2 text-xs">
                <div className="font-bold uppercase tracking-wider text-slate-500 text-[11px] border-b border-slate-100 pb-2">
                  Contract Financial Summary
                </div>
                <div className="flex justify-between py-1 text-slate-600">
                  <span>Subtotal</span>
                  <span className="font-semibold text-slate-800 tabular-nums">
                    {formatCAD(project.subtotalCents)}
                  </span>
                </div>
                <div className="flex justify-between py-1 text-slate-600">
                  <span>Tax ({project.taxLabel})</span>
                  <span className="font-semibold text-slate-800 tabular-nums">
                    {formatCAD(project.taxCents)}
                  </span>
                </div>
                <div className="flex justify-between py-2 border-t border-slate-200 text-sm font-bold text-slate-900">
                  <span>Contract Total</span>
                  <span className="tabular-nums">{formatCAD(project.totalCents)}</span>
                </div>
                {signed && (
                  <>
                    <div className="flex justify-between py-1 text-slate-600">
                      <span>Payments Received</span>
                      <span className="font-semibold text-emerald-700 tabular-nums">
                        {formatCAD(paidCents)}
                      </span>
                    </div>
                    <div className="flex justify-between py-1.5 border-t border-slate-100 font-bold text-slate-900">
                      <span>Remaining Balance</span>
                      <span className="tabular-nums text-[#186ade]">
                        {formatCAD(balanceCents)}
                      </span>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: BILLING (Goodshuffle Side-by-Side Contract Summary + Billing Summary + Payments Table) */}
        {tab === "billing" && (
          <div className="space-y-5">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Left Card: Contract Summary */}
              <div className="rounded-xs bg-white border border-slate-200 p-5 shadow-2xs space-y-2.5 text-xs">
                <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500 border-b border-slate-100 pb-2">
                  Contract Summary
                </h2>
                <div className="flex justify-between py-1">
                  <span className="text-slate-600">Line Items Subtotal</span>
                  <strong className="tabular-nums text-slate-800">
                    {formatCAD(project.subtotalCents)}
                  </strong>
                </div>
                <div className="flex justify-between py-1">
                  <span className="text-slate-600">Tax ({project.taxLabel})</span>
                  <strong className="tabular-nums text-slate-800">
                    {formatCAD(project.taxCents)}
                  </strong>
                </div>
                <div className="flex justify-between py-2 border-t border-slate-200 text-sm font-bold text-slate-900">
                  <span>Contract Total</span>
                  <span className="tabular-nums">{formatCAD(project.totalCents)}</span>
                </div>
              </div>

              {/* Right Card: Billing Summary */}
              <div className="rounded-xs bg-white border border-slate-200 p-5 shadow-2xs space-y-2.5 text-xs">
                <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500 border-b border-slate-100 pb-2">
                  Billing &amp; Receivables Summary
                </h2>
                {!invoice ? (
                  <p className="text-slate-500 py-2">
                    No invoice generated yet. A sequential invoice number is reserved the moment the quote is signed.
                  </p>
                ) : (
                  <div className="space-y-2">
                    <div className="flex justify-between">
                      <span className="text-slate-600">Master Invoice #</span>
                      <strong className="tabular-nums text-slate-900">
                        #{invoice.invoiceNumber} ({invoice.status.toUpperCase()})
                      </strong>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-600">Invoice / Due Date</span>
                      <span className="tabular-nums text-slate-800">
                        {invoice.issueDate ?? "Draft"} → {invoice.dueDate ?? "On Issue"}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-600">Total Paid</span>
                      <strong className="tabular-nums text-emerald-700">
                        {formatCAD(paidCents)}
                      </strong>
                    </div>
                    <div className="flex justify-between pt-2 border-t border-slate-200 text-sm font-bold">
                      <span className="text-slate-900">Remaining Balance</span>
                      <span className="tabular-nums text-slate-900">
                        {formatCAD(balanceCents)}
                      </span>
                    </div>
                    <div className="text-[11px] text-slate-400 pt-1">
                      Accounting Batch:{" "}
                      {invoice.capturedBatchId
                        ? `Captured in Batch #${invoice.capturedBatchId}`
                        : "Pending next accountant capture"}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Payments Table */}
            <div className="rounded-xs bg-white border border-slate-200 shadow-2xs overflow-hidden">
              <div className="bg-[#f8fafc] border-b border-slate-200 px-4 py-3 flex items-center justify-between">
                <h2 className="text-xs font-bold uppercase tracking-wider text-slate-700">
                  Payments &amp; Transactions ({invoicePayments.length})
                </h2>
              </div>
              {invoicePayments.length === 0 ? (
                <div className="p-6 text-center text-xs text-slate-500">
                  No payments recorded against this project yet.
                </div>
              ) : (
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 text-[11px] font-semibold text-slate-500">
                      <th className="py-2.5 px-4 border-r border-slate-200">Date Received</th>
                      <th className="py-2.5 px-4 border-r border-slate-200">Method</th>
                      <th className="py-2.5 px-4 border-r border-slate-200">Reference</th>
                      <th className="py-2.5 px-4 border-r border-slate-200">Recorded By</th>
                      <th className="py-2.5 px-4 text-right">Amount</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {invoicePayments.map((pay) => (
                      <tr key={pay.id} className="hover:bg-slate-50">
                        <td className="py-3 px-4 border-r border-slate-200 tabular-nums font-medium">
                          {pay.receivedOn}
                        </td>
                        <td className="py-3 px-4 border-r border-slate-200 uppercase font-semibold text-slate-700">
                          {pay.method}
                        </td>
                        <td className="py-3 px-4 border-r border-slate-200 text-slate-600">
                          {pay.reference || "—"}
                        </td>
                        <td className="py-3 px-4 border-r border-slate-200 text-slate-600">
                          {pay.recordedByName}
                        </td>
                        <td className="py-3 px-4 text-right tabular-nums font-bold text-emerald-700">
                          {formatCAD(pay.amountCents)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        )}

        {/* TAB 3: FULFILLMENT */}
        {tab === "fulfillment" && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="rounded-xs bg-white border border-slate-200 shadow-2xs overflow-hidden">
              <div className="bg-[#f8fafc] border-b border-slate-200 px-4 py-3">
                <h2 className="text-xs font-bold uppercase tracking-wider text-slate-700">
                  Production &amp; Pull Sheet Items
                </h2>
              </div>
              <div className="divide-y divide-slate-200">
                {items.map((it) => (
                  <div key={it.id} className="p-3.5 text-xs flex justify-between gap-3">
                    <div>
                      <div className="font-semibold text-slate-800 flex flex-wrap items-center gap-1.5">
                        <span>{it.description}</span>
                        {it.hiddenFromCustomer && (
                          <span className="text-[10px] text-slate-400">(Internal)</span>
                        )}
                        {it.equipmentId && (
                          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-xs bg-blue-50 text-[#186ade] border border-blue-200">
                            FLEET UNIT
                          </span>
                        )}
                      </div>
                      {it.rentalStartDate && (
                        <div className="text-[11px] text-slate-500 tabular-nums mt-0.5">
                          Dispatch Window: {it.rentalStartDate} → {it.rentalEndDate || "Ongoing Monthly"}
                        </div>
                      )}
                    </div>
                    <strong className="whitespace-nowrap tabular-nums text-slate-800">
                      Qty {it.quantity}
                    </strong>
                  </div>
                ))}
              </div>
              {(project.installerNotes || customer.siteNotes) && (
                <div className="m-4 rounded-xs bg-amber-50 border border-amber-200 p-3 text-xs text-amber-950 space-y-1">
                  <div className="font-bold uppercase tracking-wider text-[10px] text-amber-800">
                    Installer &amp; Site Notes
                  </div>
                  {project.installerNotes && <div>{project.installerNotes}</div>}
                  {customer.siteNotes && <div>{customer.siteNotes}</div>}
                </div>
              )}
            </div>

            <div className="rounded-xs bg-white border border-slate-200 shadow-2xs overflow-hidden">
              <div className="bg-[#f8fafc] border-b border-slate-200 px-4 py-3">
                <h2 className="text-xs font-bold uppercase tracking-wider text-slate-700">
                  Proofs, Artwork &amp; Install Photos ({files.length})
                </h2>
              </div>
              <div className="p-4">
                {files.length === 0 ? (
                  <div className="rounded-xs border border-dashed border-slate-200 p-6 text-center text-xs text-slate-500">
                    No files uploaded yet. Attach artwork proofs or completion photos using the toolbar above.
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {files.map((f) => (
                      <div
                        key={f.id}
                        className="rounded-xs border border-slate-200 p-3 space-y-1 bg-[#f8fafc] text-xs"
                      >
                        <span className="font-bold uppercase px-1.5 py-0.5 rounded-xs bg-[#186ade] text-white text-[10px]">
                          {f.kind.replace("_", " ")}
                        </span>
                        <div className="font-semibold text-slate-800 truncate pt-1">
                          {f.originalName}
                        </div>
                        <div className="text-[11px] text-slate-400 tabular-nums">
                          {f.uploadedByName} • {new Date(f.createdAt).toLocaleString("en-CA")}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* TAB 4: LOGS */}
        {tab === "log" && (
          <div className="rounded-xs bg-white border border-slate-200 shadow-2xs overflow-hidden">
            <div className="bg-[#f8fafc] border-b border-slate-200 px-4 py-3">
              <h2 className="text-xs font-bold uppercase tracking-wider text-slate-700">
                Audit &amp; Activity Log
              </h2>
            </div>
            <div className="p-4">
              {logs.length === 0 ? (
                <p className="text-xs text-slate-500">Nothing recorded yet.</p>
              ) : (
                <div className="divide-y divide-slate-100">
                  {logs.map((l) => (
                    <div key={l.id} className="py-2.5 flex items-center justify-between gap-4 text-xs">
                      <div className="font-medium text-slate-800">{l.summary}</div>
                      <div className="text-[11px] text-slate-400 tabular-nums shrink-0">
                        {l.actorName} • {new Date(l.createdAt).toLocaleString("en-CA")}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
