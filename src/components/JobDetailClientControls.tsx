"use client";

import React, { useState, useTransition } from "react";
import {
  Ban,
  Camera,
  CheckCircle2,
  Printer,
  RefreshCw,
  Send,
  Upload,
  UserCheck,
} from "lucide-react";
import {
  markSageInvoicePaidAction,
  retrySageAllocationAction,
  sendJobInvoiceAction,
  toggleAssignInstallerAction,
  updateJobStatusAction,
  uploadJobPhotoAction,
  voidJobInSageAction,
} from "@/app/actions";
import type { JobStatus } from "@/db/schema";

export function JobDetailClientControls({
  job,
  customerEmail,
  installers,
}: {
  job: {
    id: number;
    jobNumber: string | null;
    status: JobStatus;
    scheduledDate: string;
    sagePaymentStatus: string;
    sageSyncStatus: string;
    totalFormatted: string;
    invoiceSentAt: string | null;
    invoiceSentToEmail: string | null;
  };
  customerEmail: string;
  installers: { id: number; name: string; assigned: boolean }[];
}) {
  const [isPending, startTransition] = useTransition();
  const [recipientEmail, setRecipientEmail] = useState(customerEmail);
  const [voidReason, setVoidReason] = useState("");
  const [showVoidBox, setShowVoidBox] = useState(false);
  const [selectedFileName, setSelectedFileName] = useState<string>("");
  const [feedback, setFeedback] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const stages: { status: JobStatus; label: string }[] = [
    { status: "scheduled", label: "1. Scheduled" },
    { status: "in_progress", label: "2. In Progress" },
    { status: "installed", label: "3. Installed" },
    { status: "invoiced", label: "4. Invoiced" },
    { status: "paid", label: "5. Paid" },
  ];

  return (
    <div className="space-y-4 print:hidden">
      {feedback && (
        <div className="rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900 px-4 py-2.5 text-xs font-semibold">
          {feedback}
        </div>
      )}
      {error && (
        <div className="rounded-xl bg-rose-50 border border-rose-200 text-rose-800 px-4 py-2.5 text-xs font-semibold">
          {error}
        </div>
      )}

      {/* Stage Switcher + Send Sage Invoice Card */}
      <div className="rounded-2xl bg-white border border-slate-200/90 p-5 shadow-xs space-y-5">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-2">
            {stages.map((st) => {
              const active = job.status === st.status;
              return (
                <button
                  key={st.status}
                  type="button"
                  disabled={isPending || job.status === "cancelled"}
                  onClick={() => {
                    setError(null);
                    startTransition(async () => {
                      const res = await updateJobStatusAction({
                        jobId: job.id,
                        status: st.status,
                      });
                      if (!res.ok) setError(res.error);
                    });
                  }}
                  className={`rounded-xl px-3.5 py-2 text-xs font-semibold transition whitespace-nowrap cursor-pointer ${
                    active
                      ? "bg-slate-950 text-amber-400 shadow-xs"
                      : "bg-slate-100 hover:bg-slate-200 text-slate-700"
                  }`}
                >
                  {st.label}
                </button>
              );
            })}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => window.print()}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 font-semibold text-xs px-3 py-2 whitespace-nowrap cursor-pointer"
            >
              <Printer className="w-3.5 h-3.5" /> Print Work Order
            </button>

            {job.sageSyncStatus === "pending_number" && (
              <button
                type="button"
                disabled={isPending}
                onClick={() => {
                  setError(null);
                  startTransition(async () => {
                    const res = await retrySageAllocationAction(job.id);
                    if (!res.ok) setError(res.error);
                    else setFeedback(`Allocated Sage Invoice #${res.sageInvoiceNumber}!`);
                  });
                }}
                className="inline-flex items-center gap-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs px-3.5 py-2 whitespace-nowrap cursor-pointer"
              >
                <RefreshCw className="w-3.5 h-3.5" /> Allocate Sage Number Now
              </button>
            )}

            {job.jobNumber && job.sagePaymentStatus !== "PAID" && job.sagePaymentStatus !== "VOID" && (
              <button
                type="button"
                disabled={isPending}
                onClick={() => {
                  setError(null);
                  startTransition(async () => {
                    const res = await markSageInvoicePaidAction(job.jobNumber!);
                    if (!res.ok) setError(res.error);
                    else setFeedback(`Marked Sage Invoice #${job.jobNumber} as PAID.`);
                  });
                }}
                className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs px-3.5 py-2 whitespace-nowrap cursor-pointer"
              >
                <CheckCircle2 className="w-3.5 h-3.5" /> Mark Paid in Sage
              </button>
            )}

            {job.status !== "cancelled" && job.sagePaymentStatus !== "PAID" && (
              <button
                type="button"
                onClick={() => setShowVoidBox((v) => !v)}
                className="inline-flex items-center gap-1.5 rounded-xl border border-rose-200 bg-rose-50 hover:bg-rose-100 text-rose-700 font-semibold text-xs px-3 py-2 whitespace-nowrap cursor-pointer"
              >
                <Ban className="w-3.5 h-3.5" /> Cancel Job & Void in Sage
              </button>
            )}
          </div>
        </div>

        {/* Manual "Send Official Sage Invoice" Bar (§2b) */}
        {job.jobNumber && job.status !== "cancelled" && (
          <div className="rounded-xl bg-slate-50 border border-slate-200 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <div className="text-xs font-bold text-slate-900">
                Send Official Sage Invoice #{job.jobNumber} ({job.totalFormatted})
              </div>
              <div className="text-[11px] text-slate-600">
                Per your rule, the invoice is created at approval but only sent when you click Send.
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <label htmlFor="job-invoice-email" className="sr-only">
                Recipient Email
              </label>
              <input
                id="job-invoice-email"
                name="recipientEmail"
                type="email"
                value={recipientEmail}
                onChange={(e) => setRecipientEmail(e.target.value)}
                placeholder="customer@email.com"
                className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-900 w-56"
              />
              <button
                type="button"
                disabled={isPending}
                onClick={() => {
                  setError(null);
                  startTransition(async () => {
                    const res = await sendJobInvoiceAction({
                      jobId: job.id,
                      recipientEmail,
                    });
                    if (!res.ok) setError(res.error);
                    else
                      setFeedback(
                        `Official Sage Invoice #${res.invoiceNumber} emailed to ${res.email}!`
                      );
                  });
                }}
                className="inline-flex items-center gap-1.5 rounded-xl bg-slate-950 hover:bg-slate-800 text-white font-semibold text-xs px-4 py-2 whitespace-nowrap cursor-pointer"
              >
                <Send className="w-3.5 h-3.5 text-amber-400" />
                {job.invoiceSentAt ? "Resend Sage Invoice" : "Send Sage Invoice"}
              </button>
            </div>
          </div>
        )}

        {/* Void Confirmation Box (§2a) */}
        {showVoidBox && (
          <div className="rounded-xl bg-rose-50 border border-rose-200 p-4 space-y-3">
            <div className="text-xs font-bold text-rose-900">
              Void Sage Invoice #{job.jobNumber ?? "Pending"} (Preserves sequential numbering with no gaps)
            </div>
            <div className="flex flex-col sm:flex-row gap-2">
              <label htmlFor="void-reason-input" className="sr-only">
                Reason for voiding
              </label>
              <input
                id="void-reason-input"
                name="voidReason"
                type="text"
                value={voidReason}
                onChange={(e) => setVoidReason(e.target.value)}
                placeholder="Reason for voiding (required for audit log)…"
                className="flex-1 rounded-lg border border-rose-300 bg-white px-3 py-2 text-xs text-slate-900"
              />
              <button
                type="button"
                disabled={isPending || !voidReason.trim()}
                onClick={() => {
                  setError(null);
                  startTransition(async () => {
                    const res = await voidJobInSageAction({
                      jobId: job.id,
                      reason: voidReason,
                    });
                    if (!res.ok) setError(res.error);
                    else {
                      setShowVoidBox(false);
                      setFeedback("Job cancelled and marked VOID in Sage.");
                    }
                  });
                }}
                className="rounded-lg bg-rose-600 hover:bg-rose-700 text-white font-semibold text-xs px-4 py-2 disabled:opacity-50 whitespace-nowrap cursor-pointer"
              >
                Confirm VOID in Sage
              </button>
            </div>
          </div>
        )}

        {/* Crew Assignment + Styled Proof/Photo Upload Bar */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2 border-t border-slate-100">
          <div>
            <div className="text-xs font-bold text-slate-800 mb-2 flex items-center gap-1.5">
              <UserCheck className="w-3.5 h-3.5 text-amber-600" /> Assigned Installers
            </div>
            <div className="flex flex-wrap gap-2">
              {installers.map((inst) => (
                <button
                  key={inst.id}
                  type="button"
                  disabled={isPending}
                  onClick={() => {
                    startTransition(async () => {
                      await toggleAssignInstallerAction({
                        jobId: job.id,
                        installerUserId: inst.id,
                      });
                    });
                  }}
                  className={`rounded-lg px-3 py-1.5 text-xs font-semibold border transition cursor-pointer ${
                    inst.assigned
                      ? "bg-amber-50 border-amber-400 text-amber-950"
                      : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"
                  }`}
                >
                  {inst.assigned ? "✓ " : "+ "}
                  {inst.name}
                </button>
              ))}
            </div>
          </div>

          <div>
            <div className="text-xs font-bold text-slate-800 mb-2 flex items-center gap-1.5">
              <Camera className="w-3.5 h-3.5 text-amber-600" /> + Upload Proof / Photo (Mirrored to Drive)
            </div>
            <form
              action={async (fd) => {
                setError(null);
                const res = await uploadJobPhotoAction(fd);
                if (!res.ok) setError(res.error);
                else {
                  setSelectedFileName("");
                  setFeedback("File saved and mirrored to Google Drive!");
                }
              }}
              className="flex flex-wrap items-center gap-2"
            >
              <input type="hidden" name="jobId" value={job.id} />
              <label htmlFor="upload-file-kind" className="sr-only">
                File Category
              </label>
              <select
                id="upload-file-kind"
                name="kind"
                aria-label="File category"
                className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-800 font-medium"
              >
                <option value="install_photo">Install Photo</option>
                <option value="before_photo">Before Photo</option>
                <option value="after_photo">After Photo</option>
                <option value="proof">Customer Proof</option>
                <option value="artwork">Print Artwork</option>
              </select>
              <label
                htmlFor="job-photo-file-input"
                className="inline-flex items-center gap-1.5 rounded-lg border border-dashed border-slate-300 bg-slate-50 hover:bg-slate-100 text-slate-700 font-semibold text-xs px-3 py-1.5 cursor-pointer max-w-[200px] truncate"
              >
                <Upload className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                <span className="truncate">
                  {selectedFileName || "Choose Image / PDF…"}
                </span>
              </label>
              <input
                id="job-photo-file-input"
                type="file"
                name="file"
                accept="image/*,.pdf"
                required
                onChange={(e) =>
                  setSelectedFileName(e.target.files?.[0]?.name || "")
                }
                className="sr-only"
              />
              <button
                type="submit"
                className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white font-semibold text-xs px-3.5 py-1.5 cursor-pointer whitespace-nowrap"
              >
                Upload
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
