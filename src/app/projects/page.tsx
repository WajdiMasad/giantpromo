import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { Plus, Search } from "lucide-react";
import { getDb } from "@/db";
import { customers, projects } from "@/db/schema";
import { formatCAD } from "@/lib/money";
import {
  PIPELINE,
  STAGE_LABEL,
  STAGE_STYLE,
  agoLabel,
  daysSince,
  isSigned,
  pipelineOf,
  projectRef,
  type PipelineKey,
} from "@/lib/project-status";

export const dynamic = "force-dynamic";

export default async function ProjectsPage(props: {
  searchParams: Promise<{ status?: string; q?: string }>;
}) {
  const sp = await props.searchParams;
  const activeKey = (PIPELINE.find((p) => p.key === sp.status)?.key ?? null) as PipelineKey | null;
  const query = (sp.q ?? "").trim().toLowerCase();

  const db = await getDb();
  const all = await db
    .select({ project: projects, customer: customers })
    .from(projects)
    .innerJoin(customers, eq(projects.customerId, customers.id))
    .orderBy(desc(projects.id));

  const counts = new Map<PipelineKey, number>();
  for (const { project } of all) {
    const k = pipelineOf(project.status);
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }

  const rows = all.filter(({ project, customer }) => {
    if (activeKey && pipelineOf(project.status) !== activeKey) return false;
    if (!query) return true;
    return [
      project.title,
      project.quoteNumber,
      project.jobNumber ?? "",
      project.poReference ?? "",
      customer.name,
      project.siteAddress ?? "",
    ]
      .join(" ")
      .toLowerCase()
      .includes(query);
  });

  const totalCents = rows.reduce((a, { project }) => a + project.totalCents, 0);
  const now = Date.now();

  const chipHref = (key: PipelineKey | null) => {
    const params = new URLSearchParams();
    if (key) params.set("status", key);
    if (sp.q) params.set("q", sp.q);
    const s = params.toString();
    return s ? `/projects?${s}` : "/projects";
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Projects</h1>
          <p className="text-sm text-slate-600 mt-0.5">
            One record from first quote to paid. It gets its Sage job number the moment the customer signs.
          </p>
        </div>
        <Link
          href="/projects/new"
          className="inline-flex items-center gap-2 rounded-xl bg-slate-950 hover:bg-slate-800 text-white font-semibold text-sm px-4 py-2.5 whitespace-nowrap"
        >
          <Plus className="w-4 h-4 text-amber-400" />
          New Project
        </Link>
      </div>

      {/* Pipeline chips with counts */}
      <div className="flex flex-wrap items-center gap-2">
        <Link
          href={chipHref(null)}
          className={`inline-flex items-center gap-2 rounded-full border px-3.5 py-1.5 text-xs font-bold whitespace-nowrap ${
            !activeKey
              ? "bg-slate-900 text-white border-slate-900"
              : "bg-white text-slate-700 border-slate-300 hover:bg-slate-50"
          }`}
        >
          All <span className="opacity-70">{all.length}</span>
        </Link>
        {PIPELINE.map((p) => (
          <Link
            key={p.key}
            href={chipHref(p.key)}
            className={`inline-flex items-center gap-2 rounded-full border px-3.5 py-1.5 text-xs font-bold whitespace-nowrap ${
              activeKey === p.key ? "ring-2 ring-slate-900 " : ""
            }${p.chip}`}
          >
            <span className={`w-2 h-2 rounded-full ${p.dot}`} />
            {p.label} <span className="opacity-70">{counts.get(p.key) ?? 0}</span>
          </Link>
        ))}
      </div>

      {/* Search */}
      <form action="/projects" className="relative max-w-md">
        {activeKey && <input type="hidden" name="status" value={activeKey} />}
        <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
        <label htmlFor="projects-search" className="sr-only">
          Search projects
        </label>
        <input
          id="projects-search"
          name="q"
          defaultValue={sp.q ?? ""}
          placeholder="Search by project, customer, PO, job # or quote #…"
          className="w-full rounded-xl border border-slate-300 bg-white pl-10 pr-4 py-2.5 text-sm text-slate-900"
        />
      </form>

      <div className="rounded-2xl bg-white border border-slate-200/90 shadow-xs overflow-x-auto">
        <table className="w-full text-left border-collapse text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50/70 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
              <th className="py-3.5 px-4">Ref</th>
              <th className="py-3.5 px-4">Project &amp; customer</th>
              <th className="py-3.5 px-4">Status</th>
              <th className="py-3.5 px-4">Quote activity</th>
              <th className="py-3.5 px-4">Install date</th>
              <th className="py-3.5 px-4 text-right">Total</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.length === 0 && (
              <tr>
                <td colSpan={6} className="py-10 text-center text-sm text-slate-500">
                  No projects match.
                </td>
              </tr>
            )}
            {rows.map(({ project, customer }) => {
              const pk = PIPELINE.find((p) => p.key === pipelineOf(project.status))!;
              const signed = isSigned(project.status);
              const sentDays = daysSince(project.sentAt, now);
              const viewedDays = daysSince(project.firstViewedAt, now);
              return (
                <tr key={project.id} className="hover:bg-slate-50/80 transition">
                  <td className="py-3.5 px-4 whitespace-nowrap">
                    <Link
                      href={`/projects/${project.id}`}
                      className="font-mono text-xs font-bold px-2.5 py-1 rounded bg-slate-900 text-amber-400 hover:bg-slate-800 whitespace-nowrap"
                    >
                      {projectRef(project)}
                    </Link>
                    {project.jobNumber && (
                      <div className="text-[11px] text-slate-400 mt-1 font-mono">{project.quoteNumber}</div>
                    )}
                  </td>
                  <td className="py-3.5 px-4">
                    <div className="flex items-center gap-2">
                      <Link href={`/projects/${project.id}`} className="font-semibold text-slate-900 hover:text-amber-600">
                        {project.title}
                      </Link>
                      {project.priority === "rush" && (
                        <span className="text-[10px] font-black uppercase px-1.5 py-0.5 rounded bg-rose-600 text-white">
                          Rush
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-slate-500 mt-0.5">
                      {customer.name}
                      {project.poReference ? ` • PO ${project.poReference}` : ""}
                    </div>
                  </td>
                  <td className="py-3.5 px-4 whitespace-nowrap">
                    <span className={`inline-flex items-center gap-1.5 text-[11px] font-bold px-2.5 py-0.5 rounded-full border ${pk.chip}`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${pk.dot}`} />
                      {pk.label}
                    </span>
                    {signed && (
                      <div className="mt-1">
                        <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full border ${STAGE_STYLE[project.status] ?? ""}`}>
                          {STAGE_LABEL[project.status] ?? project.status}
                        </span>
                      </div>
                    )}
                  </td>
                  <td className="py-3.5 px-4 text-xs text-slate-600 whitespace-nowrap">
                    {signed ? (
                      <>Signed by {project.approvedByName}</>
                    ) : project.status === "quote_sent" ? (
                      <>
                        Sent {agoLabel(sentDays)}
                        <div className="text-slate-500">
                          {project.firstViewedAt ? `Opened ${agoLabel(viewedDays)}` : "Not opened yet"}
                        </div>
                      </>
                    ) : project.status === "action_needed" ? (
                      <span className="text-red-700 font-medium">{project.declineReason || "Client wants changes"}</span>
                    ) : project.status === "lost" ? (
                      <span className="text-slate-500">{project.declineReason}</span>
                    ) : (
                      <span className="text-slate-400">Not sent yet</span>
                    )}
                  </td>
                  <td className="py-3.5 px-4 text-xs text-slate-700 whitespace-nowrap">
                    {project.scheduledDate || "—"}
                  </td>
                  <td className="py-3.5 px-4 text-right font-bold text-slate-900 whitespace-nowrap">
                    {formatCAD(project.totalCents)}
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="bg-slate-50 border-t-2 border-slate-200 text-xs font-bold text-slate-900">
              <td colSpan={5} className="py-3 px-4 text-right uppercase tracking-wider text-slate-500">
                {rows.length} project{rows.length === 1 ? "" : "s"}
              </td>
              <td className="py-3 px-4 text-right whitespace-nowrap">{formatCAD(totalCents)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
