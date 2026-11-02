import { asc, eq } from "drizzle-orm";
import { HardHat } from "lucide-react";
import { getDb } from "@/db";
import { customers, jobAssignments, jobFiles, jobItems, jobs } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth";
import { InstallerJobCard } from "@/components/InstallerJobCard";

export const dynamic = "force-dynamic";

export default async function InstallerPortalPage() {
  const db = await getDb();
  const user = await getCurrentUser();

  const allRows = await db
    .select({
      job: jobs,
      customer: customers,
    })
    .from(jobs)
    .innerJoin(customers, eq(jobs.customerId, customers.id))
    .orderBy(asc(jobs.scheduledDate));

  const allAssignments = await db.select().from(jobAssignments);
  const allItems = await db.select().from(jobItems);
  const allFiles = await db.select().from(jobFiles);

  const activeRows = allRows.filter(({ job }) => {
    if (job.status === "cancelled" || job.status === "paid" || job.status === "invoiced") {
      return false;
    }
    if (user?.role === "installer") {
      const assignedIds = allAssignments
        .filter((a) => a.jobId === job.id)
        .map((a) => a.userId);
      // Show if assigned to this installer (or if unassigned so crew leads can pick it up)
      return assignedIds.length === 0 || assignedIds.includes(user.id);
    }
    return true;
  });

  // Sort active & rush jobs above already-installed jobs
  const statusWeight = (status: string, priority: string) => {
    if (status === "in_progress") return priority === "rush" ? 0 : 1;
    if (status === "scheduled" || status === "approved") return priority === "rush" ? 2 : 3;
    return 10; // installed jobs go below active installs
  };

  const today = new Date().toISOString().slice(0, 10);
  const todayJobs = activeRows
    .filter(({ job }) => job.scheduledDate === today)
    .sort(
      (a, b) =>
        statusWeight(a.job.status, a.job.priority) -
        statusWeight(b.job.status, b.job.priority)
    );
  const upcomingJobs = activeRows
    .filter(({ job }) => job.scheduledDate !== today)
    .sort(
      (a, b) =>
        statusWeight(a.job.status, a.job.priority) -
        statusWeight(b.job.status, b.job.priority)
    );

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="rounded-3xl bg-slate-950 text-white p-5 sm:p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3.5">
          <div className="h-12 w-12 rounded-2xl bg-amber-500 text-slate-950 flex items-center justify-center shrink-0">
            <HardHat className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-xl font-bold">Installer Field View (PWA)</h1>
            <p className="text-xs text-slate-400">
              {user?.name} • Tap address for turn-by-turn directions, upload install photos & mark complete
            </p>
          </div>
        </div>
        <div className="flex sm:flex-col items-center sm:items-end justify-between border-t sm:border-t-0 border-slate-800 pt-2.5 sm:pt-0">
          <div className="text-xs text-slate-400">Today&apos;s Dispatch</div>
          <div className="font-mono text-sm font-bold text-amber-400 whitespace-nowrap">
            {today}
          </div>
        </div>
      </div>

      {/* Today's Schedule */}
      <div className="space-y-3">
        <h2 className="text-sm font-bold uppercase tracking-wider text-slate-600 px-1">
          Today&apos;s Installs ({todayJobs.length})
        </h2>
        {todayJobs.length === 0 ? (
          <div className="rounded-2xl bg-white border border-slate-200 p-6 text-center text-sm text-slate-500">
            No jobs scheduled for today ({today}).
          </div>
        ) : (
          todayJobs.map(({ job, customer }) => (
            <InstallerJobCard
              key={job.id}
              job={job}
              customer={customer}
              items={allItems.filter((i) => i.jobId === job.id)}
              photoCount={allFiles.filter((f) => f.jobId === job.id).length}
            />
          ))
        )}
      </div>

      {/* Upcoming Schedule */}
      <div className="space-y-3 pt-2">
        <h2 className="text-sm font-bold uppercase tracking-wider text-slate-600 px-1">
          Upcoming & Scheduled ({upcomingJobs.length})
        </h2>
        {upcomingJobs.map(({ job, customer }) => (
          <InstallerJobCard
            key={job.id}
            job={job}
            customer={customer}
            items={allItems.filter((i) => i.jobId === job.id)}
            photoCount={allFiles.filter((f) => f.jobId === job.id).length}
          />
        ))}
      </div>
    </div>
  );
}
