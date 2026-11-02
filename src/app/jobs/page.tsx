import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import {
  CheckCircle2,
  Clock,
  FolderOpen,
  HardHat,
  MapPin,
  Plus,
  Send,
} from "lucide-react";
import { getDb } from "@/db";
import { customers, jobAssignments, jobs, users } from "@/db/schema";
import { formatCAD } from "@/lib/money";

export const dynamic = "force-dynamic";

export default async function JobsPage() {
  const db = await getDb();

  const rows = await db
    .select({
      job: jobs,
      customer: customers,
    })
    .from(jobs)
    .innerJoin(customers, eq(jobs.customerId, customers.id))
    .orderBy(desc(jobs.id));

  const assignments = await db
    .select({
      jobId: jobAssignments.jobId,
      userName: users.name,
    })
    .from(jobAssignments)
    .innerJoin(users, eq(jobAssignments.userId, users.id));

  const columns: { key: string; label: string; accent: string }[] = [
    { key: "scheduled", label: "Scheduled", accent: "border-t-blue-500" },
    { key: "in_progress", label: "In Progress", accent: "border-t-amber-500" },
    { key: "installed", label: "Installed • Ready to Invoice", accent: "border-t-emerald-500" },
    { key: "invoiced", label: "Invoiced (Sent)", accent: "border-t-purple-500" },
    { key: "paid", label: "Paid", accent: "border-t-slate-700" },
  ];

  const statusBadgeClass = (status: string) => {
    switch (status) {
      case "installed":
        return "bg-emerald-50 text-emerald-800 border border-emerald-200";
      case "in_progress":
        return "bg-amber-50 text-amber-800 border border-amber-200";
      case "scheduled":
      case "approved":
        return "bg-blue-50 text-blue-800 border border-blue-200";
      case "invoiced":
        return "bg-purple-50 text-purple-800 border border-purple-200";
      case "paid":
        return "bg-slate-900 text-emerald-300";
      default:
        return "bg-slate-100 text-slate-700";
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">
            Jobs & Sage Master Invoices
          </h1>
          <p className="text-sm text-slate-600 mt-0.5">
            Every job number is its official Sage invoice number (232013+). Invoices go out only when you click Send.
          </p>
        </div>

        <Link
          href="/quotes/new"
          className="inline-flex items-center gap-2 rounded-xl bg-slate-950 hover:bg-slate-800 text-white font-semibold text-sm px-4 py-2.5 transition whitespace-nowrap"
        >
          <Plus className="w-4 h-4 text-amber-400" />
          New Quote → Job
        </Link>
      </div>

      {/* Kanban Pipeline Overview */}
      <div className="grid grid-cols-1 md:grid-cols-3 xl:grid-cols-5 gap-3.5">
        {columns.map((col) => {
          const colJobs = rows.filter(({ job }) =>
            col.key === "scheduled"
              ? job.status === "scheduled" || job.status === "approved"
              : job.status === col.key
          );
          return (
            <div
              key={col.key}
              className={`rounded-2xl bg-slate-100/90 border border-slate-200/80 border-t-4 ${col.accent} p-3 space-y-2.5`}
            >
              <div className="flex items-center justify-between gap-2 px-1">
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-700">
                  {col.label}
                </span>
                <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-white text-slate-700 border border-slate-200 shrink-0">
                  {colJobs.length}
                </span>
              </div>

              <div className="space-y-2.5">
                {colJobs.map(({ job, customer }) => {
                  const crew = assignments
                    .filter((a) => a.jobId === job.id)
                    .map((a) => a.userName.split(" ")[0]);
                  return (
                    <Link
                      key={job.id}
                      href={`/jobs/${job.id}`}
                      className="block rounded-xl bg-white p-3.5 border border-slate-200/90 hover:border-amber-400 shadow-2xs transition space-y-2"
                    >
                      <div className="flex items-center justify-between gap-1.5">
                        <div className="flex items-center gap-1.5">
                          <span className="font-mono text-xs font-bold px-2 py-0.5 rounded bg-slate-900 text-amber-400 whitespace-nowrap">
                            {job.jobNumber ? `#${job.jobNumber}` : "⏳ Pending"}
                          </span>
                          {job.priority === "rush" && (
                            <span className="text-[10px] font-black uppercase px-1.5 py-0.5 rounded bg-rose-600 text-white whitespace-nowrap">
                              RUSH
                            </span>
                          )}
                        </div>
                        <span className="text-xs font-bold text-slate-900 whitespace-nowrap">
                          {formatCAD(job.totalCents)}
                        </span>
                      </div>
                      <div className="font-semibold text-xs text-slate-900 line-clamp-2">
                        {job.title}
                      </div>
                      <div className="text-[11px] text-slate-500 truncate">
                        {customer.name}
                      </div>
                      {crew.length > 0 && (
                        <div className="flex items-center gap-1 text-[11px] text-slate-600 font-medium">
                          <HardHat className="w-3 h-3 text-amber-600 shrink-0" />
                          <span>Crew: {crew.join(", ")}</span>
                        </div>
                      )}
                      <div className="flex items-center justify-between text-[11px] text-slate-500 pt-1.5 border-t border-slate-100">
                        <span>{job.scheduledDate || "TBD"}</span>
                        {job.status === "installed" && !job.invoiceSentAt ? (
                          <span className="text-amber-700 font-semibold inline-flex items-center gap-1 whitespace-nowrap">
                            <Send className="w-3 h-3" /> Ready to Send
                          </span>
                        ) : job.invoiceSentAt ? (
                          <span className="text-emerald-700 font-medium inline-flex items-center gap-1 whitespace-nowrap">
                            <CheckCircle2 className="w-3 h-3" /> Sent
                          </span>
                        ) : null}
                      </div>
                    </Link>
                  );
                })}
                {colJobs.length === 0 && (
                  <div className="text-center py-6 text-xs text-slate-400">
                    No jobs in stage
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Full Master Table */}
      <div className="rounded-2xl bg-white border border-slate-200/90 shadow-xs overflow-hidden">
        <div className="p-4 border-b border-slate-100">
          <h2 className="text-sm font-bold text-slate-900">
            All Jobs & Sage Invoice Ledger
          </h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/70 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                <th className="py-3 px-4">Sage / Job #</th>
                <th className="py-3 px-4">Customer & Project</th>
                <th className="py-3 px-4">Install Date</th>
                <th className="py-3 px-4">Job Status</th>
                <th className="py-3 px-4">Sage Invoice Status</th>
                <th className="py-3 px-4">Drive Folder</th>
                <th className="py-3 px-4 text-right">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map(({ job, customer }) => (
                <tr key={job.id} className="hover:bg-slate-50/80 transition">
                  <td className="py-3.5 px-4 whitespace-nowrap">
                    <Link
                      href={`/jobs/${job.id}`}
                      className="font-mono text-xs font-bold px-2.5 py-1 rounded bg-slate-900 text-amber-400 hover:bg-slate-800 whitespace-nowrap"
                    >
                      {job.jobNumber ? `#${job.jobNumber}` : "⏳ Pending"}
                    </Link>
                  </td>
                  <td className="py-3.5 px-4">
                    <div className="flex items-center gap-2">
                      <Link
                        href={`/jobs/${job.id}`}
                        className="font-semibold text-slate-900 hover:text-amber-600"
                      >
                        {job.title}
                      </Link>
                      {job.priority === "rush" && (
                        <span className="text-[10px] font-black uppercase px-1.5 py-0.5 rounded bg-rose-100 text-rose-700 whitespace-nowrap">
                          RUSH
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-slate-500 flex items-center gap-2 mt-0.5">
                      <span>{customer.name}</span>
                      {job.siteAddress && (
                        <span className="inline-flex items-center gap-0.5 text-slate-400">
                          <MapPin className="w-3 h-3" /> {job.siteProvince}
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="py-3.5 px-4 text-xs text-slate-700 whitespace-nowrap">
                    {job.scheduledDate || "—"}
                  </td>
                  <td className="py-3.5 px-4 whitespace-nowrap">
                    <span
                      className={`inline-block text-xs font-semibold uppercase px-2.5 py-0.5 rounded-full whitespace-nowrap ${statusBadgeClass(
                        job.status
                      )}`}
                    >
                      {job.status.replace("_", " ")}
                    </span>
                  </td>
                  <td className="py-3.5 px-4 text-xs whitespace-nowrap">
                    {job.sagePaymentStatus === "PAID" ? (
                      <span className="inline-flex items-center gap-1 font-semibold text-emerald-700">
                        <CheckCircle2 className="w-3.5 h-3.5" /> PAID
                      </span>
                    ) : job.sagePaymentStatus === "VOID" ? (
                      <span className="font-semibold text-slate-400 line-through">
                        VOID ({job.voidReason})
                      </span>
                    ) : job.invoiceSentAt ? (
                      <span className="text-purple-700 font-medium">
                        Sent to {job.invoiceSentToEmail}
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-amber-700 font-medium">
                        <Clock className="w-3.5 h-3.5" /> Created (Unsent)
                      </span>
                    )}
                  </td>
                  <td className="py-3.5 px-4 text-xs whitespace-nowrap">
                    {job.driveFolderUrl ? (
                      <span className="inline-flex items-center gap-1 text-slate-600">
                        <FolderOpen className="w-3.5 h-3.5 text-amber-500" />
                        Invoice {job.jobNumber}
                      </span>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="py-3.5 px-4 text-right font-bold text-slate-900 whitespace-nowrap">
                    {formatCAD(job.totalCents)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
