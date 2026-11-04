import type { ProjectStatus } from "@/db/schema";

/** The five pipeline chips shown at the top of the Projects list (like Goodshuffle). */
export type PipelineKey = "new" | "quote_sent" | "action_needed" | "signed" | "lost";

export const PIPELINE: {
  key: PipelineKey;
  label: string;
  chip: string; // tailwind classes for the chip/badge
  dot: string;
  chevronBg: string; // Goodshuffle Pro pipeline chevron fill
  chevronText: string;
  tagColor: string; // Goodshuffle Pro tag icon color
}[] = [
  {
    key: "new",
    label: "New",
    chip: "bg-amber-50 text-amber-900 border-amber-300",
    dot: "bg-amber-400",
    chevronBg: "#f5c438",
    chevronText: "#1e293b",
    tagColor: "#eab308",
  },
  {
    key: "quote_sent",
    label: "Quote Sent",
    chip: "bg-sky-50 text-sky-800 border-sky-300",
    dot: "bg-sky-500",
    chevronBg: "#2b7fff",
    chevronText: "#ffffff",
    tagColor: "#2563eb",
  },
  {
    key: "action_needed",
    label: "Action Needed",
    chip: "bg-rose-50 text-rose-800 border-rose-300",
    dot: "bg-rose-500",
    chevronBg: "#e04a3f",
    chevronText: "#ffffff",
    tagColor: "#dc2626",
  },
  {
    key: "signed",
    label: "Signed",
    chip: "bg-emerald-50 text-emerald-800 border-emerald-300",
    dot: "bg-emerald-500",
    chevronBg: "#1ca67a",
    chevronText: "#ffffff",
    tagColor: "#10b981",
  },
  {
    key: "lost",
    label: "Lost",
    chip: "bg-slate-100 text-slate-700 border-slate-300",
    dot: "bg-slate-500",
    chevronBg: "#323a46",
    chevronText: "#ffffff",
    tagColor: "#64748b",
  },
];

export function pipelineOf(status: ProjectStatus): PipelineKey {
  switch (status) {
    case "new":
      return "new";
    case "quote_sent":
      return "quote_sent";
    case "action_needed":
      return "action_needed";
    case "lost":
    case "cancelled":
      return "lost";
    default:
      return "signed";
  }
}

export const isSigned = (status: ProjectStatus) => pipelineOf(status) === "signed";
export const isUnsignedQuote = (status: ProjectStatus) =>
  status === "new" || status === "quote_sent" || status === "action_needed";

/** Where a signed project is in production and billing. */
export const STAGE_LABEL: Record<string, string> = {
  approved: "Signed • not scheduled",
  scheduled: "Scheduled",
  in_progress: "In progress",
  installed: "Installed",
  invoiced: "Invoiced",
  paid: "Paid",
  cancelled: "Cancelled",
  lost: "Lost",
  new: "Draft",
  quote_sent: "Awaiting client",
  action_needed: "Client wants changes",
};

export const STAGE_STYLE: Record<string, string> = {
  approved: "bg-slate-100 text-slate-700 border-slate-200",
  scheduled: "bg-blue-50 text-blue-700 border-blue-200",
  in_progress: "bg-amber-50 text-amber-800 border-amber-200",
  installed: "bg-emerald-50 text-emerald-700 border-emerald-200",
  invoiced: "bg-purple-50 text-purple-700 border-purple-200",
  paid: "bg-emerald-100 text-emerald-800 border-emerald-300",
  cancelled: "bg-slate-100 text-slate-500 border-slate-200",
  lost: "bg-slate-100 text-slate-500 border-slate-200",
  new: "bg-yellow-50 text-yellow-800 border-yellow-200",
  quote_sent: "bg-blue-50 text-blue-700 border-blue-200",
  action_needed: "bg-red-50 text-red-700 border-red-200",
};

/** What identifies the project to staff: the Sage job number once signed, else the Q-number. */
export function projectRef(p: { jobNumber: string | null; quoteNumber: string; status: ProjectStatus }) {
  if (p.jobNumber) return `#${p.jobNumber}`;
  if (isSigned(p.status)) return "Pending #";
  return p.quoteNumber;
}

export function daysSince(d: Date | string | null | undefined, nowMs = Date.now()): number | null {
  if (!d) return null;
  return Math.floor((nowMs - new Date(d).getTime()) / 86_400_000);
}

export function agoLabel(days: number | null): string {
  if (days === null) return "";
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  return `${days} days ago`;
}
