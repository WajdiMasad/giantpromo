"use client";

import React, { useState, useTransition } from "react";
import {
  Ban,
  Banknote,
  Camera,
  CheckCircle2,
  Printer,
  Send,
  Upload,
  UserCheck,
} from "lucide-react";
import {
  recordPaymentAction,
  sendJobInvoiceAction,
  toggleAssignInstallerAction,
  updateJobStatusAction,
  uploadJobPhotoAction,
  voidJobAction,
} from "@/app/actions";
import type { JobStatus, PaymentMethod } from "@/db/schema";

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
    paymentStatus: string;
    invoiceId: number | null;
    invoiceStatus: "draft" | "issued" | "void" | null;
    totalFormatted: string;
    balanceCents: number;
    balanceFormatted: string;
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
  const [showPayBox, setShowPayBox] = useState(false);
  const [payAmount, setPayAmount] = useState((job.balanceCents / 100).toFixed(2));
  const [payDate, setPayDate] = useState(new Date().toISOString().slice(0, 10));
  const [payMethod, setPayMethod] = useState<PaymentMethod>("etransfer");
  const [payRef, setPayRef] = useState("");
  const [selectedFileName, setSelectedFileName] = useState<string>("");
  const [feedback, setFeedback] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const stages: { status: JobStatus; label: string }[] = [
    { status: "scheduled", label: "1. Scheduled" },
    { status: "in_progress", label: "2. In Progress" },
    { status: "installed", label: "3. Installed" },
  ];
  const billingStages: { key: string; label: string; done: boolean }[] = [
    {
      key: "invoiced",
      label: "4. Invoiced",
      done: ["invoiced", "paid"].includes(job.status) || job.invoiceStatus === "issued",
    },
    { key: "paid", label: "5. Paid", done: job.paymentStatus === "paid" },
  ];
  const cancelled = job.status === "cancelled";
  const canTakePayment = job.invoiceStatus === "issued" && job.balanceCents > 0;

  return (
    <div className="space-y-3 print:hidden">
      {feedback && (
        <div className="rounded-xs bg-emerald-50 border border-emerald-200 text-emerald-900 px-4 py-2 text-xs font-semibold">
          {feedback}
        </div>
      )}
      {error && (
        <div className="rounded-xs bg-rose-50 border border-rose-200 text-rose-800 px-4 py-2 text-xs font-semibold">
          {error}
        </div>
      )}

      <div className="rounded-xs bg-white border border-slate-200 p-4 shadow-2xs space-y-4">
        {/* Production stages + billing progress + quick actions */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-1.5">
            {stages.map((st) => {
              const active = job.status === st.status;
              return (
                <button
                  key={st.status}
                  type="button"
                  disabled={isPending || cancelled || ["invoiced", "paid"].includes(job.status)}
                  onClick={() => {
                    setError(null);
                    startTransition(async () => {
                      const res = await updateJobStatusAction({ jobId: job.id, status: st.status });
                      if (!res.ok) setError(res.error);
                    });
                  }}
                  className={`rounded-xs px-3 py-1.5 text-xs font-semibold transition whitespace-nowrap cursor-pointer disabled:cursor-default ${
                    active
                      ? "bg-[#186ade] text-white shadow-2xs"
                      : "bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200"
                  }`}
                >
                  {st.label}
                </button>
              );
            })}
            {billingStages.map((st) => (
              <span
                key={st.key}
                className={`rounded-xs px-3 py-1.5 text-xs font-semibold whitespace-nowrap border ${
                  st.done
                    ? "bg-emerald-50 text-emerald-800 border-emerald-200"
                    : "bg-slate-50 text-slate-400 border-slate-200"
                }`}
              >
                {st.done ? "✓ " : ""}
                {st.label}
              </span>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => window.print()}
              className="inline-flex items-center gap-1.5 rounded-xs border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 font-semibold text-xs px-3 py-1.5 whitespace-nowrap cursor-pointer"
            >
              <Printer className="w-3.5 h-3.5 text-slate-500" /> Print Work Order
            </button>
            {canTakePayment && (
              <button
                type="button"
                onClick={() => setShowPayBox((v) => !v)}
                className="inline-flex items-center gap-1.5 rounded-xs bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs px-3 py-1.5 whitespace-nowrap cursor-pointer shadow-2xs"
              >
                <Banknote className="w-3.5 h-3.5" /> Record Payment
              </button>
            )}
            {!cancelled && job.paymentStatus !== "paid" && (
              <button
                type="button"
                onClick={() => setShowVoidBox((v) => !v)}
                className="inline-flex items-center gap-1.5 rounded-xs border border-rose-200 bg-rose-50 hover:bg-rose-100 text-rose-700 font-semibold text-xs px-3 py-1.5 whitespace-nowrap cursor-pointer"
              >
                <Ban className="w-3.5 h-3.5" /> Void Job
              </button>
            )}
          </div>
        </div>

        {/* Send invoice bar */}
        {job.jobNumber && !cancelled && (
          <div className="rounded-xs bg-[#f8fafc] border border-slate-200 p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <div className="text-xs font-bold text-slate-800 tabular-nums">
                Invoice #{job.jobNumber} • {job.totalFormatted}
                {job.invoiceStatus === "issued" && (
                  <span className="ml-2 font-semibold text-slate-500">
                    (Balance Due: {job.balanceFormatted})
                  </span>
                )}
              </div>
              <div className="text-[11px] text-slate-500 mt-0.5">
                {job.invoiceStatus === "draft"
                  ? "Draft status — Invoice date is stamped when you send to customer."
                  : job.invoiceSentAt
                    ? `Issued & sent to ${job.invoiceSentToEmail} on ${new Date(job.invoiceSentAt).toLocaleDateString("en-CA")}.`
                    : ""}
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <label htmlFor="job-invoice-email" className="sr-only">
                Recipient email
              </label>
              <input
                id="job-invoice-email"
                name="recipientEmail"
                type="email"
                value={recipientEmail}
                onChange={(e) => setRecipientEmail(e.target.value)}
                placeholder="customer@email.com"
                className="rounded-xs border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-900 w-56 focus:border-[#186ade] focus:outline-none"
              />
              <button
                type="button"
                disabled={isPending}
                onClick={() => {
                  setError(null);
                  startTransition(async () => {
                    const res = await sendJobInvoiceAction({ jobId: job.id, recipientEmail });
                    if (!res.ok) setError(res.error);
                    else setFeedback(`Invoice #${res.invoiceNumber} sent to ${res.email}.`);
                  });
                }}
                className="inline-flex items-center gap-1.5 rounded-xs bg-[#186ade] hover:bg-[#1458b8] text-white font-semibold text-xs px-3.5 py-1.5 whitespace-nowrap cursor-pointer shadow-2xs"
              >
                <Send className="w-3.5 h-3.5" />
                {job.invoiceStatus === "issued" ? "Resend Invoice" : "Send Invoice"}
              </button>
            </div>
          </div>
        )}

        {/* Record a payment */}
        {showPayBox && canTakePayment && (
          <div className="rounded-xs bg-emerald-50/70 border border-emerald-200 p-3.5 space-y-3">
            <div className="text-xs font-bold text-emerald-900">
              Record payment for Invoice #{job.jobNumber} (Balance: {job.balanceFormatted})
            </div>
            <div className="grid grid-cols-2 lg:grid-cols-5 gap-2">
              <div>
                <label htmlFor="pay-amount" className="block text-[11px] font-semibold text-slate-700 mb-0.5">
                  Amount ($)
                </label>
                <input
                  id="pay-amount"
                  value={payAmount}
                  onChange={(e) => setPayAmount(e.target.value)}
                  className="w-full rounded-xs border border-slate-300 bg-white px-2.5 py-1.5 text-xs tabular-nums text-slate-900"
                />
              </div>
              <div>
                <label htmlFor="pay-date" className="block text-[11px] font-semibold text-slate-700 mb-0.5">
                  Date Received
                </label>
                <input
                  id="pay-date"
                  type="date"
                  value={payDate}
                  onChange={(e) => setPayDate(e.target.value)}
                  className="w-full rounded-xs border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-900"
                />
              </div>
              <div>
                <label htmlFor="pay-method" className="block text-[11px] font-semibold text-slate-700 mb-0.5">
                  Method
                </label>
                <select
                  id="pay-method"
                  value={payMethod}
                  onChange={(e) => setPayMethod(e.target.value as PaymentMethod)}
                  className="w-full rounded-xs border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-900"
                >
                  <option value="etransfer">e-Transfer</option>
                  <option value="cheque">Cheque</option>
                  <option value="cash">Cash</option>
                  <option value="card">Card</option>
                  <option value="other">Other</option>
                </select>
              </div>
              <div className="col-span-2 lg:col-span-1">
                <label htmlFor="pay-ref" className="block text-[11px] font-semibold text-slate-700 mb-0.5">
                  Reference
                </label>
                <input
                  id="pay-ref"
                  value={payRef}
                  onChange={(e) => setPayRef(e.target.value)}
                  placeholder="Cheque # / Ref"
                  className="w-full rounded-xs border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-900"
                />
              </div>
              <div className="flex items-end">
                <button
                  type="button"
                  disabled={isPending}
                  onClick={() => {
                    setError(null);
                    startTransition(async () => {
                      const res = await recordPaymentAction({
                        invoiceId: job.invoiceId!,
                        amountDollars: payAmount,
                        receivedOn: payDate,
                        method: payMethod,
                        reference: payRef,
                      });
                      if (!res.ok) setError(res.error);
                      else {
                        setShowPayBox(false);
                        setFeedback("Payment recorded.");
                      }
                    });
                  }}
                  className="w-full inline-flex items-center justify-center gap-1.5 rounded-xs bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs px-3 py-1.5 disabled:opacity-50 cursor-pointer"
                >
                  <CheckCircle2 className="w-3.5 h-3.5" /> Save Payment
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Void */}
        {showVoidBox && (
          <div className="rounded-xs bg-rose-50 border border-rose-200 p-3.5 space-y-2.5">
            <div className="text-xs font-bold text-rose-900">
              Void Invoice #{job.jobNumber ?? "—"}. Keeps number on record as VOID so sequence remains unbroken.
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
                placeholder="Reason for voiding (required)…"
                className="flex-1 rounded-xs border border-rose-300 bg-white px-3 py-1.5 text-xs text-slate-900"
              />
              <button
                type="button"
                disabled={isPending || !voidReason.trim()}
                onClick={() => {
                  setError(null);
                  startTransition(async () => {
                    const res = await voidJobAction({ jobId: job.id, reason: voidReason });
                    if (!res.ok) setError(res.error);
                    else {
                      setShowVoidBox(false);
                      setFeedback("Job cancelled and invoice voided.");
                    }
                  });
                }}
                className="rounded-xs bg-rose-600 hover:bg-rose-700 text-white font-semibold text-xs px-4 py-1.5 disabled:opacity-50 whitespace-nowrap cursor-pointer"
              >
                Confirm Void
              </button>
            </div>
          </div>
        )}

        {/* Crew assignment + file upload */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-3 border-t border-slate-100">
          <div>
            <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-2 flex items-center gap-1.5">
              <UserCheck className="w-3.5 h-3.5 text-[#186ade]" /> Assigned Installation Crew
            </div>
            <div className="flex flex-wrap gap-1.5">
              {installers.map((inst) => (
                <button
                  key={inst.id}
                  type="button"
                  disabled={isPending}
                  onClick={() => {
                    startTransition(async () => {
                      await toggleAssignInstallerAction({ jobId: job.id, installerUserId: inst.id });
                    });
                  }}
                  className={`rounded-xs px-2.5 py-1 text-xs font-semibold border transition cursor-pointer ${
                    inst.assigned
                      ? "bg-blue-50 border-[#186ade] text-[#186ade]"
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
            <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-2 flex items-center gap-1.5">
              <Camera className="w-3.5 h-3.5 text-[#186ade]" /> Attach Proof / Install Photo
            </div>
            <form
              action={async (fd) => {
                setError(null);
                const res = await uploadJobPhotoAction(fd);
                if (!res.ok) setError(res.error);
                else {
                  setSelectedFileName("");
                  setFeedback("File attached to job record.");
                }
              }}
              className="flex flex-wrap items-center gap-2"
            >
              <input type="hidden" name="jobId" value={job.id} />
              <label htmlFor="upload-file-kind" className="sr-only">
                File category
              </label>
              <select
                id="upload-file-kind"
                name="kind"
                className="rounded-xs border border-slate-300 bg-white px-2.5 py-1 text-xs text-slate-800 font-medium"
              >
                <option value="install_photo">Install Photo</option>
                <option value="before_photo">Before Photo</option>
                <option value="after_photo">After Photo</option>
                <option value="proof">Customer Proof</option>
                <option value="artwork">Print Artwork</option>
              </select>
              <label
                htmlFor="job-photo-file-input"
                className="inline-flex items-center gap-1.5 rounded-xs border border-dashed border-slate-300 bg-slate-50 hover:bg-slate-100 text-slate-700 font-medium text-xs px-2.5 py-1 cursor-pointer max-w-[180px] truncate"
              >
                <Upload className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                <span className="truncate">{selectedFileName || "Select file…"}</span>
              </label>
              <input
                id="job-photo-file-input"
                type="file"
                name="file"
                accept="image/*,.pdf"
                required
                onChange={(e) => setSelectedFileName(e.target.files?.[0]?.name || "")}
                className="sr-only"
              />
              <button
                type="submit"
                className="rounded-xs bg-slate-800 hover:bg-slate-700 text-white font-semibold text-xs px-3 py-1 cursor-pointer whitespace-nowrap"
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
