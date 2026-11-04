import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { AlertCircle, ExternalLink, HardHat, Plus, Tag } from "lucide-react";
import { getDb } from "@/db";
import { customers, projects } from "@/db/schema";
import { PIPELINE, isSigned, isUnsignedQuote, pipelineOf } from "@/lib/project-status";
import { formatCAD } from "@/lib/money";
import { getNextInvoiceNumberPreview } from "@/lib/invoicing";
import { DashboardInvoiceActions } from "@/components/DashboardInvoiceActions";
import { CopyQuoteLinkButton } from "@/components/CopyQuoteLinkButton";

export const dynamic = "force-dynamic";

const DAY_MS = 86_400_000;

function daysAgo(d: Date | string | null | undefined, now: number): number | null {
  if (!d) return null;
  return Math.floor((now - new Date(d).getTime()) / DAY_MS);
}

function dayLabel(days: number | null): string {
  if (days === null) return "";
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  return `${days}d ago`;
}

const JOB_STAGE_LABEL: Record<string, string> = {
  approved: "Signed • Unscheduled",
  scheduled: "Scheduled",
  in_progress: "In Progress",
  installed: "Installed • Unbilled",
  invoiced: "Invoiced • Awaiting Payment",
};

const JOB_STAGE_STYLE: Record<string, string> = {
  approved: "bg-slate-100 text-slate-700 border-slate-200",
  scheduled: "bg-blue-50 text-[#186ade] border-blue-200",
  in_progress: "bg-amber-50 text-amber-800 border-amber-200",
  installed: "bg-emerald-50 text-emerald-700 border-emerald-200",
  invoiced: "bg-purple-50 text-purple-700 border-purple-200",
};

