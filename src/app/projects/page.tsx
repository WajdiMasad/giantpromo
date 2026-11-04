import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { Filter, Plus, Search, Tag, X } from "lucide-react";
import { getDb } from "@/db";
import { customers, projects } from "@/db/schema";
import { formatCAD } from "@/lib/money";
import {
  PIPELINE,
  STAGE_LABEL,
  agoLabel,
  daysSince,
  isSigned,
  pipelineOf,
  projectRef,
  type PipelineKey,
} from "@/lib/project-status";

export const dynamic = "force-dynamic";

export default async function ProjectsPage(props: {
  searchParams: Promise<{ status?: string; q?: string; client?: string }>;
}) {
  const sp = await props.searchParams;
  const activeKey = (PIPELINE.find((p) => p.key === sp.status)?.key ?? null) as PipelineKey | null;
  const query = (sp.q ?? "").trim().toLowerCase();
  const clientQuery = (sp.client ?? "").trim().toLowerCase();

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
    if (clientQuery && !customer.name.toLowerCase().includes(clientQuery)) return false;
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

  const quoteTotalCents = rows.reduce((a, { project }) => a + project.totalCents, 0);
  const contractTotalCents = rows.reduce(
    (a, { project }) => a + (isSigned(project.status) ? project.totalCents : 0),
    0
  );
  const now = Date.now();

  const chipHref = (key: PipelineKey | null) => {
    const params = new URLSearchParams();
    if (key) params.set("status", key);
    if (sp.q) params.set("q", sp.q);
    if (sp.client) params.set("client", sp.client);
    const s = params.toString();
    return s ? `/projects?${s}` : "/projects";
  };

  const hasFilters = Boolean(activeKey || query || clientQuery);

  return (
    <div className="flex-1 flex flex-col min-h-0">
      {/* Goodshuffle Pro Top Bar with Connected 5-Chevron Pipeline */}
      <div className="bg-white border-b border-slate-200 px-6 py-2.5 flex flex-wrap items-center justify-between gap-4 shrink-0">
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-normal text-slate-600 tracking-tight">Projects</h1>
          {hasFilters && (
            <Link
              href="/projects"
              className="inline-flex items-center gap-1 text-xs font-medium text-[#186ade] hover:underline bg-blue-50/70 px-2 py-0.5 rounded-xs border border-blue-200"
            >
              <X className="w-3 h-3" /> Reset filters
            </Link>
          )}
        </div>

        {/* Interlocking 5-Stage Pipeline Chevron Bar */}
        <div className="flex items-center overflow-x-auto py-0.5">
          {PIPELINE.map((p, idx) => {
            const count = counts.get(p.key) ?? 0;
            const isSelected = activeKey === p.key;
            const isDimmed = activeKey !== null && !isSelected;
            const isFirst = idx === 0;
            const isLast = idx === PIPELINE.length - 1;

            const clipPath = isFirst
              ? "polygon(0% 0%, calc(100% - 10px) 0%, 100% 50%, calc(100% - 10px) 100%, 0% 100%)"
              : isLast
                ? "polygon(0% 0%, 100% 0%, 100% 100%, 0% 100%, 10px 50%)"
                : "polygon(0% 0%, calc(100% - 10px) 0%, 100% 50%, calc(100% - 10px) 100%, 0% 100%, 10px 50%)";

            return (
              <Link
                key={p.key}
                href={chipHref(isSelected ? null : p.key)}
                style={{
                  backgroundColor: p.chevronBg,
                  color: p.chevronText,
                  clipPath,
                  marginLeft: isFirst ? 0 : "-6px",
                  opacity: isDimmed ? 0.45 : 1,
                }}
                className={`relative px-5 py-1.5 min-w-[112px] text-center transition hover:brightness-95 select-none ${
                  isSelected ? "ring-2 ring-slate-900 z-10" : ""
                }`}
              >
                <div className="text-sm font-bold leading-none tabular-nums">{count}</div>
                <div className="text-[11px] font-medium leading-tight mt-0.5 whitespace-nowrap">
                  {p.label}
                </div>
              </Link>
            );
          })}
        </div>

        <div className="flex items-center gap-2">
          <Link
            href="/projects/new"
            className="inline-flex items-center gap-1.5 rounded-xs bg-[#186ade] hover:bg-[#1458b8] text-white font-semibold text-xs px-3.5 py-2 whitespace-nowrap shadow-2xs transition"
          >
            <Plus className="w-3.5 h-3.5 stroke-[2.5]" />
            New Project
          </Link>
        </div>
      </div>

      {/* Main Split Workspace: Left Filters Panel + Right Data Spreadsheet */}
      <div className="flex-1 flex flex-col lg:flex-row min-h-0">
        {/* Left Filter Sidebar */}
        <aside className="w-full lg:w-52 bg-white border-b lg:border-b-0 lg:border-r border-slate-200 p-3.5 space-y-4 shrink-0">
          <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
              <Filter className="w-3.5 h-3.5 text-slate-400" /> Filters
            </span>
            {hasFilters && (
              <Link href="/projects" className="text-xs text-[#186ade] hover:underline font-medium">
                Clear all
              </Link>
            )}
          </div>

          <form action="/projects" className="space-y-4">
            {activeKey && <input type="hidden" name="status" value={activeKey} />}

            <div>
              <label
                htmlFor="projects-search"
                className="block text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-1"
              >
                Project Name / Job #
              </label>
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                <input
                  id="projects-search"
                  name="q"
                  defaultValue={sp.q ?? ""}
                  placeholder="Title, #232015, Q-1001…"
                  className="w-full rounded-xs border border-slate-300 bg-white pl-8 pr-2.5 py-1.5 text-xs text-slate-800 focus:border-[#186ade] focus:outline-none"
                />
              </div>
            </div>

            <div>
              <label
                htmlFor="projects-client"
                className="block text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-1"
              >
                Client Name
              </label>
              <input
                id="projects-client"
                name="client"
                defaultValue={sp.client ?? ""}
                placeholder="Filter by client…"
                className="w-full rounded-xs border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-800 focus:border-[#186ade] focus:outline-none"
              />
            </div>

            <button
              type="submit"
              className="w-full rounded-xs bg-slate-100 hover:bg-slate-200 border border-slate-300 text-slate-700 font-semibold text-xs py-1.5 transition cursor-pointer"
            >
              Apply Search
            </button>
          </form>

          {/* Status Breakdown Filter List */}
          <div className="space-y-1.5 pt-2 border-t border-slate-100">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-2">
              Project Status
            </div>
            <Link
              href={chipHref(null)}
              className={`flex items-center justify-between px-2.5 py-1.5 rounded-xs text-xs transition ${
                !activeKey
                  ? "bg-blue-50 text-[#186ade] font-semibold"
                  : "text-slate-600 hover:bg-slate-50"
              }`}
            >
              <span>All Projects</span>
              <span className="tabular-nums text-slate-400 font-medium">{all.length}</span>
            </Link>
            {PIPELINE.map((p) => {
              const active = activeKey === p.key;
              return (
                <Link
                  key={p.key}
                  href={chipHref(active ? null : p.key)}
                  className={`flex items-center justify-between px-2.5 py-1.5 rounded-xs text-xs transition ${
                    active
                      ? "bg-blue-50 text-[#186ade] font-semibold"
                      : "text-slate-600 hover:bg-slate-50"
                  }`}
                >
                  <span className="flex items-center gap-2">
                    <Tag
                      className="w-3.5 h-3.5 shrink-0 fill-current"
                      style={{ color: p.tagColor }}
                    />
                    {p.label}
                  </span>
                  <span className="tabular-nums text-slate-400 font-medium">
                    {counts.get(p.key) ?? 0}
                  </span>
                </Link>
              );
            })}
          </div>
        </aside>

        {/* Right Spreadsheet Data Table */}
        <div className="flex-1 flex flex-col justify-between bg-white min-w-0">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-200 bg-[#f8fafc] text-[11px] font-bold text-slate-600 select-none">
                  <th className="py-2.5 px-3 border-r border-slate-200">Project Name</th>
                  <th className="py-2.5 px-3 border-r border-slate-200 text-right">Quote Total</th>
                  <th className="py-2.5 px-3 border-r border-slate-200 text-right">Contract Total</th>
                  <th className="py-2.5 px-3 border-r border-slate-200">Install Date</th>
                  <th className="py-2.5 px-3 border-r border-slate-200">Client Name</th>
                  <th className="py-2.5 px-3 border-r border-slate-200">Venue / Site</th>
                  <th className="py-2.5 px-3">Rep &amp; Activity</th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 && (
                  <tr>
                    <td colSpan={7} className="py-12 text-center text-xs text-slate-500">
                      No projects match your current filter criteria.
                    </td>
                  </tr>
                )}
                {rows.map(({ project, customer }) => {
                  const pk = PIPELINE.find((p) => p.key === pipelineOf(project.status))!;
                  const signed = isSigned(project.status);
                  const sentDays = daysSince(project.sentAt, now);
                  const viewedDays = daysSince(project.firstViewedAt, now);
                  const refLabel = projectRef(project);

                  return (
                    <tr
                      key={project.id}
                      className="border-b border-slate-200 hover:bg-blue-50/30 transition group"
                    >
                      {/* Project Name with Colored Tag Icon & inline (#Ref) */}
                      <td className="py-2.5 px-3 border-r border-slate-200">
                        <div className="flex items-start gap-2">
                          <Tag
                            className="w-3.5 h-3.5 shrink-0 mt-0.5 fill-current"
                            style={{ color: pk.tagColor }}
                          />
                          <div className="min-w-0">
                            <Link
                              href={`/projects/${project.id}`}
                              className="font-semibold text-slate-800 group-hover:text-[#186ade] hover:underline"
                            >
                              {project.title}{" "}
                              <span className="text-slate-500 font-normal tabular-nums whitespace-nowrap">
                                ({refLabel})
                              </span>
                            </Link>
                            <div className="flex flex-wrap items-center gap-1.5 mt-0.5 text-[11px] text-slate-400">
                              <span>{STAGE_LABEL[project.status] ?? pk.label}</span>
                              {project.poReference && <span>• PO {project.poReference}</span>}
                              {project.priority === "rush" && (
                                <span className="text-[10px] font-bold uppercase px-1.5 py-0.2 rounded-xs bg-rose-100 text-rose-700 border border-rose-200">
                                  Rush
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* Quote Total */}
                      <td className="py-2.5 px-3 border-r border-slate-200 text-right tabular-nums text-slate-700 whitespace-nowrap">
                        {formatCAD(project.totalCents)}
                      </td>

                      {/* Contract Total */}
                      <td className="py-2.5 px-3 border-r border-slate-200 text-right tabular-nums font-semibold text-slate-800 whitespace-nowrap">
                        {signed ? (
                          formatCAD(project.totalCents)
                        ) : (
                          <span className="text-slate-400 font-normal">$0.00</span>
                        )}
                      </td>

                      {/* Install Date */}
                      <td className="py-2.5 px-3 border-r border-slate-200 text-slate-700 tabular-nums whitespace-nowrap">
                        {project.scheduledDate || (
                          <span className="text-slate-400">Unscheduled</span>
                        )}
                      </td>

                      {/* Client Name */}
                      <td className="py-2.5 px-3 border-r border-slate-200">
                        <Link
                          href={`/customers/${customer.id}`}
                          className="font-medium text-slate-800 hover:text-[#186ade] hover:underline"
                        >
                          {customer.name}
                        </Link>
                        {customer.contactPerson && !customer.contactPerson.includes("@") && (
                          <div className="text-[11px] text-slate-400 truncate max-w-[160px]">
                            {customer.contactPerson}
                          </div>
                        )}
                      </td>

                      {/* Venue / Site */}
                      <td className="py-2.5 px-3 border-r border-slate-200 text-slate-600 max-w-[175px] truncate">
                        {project.siteAddress || customer.addressLine1 || "Halifax, NS"}
                      </td>

                      {/* Rep & Stage Activity */}
                      <td className="py-2.5 px-3 whitespace-nowrap text-slate-600">
                        <div className="flex items-center gap-2">
                          <span
                            title="Sales Lead: Wajdi (AJ) Masad"
                            className="w-5 h-5 rounded-full bg-slate-200 text-slate-700 font-bold text-[10px] flex items-center justify-center shrink-0"
                          >
                            AJ
                          </span>
                          <div>
                            {signed ? (
                              <span className="text-emerald-700 font-medium">
                                Signed ({project.approvedByName?.split(" ")[0] || "Client"})
                              </span>
                            ) : project.status === "quote_sent" ? (
                              <div>
                                <div>Sent {agoLabel(sentDays)}</div>
                                <div className="text-[10px] text-slate-400">
                                  {project.firstViewedAt
                                    ? `Viewed ${agoLabel(viewedDays)}`
                                    : "Unread"}
                                </div>
                              </div>
                            ) : project.status === "action_needed" ? (
                              <span className="text-rose-600 font-medium">
                                Changes requested
                              </span>
                            ) : project.status === "lost" ? (
                              <span className="text-slate-400">Lost</span>
                            ) : (
                              <span className="text-slate-400">Draft</span>
                            )}
                          </div>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Sticky Goodshuffle-style Bottom Totals Bar */}
          <div className="bg-[#f8fafc] border-t-2 border-slate-300 px-6 py-3 flex flex-wrap items-center justify-between gap-4 text-xs">
            <div className="text-slate-600 font-medium">
              Showing <strong className="text-slate-900 tabular-nums">{rows.length}</strong> of{" "}
              <span className="tabular-nums">{all.length}</span> projects
            </div>
            <div className="flex items-center gap-6 tabular-nums">
              <div>
                <span className="text-slate-500 uppercase tracking-wider text-[10px] font-bold mr-2">
                  Quote Total:
                </span>
                <strong className="text-slate-800 text-sm">{formatCAD(quoteTotalCents)}</strong>
              </div>
              <div>
                <span className="text-slate-500 uppercase tracking-wider text-[10px] font-bold mr-2">
                  Signed Contract Total:
                </span>
                <strong className="text-emerald-700 text-sm">
                  {formatCAD(contractTotalCents)}
                </strong>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
