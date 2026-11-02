import Link from "next/link";
import { notFound } from "next/navigation";
import { and, asc, desc, eq, or } from "drizzle-orm";
import {
  ArrowLeft,
  CheckCircle2,
  ExternalLink,
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
  jobItems,
  jobs,
  users,
} from "@/db/schema";
import { formatCAD } from "@/lib/money";
import { JobDetailClientControls } from "@/components/JobDetailClientControls";

export const dynamic = "force-dynamic";

export default async function JobDetailPage(props: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await props.params;
  const jobId = Number(id);
  if (!jobId) notFound();

  const db = await getDb();
  const [row] = await db
    .select({
      job: jobs,
      customer: customers,
    })
    .from(jobs)
    .innerJoin(customers, eq(jobs.customerId, customers.id))
    .where(eq(jobs.id, jobId))
    .limit(1);

  if (!row) notFound();
  const { job, customer } = row;

  const items = await db
    .select()
    .from(jobItems)
    .where(eq(jobItems.jobId, job.id))
    .orderBy(asc(jobItems.sortOrder));

  const files = await db
    .select()
    .from(jobFiles)
    .where(eq(jobFiles.jobId, job.id))
    .orderBy(desc(jobFiles.createdAt));

  const assignments = await db
    .select()
    .from(jobAssignments)
    .where(eq(jobAssignments.jobId, job.id));

  const allInstallers = await db
    .select()
    .from(users)
    .where(eq(users.role, "installer"));

  // Strictly scope activity log to this job (plus its originating quote if linked)
  const logFilter = job.quoteId
    ? or(
        and(eq(activityLog.entityType, "job"), eq(activityLog.entityId, String(job.id))),
        and(eq(activityLog.entityType, "quote"), eq(activityLog.entityId, String(job.quoteId)))
      )
    : and(eq(activityLog.entityType, "job"), eq(activityLog.entityId, String(job.id)));

  const logs = await db
    .select()
    .from(activityLog)
    .where(logFilter)
    .orderBy(desc(activityLog.createdAt));

  const mapsQuery = encodeURIComponent(
    job.siteAddress || `${customer.addressLine1}, ${customer.city}, ${customer.province}`
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <Link
          href="/jobs"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-600 hover:text-slate-900"
        >
          <ArrowLeft className="w-4 h-4" /> Back to Jobs Board
        </Link>
        {job.driveFolderUrl && (
          <span className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-600 bg-white border border-slate-200 px-3 py-1.5 rounded-xl">
            <FolderOpen className="w-4 h-4 text-amber-500" />
            Google Drive: <strong>Invoice {job.jobNumber}</strong>
          </span>
        )}
      </div>

      {/* Top Banner */}
      <div className="rounded-3xl bg-slate-950 text-white p-6 sm:p-8 flex flex-col lg:flex-row lg:items-center justify-between gap-6">
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2.5">
            <span className="font-mono text-sm font-black px-3 py-1 rounded-lg bg-amber-500 text-slate-950 whitespace-nowrap">
              {job.jobNumber
                ? `JOB / SAGE INVOICE #${job.jobNumber}`
                : "⏳ WAITING FOR SAGE NUMBER"}
            </span>
            <span className="text-xs font-semibold uppercase px-3 py-1 rounded-full bg-slate-800 text-slate-200 border border-slate-700 whitespace-nowrap">
              Status: {job.status.replace("_", " ")}
            </span>
            <span
              className={`text-xs font-semibold uppercase px-3 py-1 rounded-full whitespace-nowrap ${
                job.sagePaymentStatus === "PAID"
                  ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
                  : job.sagePaymentStatus === "VOID"
                    ? "bg-rose-500/20 text-rose-300 border border-rose-500/30"
                    : "bg-amber-500/20 text-amber-300 border border-amber-500/30"
              }`}
            >
              Sage: {job.sagePaymentStatus}
            </span>
            {job.priority === "rush" && (
              <span className="text-xs font-bold uppercase px-3 py-1 rounded-full bg-rose-600 text-white whitespace-nowrap">
                RUSH PRIORITY
              </span>
            )}
          </div>

          <h1 className="text-xl sm:text-2xl font-bold text-white pt-1">
            {job.title}
          </h1>
          <div className="text-xs sm:text-sm text-slate-300 flex flex-wrap items-center gap-4">
            <span>
              Customer: <strong className="text-white">{customer.name}</strong>
            </span>
            {job.poReference && (
              <span>
                PO: <strong className="text-white">{job.poReference}</strong>
              </span>
            )}
            <span>
              Install Date:{" "}
              <strong className="text-amber-300">
                {job.scheduledDate || "Not scheduled"}
              </strong>
            </span>
          </div>
        </div>

        <div className="lg:text-right shrink-0 space-y-1">
          <div className="text-xs text-slate-400">
            Total ({job.taxLabel})
          </div>
          <div className="text-2xl sm:text-3xl font-black text-white">
            {formatCAD(job.totalCents)}
          </div>
          {job.invoiceSentAt ? (
            <div className="inline-flex items-center gap-1 text-xs text-emerald-400 font-medium">
              <CheckCircle2 className="w-3.5 h-3.5" />
              Invoice sent to {job.invoiceSentToEmail} on{" "}
              {new Date(job.invoiceSentAt).toLocaleDateString("en-CA")}
            </div>
          ) : (
            <div className="text-xs text-amber-400 font-medium">
              Invoice not yet sent to customer (click Send below when ready)
            </div>
          )}
        </div>
      </div>

      {job.sageSyncStatus === "pending_number" && (
        <div className="rounded-2xl bg-amber-50 border border-amber-300 p-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 text-xs sm:text-sm text-amber-950">
            <ShieldAlert className="w-5 h-5 text-amber-600 shrink-0" />
            <span>
              This job is waiting for Sage Accounting to assign its official invoice number. No fallback number is ever invented.
            </span>
          </div>
        </div>
      )}

      {/* Client Controls: Status Pipeline, Send Sage Invoice, Mark Paid, Void, Installer Assignment, Photo Upload */}
      <JobDetailClientControls
        job={{
          id: job.id,
          jobNumber: job.jobNumber,
          status: job.status,
          scheduledDate: job.scheduledDate || "",
          sagePaymentStatus: job.sagePaymentStatus,
          sageSyncStatus: job.sageSyncStatus,
          totalFormatted: formatCAD(job.totalCents),
          invoiceSentAt: job.invoiceSentAt?.toISOString() ?? null,
          invoiceSentToEmail: job.invoiceSentToEmail,
        }}
        customerEmail={customer.email || ""}
        installers={allInstallers.map((u) => ({
          id: u.id,
          name: u.name,
          assigned: assignments.some((a) => a.userId === u.id),
        }))}
      />

      {/* Two-Column Details: Line Items & Photos on Left, Customer & Site Map on Right */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-7 space-y-6">
          {/* Line Items */}
          <div className="rounded-2xl bg-white border border-slate-200/90 p-6 shadow-xs space-y-4">
            <h2 className="text-base font-bold text-slate-900">
              Line Items (Synced with Sage Invoice #{job.jobNumber ?? "Pending"})
            </h2>
            <div className="divide-y divide-slate-100 border border-slate-200 rounded-xl overflow-hidden">
              {items.map((item) => (
                <div
                  key={item.id}
                  className="p-3.5 flex items-center justify-between gap-4 text-sm"
                >
                  <div>
                    <div className="font-semibold text-slate-900">
                      {item.description}
                    </div>
                    <div className="text-xs text-slate-500">
                      Qty: {item.quantity} × {formatCAD(item.unitPriceCents)}
                    </div>
                  </div>
                  <div className="font-bold text-slate-900 shrink-0">
                    {formatCAD(item.netCents)}
                  </div>
                </div>
              ))}
            </div>
            <div className="flex justify-end pt-2">
              <div className="space-y-1 text-right text-xs text-slate-600">
                <div>
                  Subtotal: <strong className="text-slate-900">{formatCAD(job.subtotalCents)}</strong>
                </div>
                <div>
                  Tax ({job.taxLabel}):{" "}
                  <strong className="text-slate-900">{formatCAD(job.taxCents)}</strong>
                </div>
                <div className="text-base font-bold text-slate-900">
                  Total: {formatCAD(job.totalCents)}
                </div>
              </div>
            </div>
          </div>

          {/* Job Files & Installer Photos (Stored in App + Mirrored to Drive) */}
          <div className="rounded-2xl bg-white border border-slate-200/90 p-6 shadow-xs space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-base font-bold text-slate-900">
                  Proofs, Artwork & Installer Photos ({files.length})
                </h2>
                <p className="text-xs text-slate-500">
                  Stored in app storage and mirrored to Google Drive folder &ldquo;Invoice {job.jobNumber}&rdquo;
                </p>
              </div>
            </div>

            {files.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-200 p-6 text-center text-xs text-slate-500">
                No photos or files uploaded yet. Use the <strong>+ Upload Proof / Photo</strong> control above or the Installer Phone View.
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {files.map((f) => (
                  <div
                    key={f.id}
                    className="rounded-xl border border-slate-200 p-3 space-y-2 bg-slate-50/50"
                  >
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="font-semibold uppercase px-2 py-0.5 rounded bg-slate-900 text-amber-400">
                        {f.kind.replace("_", " ")}
                      </span>
                      <span className="text-emerald-700 font-medium">
                        ✓ Mirrored to Drive
                      </span>
                    </div>
                    <div className="text-xs font-semibold text-slate-900 truncate">
                      {f.originalName}
                    </div>
                    {f.caption && (
                      <div className="text-xs text-slate-600">{f.caption}</div>
                    )}
                    <div className="text-[11px] text-slate-400">
                      Uploaded by {f.uploadedByName} •{" "}
                      {new Date(f.createdAt).toLocaleString("en-CA")}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Site Address, Customer Contact & Activity Timeline */}
        <div className="lg:col-span-5 space-y-6">
          <div className="rounded-2xl bg-white border border-slate-200/90 p-6 shadow-xs space-y-4">
            <h2 className="text-base font-bold text-slate-900">
              Site & Customer Details
            </h2>
            <div className="space-y-2 text-xs text-slate-700">
              <div>
                <span className="text-slate-400 block">Customer</span>
                <strong className="text-sm text-slate-900">{customer.name}</strong>
              </div>
              {customer.phone && (
                <div className="flex items-center gap-2">
                  <Phone className="w-3.5 h-3.5 text-slate-400" />
                  <a
                    href={`tel:${customer.phone}`}
                    className="font-semibold text-slate-900 hover:underline"
                  >
                    {customer.phone}
                  </a>
                </div>
              )}
              <div className="flex items-start gap-2 pt-1">
                <MapPin className="w-3.5 h-3.5 text-amber-600 shrink-0 mt-0.5" />
                <div>
                  <div className="font-medium text-slate-900">
                    {job.siteAddress || customer.addressLine1}
                  </div>
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

              {(job.installerNotes || customer.siteNotes) && (
                <div className="rounded-xl bg-amber-50 border border-amber-200 p-3 mt-3 space-y-1">
                  <div className="text-[11px] font-bold uppercase tracking-wider text-amber-800">
                    Installer & Site Access Notes
                  </div>
                  {job.installerNotes && (
                    <div className="text-xs text-amber-950">{job.installerNotes}</div>
                  )}
                  {customer.siteNotes && (
                    <div className="text-xs text-amber-900">{customer.siteNotes}</div>
                  )}
                </div>
              )}
            </div>
          </div>

          <div className="rounded-2xl bg-white border border-slate-200/90 p-6 shadow-xs space-y-3">
            <h2 className="text-base font-bold text-slate-900">Job Activity Log</h2>
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
          </div>
        </div>
      </div>
    </div>
  );
}
