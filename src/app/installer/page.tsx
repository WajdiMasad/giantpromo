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
    if (!["approved", "scheduled", "in_progress", "installed"].includes(job.status)) {
      return false;
    }
    if (user?.role === "installer") {
      const assignedIds = allAssignments
        .filter((a) => a.jobId === job.id)
        .map((a) => a.userId);
      return assignedIds.length === 0 || assignedIds.includes(user.id);
    }
    return true;
  });

  const statusWeight = (status: string, priority: string) => {
    if (status === "in_progress") return priority === "rush" ? 0 : 1;
    if (status === "scheduled" || status === "approved") return priority === "rush" ? 2 : 3;
    return 10;
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
    <div className="flex-1 flex flex-col min-h-0">
      <div className="bg-white border-b border-slate-200 px-6 h-16 flex items-center justify-between gap-4 shrink-0">
        <div className="flex items-center gap-3">
          <HardHat className="w-5 h-5 text-[#186ade]" />
          <h1 className="text-xl font-normal text-slate-600 tracking-tight">
            Crew Schedule &amp; Field Dispatch
          </h1>
        </div>
        <div className="text-xs font-semibold text-slate-600 tabular-nums">
          Dispatch Date: {today}
        </div>
      </div>

      <div className="p-6 max-w-4xl w-full mx-auto space-y-6">
        <div className="space-y-3">
          <h2 className="text-xs font-bold uppercase tracking-wider text-slate-600">
            Today&apos;s Installations ({todayJobs.length})
          </h2>
          {todayJobs.length === 0 ? (
            <div className="rounded-xs bg-white border border-slate-200 p-6 text-center text-xs text-slate-500">
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

        <div className="space-y-3 pt-2">
          <h2 className="text-xs font-bold uppercase tracking-wider text-slate-600">
            Upcoming &amp; Scheduled ({upcomingJobs.length})
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
    </div>
  );
}
