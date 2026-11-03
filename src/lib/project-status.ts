import type { ProjectStatus } from "@/db/schema";

/** The five pipeline chips shown at the top of the Projects list (like Goodshuffle). */
export type PipelineKey = "new" | "quote_sent" | "action_needed" | "signed" | "lost";

export const PIPELINE: {
  key: PipelineKey;
  label: string;
  chip: string; // tailwind classes for the chip/badge
  dot: string;
}[] = [
  { key: "new", label: "New", chip: "bg-yellow-50 text-yellow-800 border-yellow-300", dot: "bg-yellow-400" },
  { key: "quote_sent", label: "Quote Sent", chip: "bg-blue-50 text-blue-800 border-blue-300", dot: "bg-blue-500" },
  { key: "action_needed", label: "Action Needed", chip: "bg-red-50 text-red-800 border-red-300", dot: "bg-red-500" },
  { key: "signed", label: "Signed", chip: "bg-emerald-50 text-emerald-800 border-emerald-300", dot: "bg-emerald-500" },
  { key: "lost", label: "Lost / Cancelled", chip: "bg-slate-100 text-slate-700 border-slate-300", dot: "bg-slate-500" },
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
  if (isSigned(p.status)) return "⏳ Waiting for Sage #";
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
