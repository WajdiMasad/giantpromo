import Link from "next/link";
import { notFound } from "next/navigation";
import { and, asc, desc, eq } from "drizzle-orm";
import {
  ArrowLeft,
  CheckCircle2,
  ExternalLink,
  EyeOff,
  FolderOpen,
  MapPin,
  Phone,
  ShieldAlert,
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
  { key: "contract", label: "Contract" },
  { key: "billing", label: "Billing" },
  { key: "fulfillment", label: "Fulfillment" },
  { key: "log", label: "Log" },
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
    const g = it.groupName || "";
    groups.set(g, [...(groups.get(g) ?? []), it]);
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <Link
          href="/projects"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-600 hover:text-slate-900"
        >
          <ArrowLeft className="w-4 h-4" /> All projects
        </Link>
        {project.driveFolderUrl && (
          <span className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-600 bg-white border border-slate-200 px-3 py-1.5 rounded-xl">
            <FolderOpen className="w-4 h-4 text-amber-500" />
            Google Drive: <strong>Invoice {project.jobNumber}</strong>
          </span>
        )}
      </div>

      {/* Header */}
      <div className="rounded-3xl bg-slate-950 text-white p-6 sm:p-8 flex flex-col lg:flex-row lg:items-center justify-between gap-6">
        <div className="space-y-2 min-w-0">
          <div className="flex flex-wrap items-center gap-2.5">
            <span className="font-mono text-sm font-black px-3 py-1 rounded-lg bg-amber-500 text-slate-950 whitespace-nowrap">
              {project.jobNumber ? `JOB / SAGE INVOICE #${project.jobNumber}` : projectRef(project)}
            </span>
            {project.jobNumber && (
              <span className="font-mono text-xs text-slate-400">{project.quoteNumber}</span>
            )}
            <span className={`inline-flex items-center gap-1.5 text-xs font-bold px-3 py-1 rounded-full border bg-white ${pk.chip}`}>
              <span className={`w-2 h-2 rounded-full ${pk.dot}`} />
              {pk.label}
            </span>
            {signed && (
              <span className="text-xs font-semibold uppercase px-3 py-1 rounded-full bg-slate-800 text-slate-200 border border-slate-700 whitespace-nowrap">
                {STAGE_LABEL[project.status]}
              </span>
            )}
            {project.priority === "rush" && (
              <span className="text-xs font-bold uppercase px-3 py-1 rounded-full bg-rose-600 text-white whitespace-nowrap">
                Rush priority
              </span>
            )}
          </div>
          <h1 className="text-xl sm:text-2xl font-bold text-white pt-1">{project.title}</h1>
          <div className="text-xs sm:text-sm text-slate-300 flex flex-wrap items-center gap-4">
            <span>
              Customer: <strong className="text-white">{customer.name}</strong>
            </span>
            {project.poReference && (
              <span>
                PO: <strong className="text-white">{project.poReference}</strong>
              </span>
            )}
            {signed && (
              <span>
                Install date:{" "}
                <strong className="text-amber-300">{project.scheduledDate || "Not scheduled"}</strong>
              </span>
            )}
            {project.validUntil && unsigned && (
              <span>
                Quote valid until <strong className="text-white">{project.validUntil}</strong>
              </span>
            )}
          </div>
        </div>
        <div className="lg:text-right shrink-0 space-y-1">
          <div className="text-xs text-slate-400">Total ({project.taxLabel})</div>
          <div className="text-2xl sm:text-3xl font-black text-white">{formatCAD(project.totalCents)}</div>
          {signed &&
            (project.invoiceSentAt ? (
              <div className="inline-flex items-center gap-1 text-xs text-emerald-400 font-medium">
                <CheckCircle2 className="w-3.5 h-3.5" />
                Invoice sent to {project.invoiceSentToEmail}
              </div>
            ) : (
              <div className="text-xs text-amber-400 font-medium">Invoice not sent yet</div>
            ))}
        </div>
      </div>

      {project.status === "action_needed" && project.declineReason && (
        <div className="rounded-2xl bg-red-50 border border-red-300 p-4 text-sm text-red-900">
          <strong>The client asked for changes:</strong> {project.declineReason}
        </div>
      )}

      {/* Actions depend on where the project is */}
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

      {/* Tabs */}
      <div className="border-b border-slate-200 flex gap-1 overflow-x-auto print:hidden">
        {TABS.map((t) => (
          <Link
            key={t.key}
            href={`/projects/${project.id}?tab=${t.key}`}
            className={`px-4 py-2.5 text-sm font-semibold whitespace-nowrap border-b-2 -mb-px ${
              tab === t.key
                ? "border-amber-500 text-slate-900"
                : "border-transparent text-slate-500 hover:text-slate-800"
            }`}
          >
            {t.label}
            {t.key === "fulfillment" && files.length > 0 && (
              <span className="ml-1.5 text-[11px] bg-slate-100 text-slate-600 rounded-full px-1.5">{files.length}</span>
            )}
          </Link>
        ))}
      </div>

      {tab === "contract" && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-8 space-y-6">
            <div className="rounded-2xl bg-white border border-slate-200/90 p-6 shadow-xs space-y-5">
              <h2 className="text-base font-bold text-slate-900">Line items</h2>
              {[...groups.entries()].map(([groupName, groupItems]) => {
                const groupNet = groupItems.reduce((a, i) => a + i.netCents, 0);
                return (
                  <div key={groupName || "_"} className="space-y-2">
                    {groupName && (
                      <div className="flex items-center justify-between">
                        <div className="text-xs font-bold uppercase tracking-wider text-slate-500">{groupName}</div>
                        <div className="text-xs font-semibold text-slate-600">{formatCAD(groupNet)}</div>
                      </div>
                    )}
                    <div className="divide-y divide-slate-100 border border-slate-200 rounded-xl overflow-hidden">
                      {groupItems.map((item) => (
                        <div
                          key={item.id}
                          className={`p-3.5 flex items-center justify-between gap-4 text-sm ${
                            item.hiddenFromCustomer ? "bg-slate-50" : ""
                          }`}
                        >
                          <div className="min-w-0">
                            <div className="font-semibold text-slate-900 flex flex-wrap items-center gap-2">
                              {item.description}
                              {item.hiddenFromCustomer && (
                                <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase px-1.5 py-0.5 rounded bg-slate-200 text-slate-600">
                                  <EyeOff className="w-3 h-3" /> Internal only
                                </span>
                              )}
                            </div>
                            <div className="text-xs text-slate-500">
                              Qty {item.quantity} × {formatCAD(item.unitPriceCents)}
                            </div>
                          </div>
                          <div className="font-bold text-slate-900 shrink-0">{formatCAD(item.netCents)}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
              <div className="flex justify-end pt-2">
                <div className="space-y-1 text-right text-xs text-slate-600">
                  <div>
                    Subtotal: <strong className="text-slate-900">{formatCAD(project.subtotalCents)}</strong>
                  </div>
                  <div>
                    Tax ({project.taxLabel}): <strong className="text-slate-900">{formatCAD(project.taxCents)}</strong>
                  </div>
                  <div className="text-base font-bold text-slate-900">Total: {formatCAD(project.totalCents)}</div>
                </div>
              </div>
            </div>

            {(project.description || project.customerTerms) && (
              <div className="rounded-2xl bg-white border border-slate-200/90 p-6 shadow-xs space-y-3 text-sm text-slate-700">
                {project.description && (
                  <div>
                    <div className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-1">Scope notes</div>
                    {project.description}
                  </div>
                )}
                {project.customerTerms && (
                  <div>
                    <div className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-1">Terms</div>
                    {project.customerTerms}
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="lg:col-span-4 space-y-6">
            <div className="rounded-2xl bg-white border border-slate-200/90 p-6 shadow-xs space-y-3 text-xs text-slate-700">
              <h2 className="text-base font-bold text-slate-900">Customer &amp; site</h2>
              <div>
                <span className="text-slate-400 block">Customer</span>
                <strong className="text-sm text-slate-900">{customer.name}</strong>
              </div>
              {customer.phone && (
                <div className="flex items-center gap-2">
                  <Phone className="w-3.5 h-3.5 text-slate-400" />
                  <a href={`tel:${customer.phone}`} className="font-semibold text-slate-900 hover:underline">
                    {customer.phone}
                  </a>
                </div>
              )}
              <div className="flex items-start gap-2">
                <MapPin className="w-3.5 h-3.5 text-amber-600 shrink-0 mt-0.5" />
                <div>
                  <div className="font-medium text-slate-900">{project.siteAddress || customer.addressLine1}</div>
                  <a
                    href={`https://www.google.com/maps/search/?api=1&query=${mapsQuery}`}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-amber-600 font-semibold hover:underline mt-1"
                  >
                    Open in Google Maps <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
              </div>
              {customer.siteNotes && (
                <div className="rounded-xl bg-amber-50 border border-amber-200 p-3 text-amber-950">{customer.siteNotes}</div>
              )}
            </div>
          </div>
        </div>
      )}

      {tab === "billing" && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="space-y-6">
            <div className="rounded-2xl bg-white border border-slate-200/90 p-6 shadow-xs space-y-3 text-sm">
              <h2 className="text-base font-bold text-slate-900">Invoice</h2>
              {!invoice ? (
                <p className="text-slate-500 text-sm">
                  No invoice yet. The invoice number is reserved the moment the client signs, and billed when you send it.
                </p>
              ) : (
                <dl className="grid grid-cols-2 gap-y-2 text-xs">
                  <dt className="text-slate-500">Invoice #</dt>
                  <dd className="font-mono font-bold">{invoice.invoiceNumber}</dd>
                  <dt className="text-slate-500">Status</dt>
                  <dd className="font-semibold uppercase">
                    {invoice.status === "draft" ? "Draft — not billed yet" : invoice.status === "issued" ? "Issued" : "Void"}
                  </dd>
                  <dt className="text-slate-500">Invoice date</dt>
                  <dd>{invoice.issueDate ?? "Set when you send it"}</dd>
                  <dt className="text-slate-500">Due date</dt>
                  <dd>{invoice.dueDate ?? "—"}</dd>
                  <dt className="text-slate-500">Sent to</dt>
                  <dd>
                    {invoice.sentToEmail
                      ? `${invoice.sentToEmail}${invoice.sentAt ? " on " + new Date(invoice.sentAt).toLocaleDateString("en-CA") : ""}`
                      : "—"}
                  </dd>
                  <dt className="text-slate-500">Entered in the books</dt>
                  <dd>{invoice.capturedBatchId ? `Yes (accounting batch #${invoice.capturedBatchId})` : "Not yet"}</dd>
                  {invoice.voidReason && (
                    <>
                      <dt className="text-slate-500">Void reason</dt>
                      <dd>{invoice.voidReason}</dd>
                    </>
                  )}
                </dl>
              )}
            </div>

            <div className="rounded-2xl bg-white border border-slate-200/90 p-6 shadow-xs space-y-3">
              <h2 className="text-base font-bold text-slate-900">Payments received</h2>
              {invoicePayments.length === 0 ? (
                <p className="text-xs text-slate-500">No payments recorded yet.</p>
              ) : (
                <div className="divide-y divide-slate-100 border border-slate-200 rounded-xl overflow-hidden">
                  {invoicePayments.map((pay) => (
                    <div key={pay.id} className="p-3 text-xs flex justify-between gap-3">
                      <div>
                        <div className="font-semibold text-slate-900">
                          {pay.receivedOn} • {pay.method}
                        </div>
                        <div className="text-slate-500">
                          {pay.reference || "—"} • recorded by {pay.recordedByName}
                          {pay.capturedBatchId ? ` • in books (batch #${pay.capturedBatchId})` : ""}
                        </div>
                      </div>
                      <strong className="whitespace-nowrap">{formatCAD(pay.amountCents)}</strong>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="rounded-2xl bg-white border border-slate-200/90 p-6 shadow-xs space-y-2 text-sm h-fit">
            <h2 className="text-base font-bold text-slate-900">Totals</h2>
            <div className="flex justify-between text-xs"><span>Subtotal</span><strong>{formatCAD(project.subtotalCents)}</strong></div>
            <div className="flex justify-between text-xs"><span>Tax ({project.taxLabel})</span><strong>{formatCAD(project.taxCents)}</strong></div>
            <div className="flex justify-between text-base font-bold border-t border-slate-200 pt-2"><span>Total</span><span>{formatCAD(project.totalCents)}</span></div>
            <div className="flex justify-between text-xs"><span>Paid</span><strong className="text-emerald-700">{formatCAD(paidCents)}</strong></div>
            <div className="flex justify-between text-sm font-bold"><span>Balance owing</span><span>{formatCAD(balanceCents)}</span></div>
          </div>
        </div>
      )}

      {tab === "fulfillment" && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="rounded-2xl bg-white border border-slate-200/90 p-6 shadow-xs space-y-3">
            <h2 className="text-base font-bold text-slate-900">Work order</h2>
            {!signed && <p className="text-xs text-slate-500">Becomes active once the client signs.</p>}
            <div className="divide-y divide-slate-100 border border-slate-200 rounded-xl overflow-hidden">
              {items.map((it) => (
                <div key={it.id} className="p-3 text-xs flex justify-between gap-3">
                  <span>
                    • {it.description}
                    {it.hiddenFromCustomer && <em className="text-slate-400"> (internal)</em>}
                  </span>
                  <strong className="whitespace-nowrap">Qty {it.quantity}</strong>
                </div>
              ))}
            </div>
            {(project.installerNotes || customer.siteNotes) && (
              <div className="rounded-xl bg-amber-50 border border-amber-200 p-3 text-xs text-amber-950 space-y-1">
                <div className="font-bold uppercase tracking-wider text-[11px] text-amber-800">Installer &amp; site notes</div>
                {project.installerNotes && <div>{project.installerNotes}</div>}
                {customer.siteNotes && <div>{customer.siteNotes}</div>}
              </div>
            )}
          </div>
          <div className="rounded-2xl bg-white border border-slate-200/90 p-6 shadow-xs space-y-3">
            <h2 className="text-base font-bold text-slate-900">Proofs, artwork &amp; install photos ({files.length})</h2>
            {files.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-200 p-6 text-center text-xs text-slate-500">
                No files yet. Upload from the controls above or from the installer phone view.
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {files.map((f) => (
                  <div key={f.id} className="rounded-xl border border-slate-200 p-3 space-y-1 bg-slate-50/50 text-xs">
                    <span className="font-semibold uppercase px-2 py-0.5 rounded bg-slate-900 text-amber-400 text-[11px]">
                      {f.kind.replace("_", " ")}
                    </span>
                    <div className="font-semibold text-slate-900 truncate">{f.originalName}</div>
                    <div className="text-[11px] text-slate-400">
                      {f.uploadedByName} • {new Date(f.createdAt).toLocaleString("en-CA")}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {tab === "log" && (
        <div className="rounded-2xl bg-white border border-slate-200/90 p-6 shadow-xs space-y-3">
          <h2 className="text-base font-bold text-slate-900">Activity log</h2>
          {logs.length === 0 ? (
            <p className="text-xs text-slate-500">Nothing recorded yet.</p>
          ) : (
            <div className="space-y-3">
              {logs.map((l) => (
                <div key={l.id} className="text-xs border-l-2 border-amber-400 pl-3 py-0.5">
                  <div className="font-medium text-slate-900">{l.summary}</div>
                  <div className="text-[11px] text-slate-500">
                    {l.actorName} • {new Date(l.createdAt).toLocaleString("en-CA")}
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
