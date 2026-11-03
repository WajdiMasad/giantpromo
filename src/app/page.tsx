import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { AlertCircle, ExternalLink, HardHat, Plus, Send } from "lucide-react";
import { getDb } from "@/db";
import { customers, projects } from "@/db/schema";
import { isSigned, isUnsignedQuote } from "@/lib/project-status";
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
  return `${days} days ago`;
}

const JOB_STAGE_LABEL: Record<string, string> = {
  approved: "Approved • not scheduled",
  scheduled: "Scheduled",
  in_progress: "In progress",
  installed: "Installed • invoice not sent",
  invoiced: "Invoiced • awaiting payment",
};

const JOB_STAGE_STYLE: Record<string, string> = {
  approved: "bg-slate-100 text-slate-700 border-slate-200",
  scheduled: "bg-blue-50 text-blue-700 border-blue-200",
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
        r.when === "overdue" ? 0 : r.job.status === "in_progress" ? 1 : r.when === "today" ? 2 : r.job.priority === "rush" ? 3 : 4;
      return weight(a) - weight(b);
    });
  const installLater = toInstall.filter((r) => !installNow.includes(r));

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
      // viewed-but-undecided first (hottest), then oldest sent first
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
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900">
            Today
          </h1>
          <p className="text-sm text-slate-600 mt-1">
            {new Date().toLocaleDateString("en-CA", {
              weekday: "long",
              month: "long",
              day: "numeric",
            })}{" "}
            • Next invoice #{nextInvoiceNumber}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2.5">
          <Link
            href="/installer"
            className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-slate-800 font-semibold text-sm px-4 py-2.5 whitespace-nowrap"
          >
            <HardHat className="w-4 h-4 text-amber-600" />
            Installer View
          </Link>
          <Link
            href="/projects/new"
            className="inline-flex items-center gap-2 rounded-xl bg-slate-950 hover:bg-slate-800 text-white font-semibold text-sm px-4 py-2.5 whitespace-nowrap"
          >
            <Plus className="w-4 h-4 text-amber-400" />
            New Quote
          </Link>
        </div>
      </div>

      {/* Summary strip */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <a
          href="#install-now"
          className="rounded-2xl bg-white border border-slate-200 hover:border-amber-400 p-4 transition"
        >
          <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">
            Need installing now
          </div>
          <div className="text-3xl font-black text-slate-900 mt-1">{installNow.length}</div>
          <div className="text-xs text-slate-500 mt-0.5">
            {toInstall.length} not yet installed in total
          </div>
        </a>
        <a
          href="#open-projects"
          className="rounded-2xl bg-white border border-slate-200 hover:border-amber-400 p-4 transition"
        >
          <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">
            Open projects
          </div>
          <div className="text-3xl font-black text-slate-900 mt-1">{openProjects.length}</div>
          <div className="text-xs text-slate-500 mt-0.5">
            {formatCAD(openProjectValueCents)} incl. tax
          </div>
        </a>
        <a
          href="#quotes-waiting"
          className="rounded-2xl bg-white border border-slate-200 hover:border-amber-400 p-4 transition"
        >
          <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">
            Quotes awaiting an answer
          </div>
          <div className="text-3xl font-black text-slate-900 mt-1">{awaiting.length}</div>
          <div className="text-xs text-slate-500 mt-0.5">
            {formatCAD(awaitingValueCents)} incl. tax
          </div>
        </a>
      </div>

      {/* Installed but not invoiced */}
      {readyToInvoice.length > 0 && (
        <div className="rounded-2xl bg-amber-50 border-2 border-amber-300 p-5">
          <div className="flex items-center gap-2 text-sm font-bold text-slate-900">
            <Send className="w-4 h-4 text-amber-600" />
            {readyToInvoice.length} installed job{readyToInvoice.length > 1 ? "s" : ""} ready to invoice
          </div>
          <div className="mt-3 divide-y divide-amber-200 bg-white rounded-xl border border-amber-200 overflow-hidden">
            {readyToInvoice.map(({ job, customer }) => (
              <div
                key={job.id}
                className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
              >
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs font-bold px-2 py-0.5 rounded bg-slate-900 text-amber-400">
                      #{job.jobNumber ?? "Pending"}
                    </span>
                    <Link href={`/projects/${job.id}`} className="font-semibold text-sm text-slate-900 hover:underline">
                      {job.title}
                    </Link>
                  </div>
                  <div className="text-xs text-slate-600 mt-1">
                    {customer.name} • {formatCAD(job.totalCents)}
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

      {/* 1. Need installing now */}
      <section id="install-now" className="scroll-mt-6 space-y-3">
        <div className="flex items-end justify-between">
          <div>
            <h2 className="text-lg font-bold text-slate-900">Need installing now</h2>
            <p className="text-xs text-slate-500">
              Overdue, scheduled today, in progress, rush, or still missing an install date.
            </p>
          </div>
          <Link href="/projects" className="text-xs font-semibold text-slate-700 hover:text-slate-950">
            All jobs →
          </Link>
        </div>

        {installNow.length === 0 ? (
          <div className="rounded-2xl bg-white border border-slate-200 p-6 text-center text-sm text-slate-500">
            Nothing needs installing right now.
          </div>
        ) : (
          <div className="rounded-2xl bg-white border border-slate-200 divide-y divide-slate-100 overflow-hidden">
            {installNow.map(({ job, customer, when }) => (
              <Link
                key={job.id}
                href={`/projects/${job.id}`}
                className="p-4 flex items-center justify-between gap-4 hover:bg-slate-50 transition"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-xs font-bold px-2 py-0.5 rounded bg-slate-900 text-amber-400 whitespace-nowrap">
                      {job.jobNumber ? `#${job.jobNumber}` : "Pending"}
                    </span>
                    {job.priority === "rush" && (
                      <span className="text-[11px] font-black uppercase px-2 py-0.5 rounded bg-rose-600 text-white">
                        Rush
                      </span>
                    )}
                    {when === "overdue" && (
                      <span className="inline-flex items-center gap-1 text-[11px] font-bold uppercase px-2 py-0.5 rounded-full bg-rose-50 text-rose-700 border border-rose-200 whitespace-nowrap">
                        <AlertCircle className="w-3 h-3" /> Overdue
                      </span>
                    )}
                    {when === "today" && (
                      <span className="text-[11px] font-bold uppercase px-2 py-0.5 rounded-full bg-amber-100 text-amber-900 border border-amber-300 whitespace-nowrap">
                        Today
                      </span>
                    )}
                    {when === "unscheduled" && (
                      <span className="text-[11px] font-bold uppercase px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 border border-slate-300 whitespace-nowrap">
                        Needs a date
                      </span>
                    )}
                    {job.status === "in_progress" && (
                      <span className="text-[11px] font-bold uppercase px-2 py-0.5 rounded-full bg-amber-50 text-amber-800 border border-amber-200 whitespace-nowrap">
                        In progress
                      </span>
                    )}
                  </div>
                  <div className="font-semibold text-sm text-slate-900 mt-1.5 truncate">
                    {job.title}
                  </div>
                  <div className="text-xs text-slate-500 mt-0.5 truncate">
                    {customer.name} • {job.siteAddress || "No site address"}
                  </div>
                </div>
                <div className="text-right shrink-0 text-xs">
                  <div className="font-semibold text-slate-900 whitespace-nowrap">
                    {job.scheduledDate || "No date"}
                  </div>
                  <div className="text-slate-500">{formatCAD(job.totalCents)}</div>
                </div>
              </Link>
            ))}
          </div>
        )}

        {installLater.length > 0 && (
          <p className="text-xs text-slate-500">
            Plus {installLater.length} more scheduled for later dates (see Open projects).
          </p>
        )}
      </section>

      {/* 2. Open projects */}
      <section id="open-projects" className="scroll-mt-6 space-y-3">
        <div className="flex items-end justify-between">
          <div>
            <h2 className="text-lg font-bold text-slate-900">Open projects</h2>
            <p className="text-xs text-slate-500">
              Every job that isn&apos;t paid or cancelled yet, with where it&apos;s stuck.
            </p>
          </div>
          <Link href="/projects" className="text-xs font-semibold text-slate-700 hover:text-slate-950">
            Jobs board →
          </Link>
        </div>

        {openProjects.length === 0 ? (
          <div className="rounded-2xl bg-white border border-slate-200 p-6 text-center text-sm text-slate-500">
            No open projects.
          </div>
        ) : (
          <div className="rounded-2xl bg-white border border-slate-200 overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/70 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                  <th className="py-3 px-4">Job #</th>
                  <th className="py-3 px-4">Customer &amp; project</th>
                  <th className="py-3 px-4">Stage</th>
                  <th className="py-3 px-4">Install date</th>
                  <th className="py-3 px-4 text-right">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {openProjects.map(({ job, customer }) => (
                  <tr key={job.id} className="hover:bg-slate-50/80">
                    <td className="py-3 px-4 whitespace-nowrap">
                      <Link
                        href={`/projects/${job.id}`}
                        className="font-mono text-xs font-bold px-2 py-0.5 rounded bg-slate-900 text-amber-400"
                      >
                        {job.jobNumber ? `#${job.jobNumber}` : "⏳ Pending"}
                      </Link>
                    </td>
                    <td className="py-3 px-4">
                      <Link href={`/projects/${job.id}`} className="font-semibold text-slate-900 hover:text-amber-600">
                        {job.title}
                      </Link>
                      <div className="text-xs text-slate-500">{customer.name}</div>
                    </td>
                    <td className="py-3 px-4 whitespace-nowrap">
                      <span
                        className={`text-[11px] font-semibold px-2.5 py-0.5 rounded-full border ${
                          JOB_STAGE_STYLE[job.status] ?? "bg-slate-100 text-slate-700 border-slate-200"
                        }`}
                      >
                        {JOB_STAGE_LABEL[job.status] ?? job.status}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-xs text-slate-600 whitespace-nowrap">
                      {job.scheduledDate || "—"}
                    </td>
                    <td className="py-3 px-4 text-right font-semibold text-slate-900 whitespace-nowrap">
                      {formatCAD(job.totalCents)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* 3. Quotes awaiting an answer */}
      <section id="quotes-waiting" className="scroll-mt-6 space-y-3">
        <div className="flex items-end justify-between">
          <div>
            <h2 className="text-lg font-bold text-slate-900">Quotes awaiting an answer</h2>
            <p className="text-xs text-slate-500">
              Not approved and not declined. Opened-but-undecided quotes are listed first.
            </p>
          </div>
          <Link href="/projects?status=quote_sent" className="text-xs font-semibold text-slate-700 hover:text-slate-950">
            All quotes →
          </Link>
        </div>

        {awaiting.length === 0 ? (
          <div className="rounded-2xl bg-white border border-slate-200 p-6 text-center text-sm text-slate-500">
            Every quote has been answered.
          </div>
        ) : (
          <div className="rounded-2xl bg-white border border-slate-200 divide-y divide-slate-100 overflow-hidden">
            {awaiting.map(({ quote, customer }) => {
              const sentDays = daysAgo(quote.sentAt, nowMs);
              const viewedDays = daysAgo(quote.firstViewedAt, nowMs);
              const expired = quote.validUntil && quote.validUntil < today;
              return (
                <div
                  key={quote.id}
                  className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-xs font-bold text-slate-700 bg-slate-100 px-2 py-0.5 rounded">
                        {quote.quoteNumber}
                      </span>
                      {quote.status === "action_needed" ? (
                        <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-red-50 text-red-700 border border-red-200 whitespace-nowrap">
                          Client asked for changes
                        </span>
                      ) : quote.firstViewedAt ? (
                        <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-amber-50 text-amber-800 border border-amber-200 whitespace-nowrap">
                          Customer opened it {dayLabel(viewedDays)}
                        </span>
                      ) : quote.status === "quote_sent" ? (
                        <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200 whitespace-nowrap">
                          Sent {dayLabel(sentDays)} • not opened
                        </span>
                      ) : (
                        <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 border border-slate-200 whitespace-nowrap">
                          Draft • not sent
                        </span>
                      )}
                      {expired && (
                        <span className="text-[11px] font-bold uppercase px-2 py-0.5 rounded-full bg-rose-50 text-rose-700 border border-rose-200 whitespace-nowrap">
                          Past valid date
                        </span>
                      )}
                    </div>
                    <div className="font-semibold text-sm text-slate-900 mt-1.5 truncate">
                      {quote.title}
                    </div>
                    <div className="text-xs text-slate-500 mt-0.5 truncate">{customer.name}</div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="font-bold text-sm text-slate-900 mr-1 whitespace-nowrap">
                      {formatCAD(quote.totalCents)}
                    </span>
                    <CopyQuoteLinkButton publicToken={quote.publicToken} />
                    <Link
                      href={`/projects/${quote.id}`}
                      className="inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-800 font-semibold text-xs px-3 py-1.5 whitespace-nowrap"
                    >
                      Open <ExternalLink className="w-3.5 h-3.5 text-amber-600" />
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