export default async function DashboardPage() {
  const db = await getDb();
  const nextInvoiceNumber = await getNextInvoiceNumberPreview();

  const everything = await db
    .select({ project: projects, customer: customers })
    .from(projects)
    .innerJoin(customers, eq(projects.customerId, customers.id))
    .orderBy(desc(projects.id));

  // Signed projects are jobs; unsigned ones are quotes (same record, different phase)
  const allJobs = everything
    .filter(({ project }) => isSigned(project.status))
    .map(({ project, customer }) => ({ job: project, customer }));
  const allQuotes = everything
    .filter(({ project }) => isUnsignedQuote(project.status))
    .map(({ project, customer }) => ({ quote: project, customer }));

  const nowMs = Date.now();
  const today = new Date().toISOString().slice(0, 10);

  // 1. Jobs that still need to be installed (not yet installed, not cancelled)
  const toInstall = allJobs
    .filter(({ job }) => ["approved", "scheduled", "in_progress"].includes(job.status))
    .map((row) => {
      const d = row.job.scheduledDate;
      let when: "overdue" | "today" | "upcoming" | "unscheduled";
      if (!d) when = "unscheduled";
      else if (d < today) when = "overdue";
      else if (d === today) when = "today";
      else when = "upcoming";
      return { ...row, when };
    });

  // "Now" = overdue, today, in progress, rush, or still needing a date
  const installNow = toInstall
    .filter(
      ({ job, when }) =>
        when === "overdue" ||
        when === "today" ||
        when === "unscheduled" ||
        job.status === "in_progress" ||
        job.priority === "rush"
    )
    .sort((a, b) => {
      const weight = (r: typeof a) =>
        r.when === "overdue"
          ? 0
          : r.job.status === "in_progress"
            ? 1
            : r.when === "today"
              ? 2
              : r.job.priority === "rush"
                ? 3
                : 4;
      return weight(a) - weight(b);
    });

  // 2. Open projects = every job not yet paid or cancelled
  const openProjects = allJobs.filter(({ job }) =>
    ["approved", "scheduled", "in_progress", "installed", "invoiced"].includes(job.status)
  );
  const readyToInvoice = allJobs.filter(
    ({ job }) => job.status === "installed" && !job.invoiceSentAt
  );
  const openProjectValueCents = openProjects.reduce((a, { job }) => a + job.totalCents, 0);

  // 3. Quotes with no decision yet (not approved, not declined)
  const awaiting = allQuotes
    .filter(({ quote }) => ["new", "quote_sent", "action_needed"].includes(quote.status))
    .sort((a, b) => {
      const rank = (q: typeof a.quote) =>
        q.status === "action_needed" ? 0 : q.firstViewedAt ? 1 : q.status === "quote_sent" ? 2 : 3;
      const r = rank(a.quote) - rank(b.quote);
      if (r !== 0) return r;
      return (
        new Date(a.quote.sentAt ?? a.quote.createdAt).getTime() -
        new Date(b.quote.sentAt ?? b.quote.createdAt).getTime()
      );
    });
  const awaitingValueCents = awaiting.reduce((a, { quote }) => a + quote.totalCents, 0);

  return (
    <div className="flex-1 flex flex-col min-h-0">
      {/* Goodshuffle Pro Full-Bleed Top Bar */}
      <div className="bg-white border-b border-slate-200 px-6 h-16 flex items-center justify-between gap-4 shrink-0">
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-normal text-slate-600 tracking-tight">Dashboard</h1>
          <span className="hidden sm:inline-block text-xs text-slate-400 border-l border-slate-200 pl-3 tabular-nums">
            {new Date().toLocaleDateString("en-CA", {
              weekday: "short",
              month: "short",
              day: "numeric",
              year: "numeric",
            })}{" "}
            • Next Master Job #{nextInvoiceNumber}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <Link
            href="/installer"
            className="inline-flex items-center gap-1.5 rounded-xs border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 font-semibold text-xs px-3 py-2 whitespace-nowrap transition"
          >
            <HardHat className="w-3.5 h-3.5 text-slate-500" />
            Crew View
          </Link>
          <Link
            href="/projects/new"
            className="inline-flex items-center gap-1.5 rounded-xs bg-[#186ade] hover:bg-[#1458b8] text-white font-semibold text-xs px-3.5 py-2 whitespace-nowrap shadow-2xs transition"
          >
            <Plus className="w-3.5 h-3.5 stroke-[2.5]" />
            New Project
          </Link>
        </div>
      </div>

      {/* Main Dashboard Workspace */}
      <div className="p-6 max-w-7xl w-full mx-auto space-y-6">
        {/* Goodshuffle Pro 3-Column Colored Header Operational Cards */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          {/* Column 1: Need Installing Now (Goodshuffle Coral Red Header) */}
          <section
            id="install-now"
            className="rounded-xs bg-white border border-slate-200 shadow-2xs flex flex-col overflow-hidden"
          >
            <div className="bg-[#d9434e] text-white px-4 py-3 flex items-center justify-between">
              <div>
                <h2 className="text-xs font-bold uppercase tracking-wider">
                  Need Installing Now
                </h2>
                <p className="text-[11px] text-white/85 mt-0.5">
                  Overdue, Today, In Progress &amp; Rush
                </p>
              </div>
              <span className="text-xl font-bold tabular-nums bg-black/15 px-2.5 py-0.5 rounded-xs">
                {installNow.length}
              </span>
            </div>

            <div className="flex-1 divide-y divide-slate-200">
              {installNow.length === 0 ? (
                <div className="p-6 text-center text-xs text-slate-500">
                  No urgent installations pending right now.
                </div>
              ) : (
                installNow.map(({ job, customer, when }) => (
                  <Link
                    key={job.id}
                    href={`/projects/${job.id}`}
                    className="p-3.5 flex items-start justify-between gap-3 hover:bg-slate-50 transition group"
                  >
                    <div className="min-w-0 space-y-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <Tag className="w-3.5 h-3.5 text-[#10b981] fill-current shrink-0" />
                        <span className="font-semibold text-xs text-slate-800 group-hover:text-[#186ade] truncate">
                          {job.title}
                        </span>
                        <span className="text-xs text-slate-400 tabular-nums">
                          ({job.jobNumber ? `#${job.jobNumber}` : "Pending"})
                        </span>
                      </div>
                      <div className="text-[11px] text-slate-500 truncate">
                        {customer.name} • {job.siteAddress || "Halifax"}
                      </div>
                      <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                        {job.priority === "rush" && (
                          <span className="text-[10px] font-bold uppercase px-1.5 py-0.2 rounded-xs bg-rose-600 text-white">
                            Rush
                          </span>
                        )}
                        {when === "overdue" && (
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase px-1.5 py-0.2 rounded-xs bg-rose-50 text-rose-700 border border-rose-200">
                            <AlertCircle className="w-2.5 h-2.5" /> Overdue ({job.scheduledDate})
                          </span>
                        )}
                        {when === "today" && (
                          <span className="text-[10px] font-bold uppercase px-1.5 py-0.2 rounded-xs bg-amber-100 text-amber-900 border border-amber-300">
                            Today
                          </span>
                        )}
                        {when === "unscheduled" && (
                          <span className="text-[10px] font-semibold uppercase px-1.5 py-0.2 rounded-xs bg-slate-100 text-slate-700 border border-slate-300">
                            Needs Date
                          </span>
                        )}
                        {job.status === "in_progress" && (
                          <span className="text-[10px] font-bold uppercase px-1.5 py-0.2 rounded-xs bg-blue-50 text-[#186ade] border border-blue-200">
                            In Progress
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="text-right shrink-0 tabular-nums">
                      <div className="text-xs font-bold text-slate-800">
                        {formatCAD(job.totalCents)}
                      </div>
                    </div>
                  </Link>
                ))
              )}
            </div>

            <div className="bg-[#f8fafc] border-t border-slate-200 px-4 py-2 text-right">
              <Link
                href="/projects?status=signed"
                className="text-[11px] font-semibold text-[#186ade] hover:underline"
              >
                View all {toInstall.length} scheduled installs →
              </Link>
            </div>
          </section>

          {/* Column 2: Quotes Awaiting Answer (Goodshuffle Royal Blue Header) */}
          <section
            id="quotes-waiting"
            className="rounded-xs bg-white border border-slate-200 shadow-2xs flex flex-col overflow-hidden"
          >
            <div className="bg-[#2b7fff] text-white px-4 py-3 flex items-center justify-between">
              <div>
                <h2 className="text-xs font-bold uppercase tracking-wider">
                  Quotes Awaiting Decision
                </h2>
                <p className="text-[11px] text-white/85 mt-0.5 tabular-nums">
                  {formatCAD(awaitingValueCents)} Open Pipeline
                </p>
              </div>
              <span className="text-xl font-bold tabular-nums bg-black/15 px-2.5 py-0.5 rounded-xs">
                {awaiting.length}
              </span>
            </div>

            <div className="flex-1 divide-y divide-slate-200">
              {awaiting.length === 0 ? (
                <div className="p-6 text-center text-xs text-slate-500">
                  Every sent quote has been decided.
                </div>
              ) : (
                awaiting.map(({ quote, customer }) => {
                  const sentDays = daysAgo(quote.sentAt, nowMs);
                  const viewedDays = daysAgo(quote.firstViewedAt, nowMs);
                  const pk = PIPELINE.find((p) => p.key === pipelineOf(quote.status))!;
                  return (
                    <div
                      key={quote.id}
                      className="p-3.5 flex flex-col justify-between gap-2 hover:bg-slate-50 transition"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            <Tag
                              className="w-3.5 h-3.5 shrink-0 fill-current"
                              style={{ color: pk.tagColor }}
                            />
                            <Link
                              href={`/projects/${quote.id}`}
                              className="font-semibold text-xs text-slate-800 hover:text-[#186ade] hover:underline truncate"
                            >
                              {quote.title} ({quote.quoteNumber})
                            </Link>
                          </div>
                          <div className="text-[11px] text-slate-500 mt-0.5 truncate">
                            {customer.name}
                          </div>
                        </div>
                        <span className="font-bold text-xs text-slate-800 tabular-nums shrink-0">
                          {formatCAD(quote.totalCents)}
                        </span>
                      </div>

                      <div className="flex items-center justify-between gap-2 pt-1">
                        <div>
                          {quote.status === "action_needed" ? (
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-xs bg-rose-50 text-rose-700 border border-rose-200">
                              Changes Requested
                            </span>
                          ) : quote.firstViewedAt ? (
                            <span className="text-[10px] font-semibold px-2 py-0.5 rounded-xs bg-amber-50 text-amber-800 border border-amber-200">
                              Viewed {dayLabel(viewedDays)}
                            </span>
                          ) : quote.status === "quote_sent" ? (
                            <span className="text-[10px] font-semibold px-2 py-0.5 rounded-xs bg-blue-50 text-[#186ade] border border-blue-200">
                              Sent {dayLabel(sentDays)} • Unread
                            </span>
                          ) : (
                            <span className="text-[10px] font-semibold px-2 py-0.5 rounded-xs bg-slate-100 text-slate-600 border border-slate-200">
                              Draft
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-1.5">
                          <CopyQuoteLinkButton publicToken={quote.publicToken} />
                          <Link
                            href={`/projects/${quote.id}`}
                            className="inline-flex items-center gap-1 rounded-xs border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 font-semibold text-[11px] px-2 py-1"
                          >
                            Open <ExternalLink className="w-3 h-3 text-[#186ade]" />
                          </Link>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            <div className="bg-[#f8fafc] border-t border-slate-200 px-4 py-2 text-right">
              <Link
                href="/projects?status=quote_sent"
                className="text-[11px] font-semibold text-[#186ade] hover:underline"
              >
                View all open quotes →
              </Link>
            </div>
          </section>

          {/* Column 3: Ready to Invoice & Billing Action (Goodshuffle Teal Header) */}
          <section className="rounded-xs bg-white border border-slate-200 shadow-2xs flex flex-col overflow-hidden">
            <div className="bg-[#1ca67a] text-white px-4 py-3 flex items-center justify-between">
              <div>
                <h2 className="text-xs font-bold uppercase tracking-wider">
                  Installed • Ready to Invoice
                </h2>
                <p className="text-[11px] text-white/85 mt-0.5">
                  Completed installs awaiting invoice dispatch
                </p>
              </div>
              <span className="text-xl font-bold tabular-nums bg-black/15 px-2.5 py-0.5 rounded-xs">
                {readyToInvoice.length}
              </span>
            </div>

            <div className="flex-1 divide-y divide-slate-200">
              {readyToInvoice.length === 0 ? (
                <div className="p-6 text-center text-xs text-slate-500">
                  All installed jobs have been invoiced.
                </div>
              ) : (
                readyToInvoice.map(({ job, customer }) => (
                  <div key={job.id} className="p-3.5 space-y-2.5">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <Link
                          href={`/projects/${job.id}`}
                          className="font-semibold text-xs text-slate-800 hover:text-[#186ade] hover:underline block truncate"
                        >
                          {job.title} (#{job.jobNumber ?? "Pending"})
                        </Link>
                        <div className="text-[11px] text-slate-500 mt-0.5">
                          {customer.name}
                        </div>
                      </div>
                      <span className="font-bold text-xs text-slate-800 tabular-nums shrink-0">
                        {formatCAD(job.totalCents)}
                      </span>
                    </div>
                    <DashboardInvoiceActions
                      jobId={job.id}
                      invoiceNumber={job.jobNumber ?? ""}
                      defaultEmail={customer.email || ""}
                      totalFormatted={formatCAD(job.totalCents)}
                    />
                  </div>
                ))
              )}
            </div>

            <div className="bg-[#f8fafc] border-t border-slate-200 px-4 py-2 text-right">
              <Link
                href="/billing"
                className="text-[11px] font-semibold text-[#186ade] hover:underline"
              >
                Open Billing &amp; Receivables →
              </Link>
            </div>
          </section>
        </div>

        {/* Full-Width Open Projects Data Grid */}
        <section
          id="open-projects"
          className="rounded-xs bg-white border border-slate-200 shadow-2xs overflow-hidden"
        >
          <div className="bg-[#f8fafc] border-b border-slate-200 px-5 py-3 flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-xs font-bold uppercase tracking-wider text-slate-700">
                Open Signed Projects ({openProjects.length})
              </h2>
              <p className="text-[11px] text-slate-500">
                Active contracts in production, installation, or receivables ({formatCAD(openProjectValueCents)} total)
              </p>
            </div>
            <Link
              href="/projects"
              className="text-xs font-semibold text-[#186ade] hover:underline"
            >
              Full Projects Spreadsheet →
            </Link>
          </div>

          {openProjects.length === 0 ? (
            <div className="p-8 text-center text-xs text-slate-500">No open projects.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-200 bg-white text-[11px] font-bold text-slate-500">
                    <th className="py-2.5 px-4 border-r border-slate-200">Job #</th>
                    <th className="py-2.5 px-4 border-r border-slate-200">Project Title</th>
                    <th className="py-2.5 px-4 border-r border-slate-200">Client</th>
                    <th className="py-2.5 px-4 border-r border-slate-200">Stage</th>
                    <th className="py-2.5 px-4 border-r border-slate-200">Install Date</th>
                    <th className="py-2.5 px-4 text-right">Contract Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {openProjects.map(({ job, customer }) => (
                    <tr key={job.id} className="hover:bg-blue-50/30 transition">
                      <td className="py-2.5 px-4 border-r border-slate-200 whitespace-nowrap tabular-nums font-bold text-[#186ade]">
                        <Link href={`/projects/${job.id}`} className="hover:underline">
                          {job.jobNumber ? `#${job.jobNumber}` : "Pending #"}
                        </Link>
                      </td>
                      <td className="py-2.5 px-4 border-r border-slate-200 font-semibold text-slate-800">
                        <Link href={`/projects/${job.id}`} className="hover:text-[#186ade] hover:underline">
                          {job.title}
                        </Link>
                      </td>
                      <td className="py-2.5 px-4 border-r border-slate-200 text-slate-600">
                        <Link href={`/customers/${customer.id}`} className="hover:text-[#186ade] hover:underline">
                          {customer.name}
                        </Link>
                      </td>
                      <td className="py-2.5 px-4 border-r border-slate-200 whitespace-nowrap">
                        <span
                          className={`text-[11px] font-semibold px-2 py-0.5 rounded-xs border ${
                            JOB_STAGE_STYLE[job.status] ?? "bg-slate-100 text-slate-700 border-slate-200"
                          }`}
                        >
                          {JOB_STAGE_LABEL[job.status] ?? job.status}
                        </span>
                      </td>
                      <td className="py-2.5 px-4 border-r border-slate-200 text-slate-600 tabular-nums whitespace-nowrap">
                        {job.scheduledDate || "Unscheduled"}
                      </td>
                      <td className="py-2.5 px-4 text-right font-bold text-slate-800 tabular-nums whitespace-nowrap">
                        {formatCAD(job.totalCents)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
