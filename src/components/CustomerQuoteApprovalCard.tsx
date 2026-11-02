"use client";

import React, { useState, useTransition } from "react";
import Link from "next/link";
import { CheckCircle2, Copy, Mail, ShieldCheck } from "lucide-react";
import { approveQuoteAction } from "@/app/actions";

export function CustomerQuoteApprovalCard({
  publicToken,
  status,
  approvedByName,
  approvedAt,
  defaultSignerName,
  defaultSignerEmail,
  customerEmail,
  quoteNumber,
  jobNumber,
  jobId,
}: {
  publicToken: string;
  status: string;
  approvedByName: string | null;
  approvedAt: string | null;
  defaultSignerName: string;
  defaultSignerEmail: string;
  customerEmail: string;
  quoteNumber: string;
  jobNumber: string | null;
  jobId: number | null;
}) {
  const [signerName, setSignerName] = useState(defaultSignerName);
  const [signerEmail, setSignerEmail] = useState(defaultSignerEmail);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const shareUrl =
    typeof window !== "undefined" ? window.location.href : `/q/${publicToken}`;

  const gmailComposeUrl = `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(
    customerEmail
  )}&su=${encodeURIComponent(
    `Giant Promotions Quote ${quoteNumber} — Review & Approve Online`
  )}&body=${encodeURIComponent(
    `Hi ${defaultSignerName},\n\nYour quote (${quoteNumber}) from Giant Promotions is ready to view and approve online:\n${shareUrl}\n\nAs soon as you click Approve, our production & installation team will schedule your job.\n\nThank you,\nGiant Promotions Limited\n902-456-6487`
  )}`;

  if (status === "approved") {
    return (
      <div className="rounded-2xl bg-emerald-50 border-2 border-emerald-300 p-6 space-y-3">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-emerald-600 text-white flex items-center justify-center">
            <CheckCircle2 className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-emerald-950">
              Quote Approved & Scheduled
            </h2>
            <p className="text-xs text-emerald-800">
              Signed by <strong>{approvedByName}</strong>{" "}
              {approvedAt ? `on ${new Date(approvedAt).toLocaleString("en-CA")}` : ""}
            </p>
          </div>
        </div>

        <div className="rounded-xl bg-white p-4 border border-emerald-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="text-xs text-slate-700">
            Official Work Order / Sage Reference:{" "}
            <strong className="font-mono text-sm text-slate-950">
              {jobNumber ? `#${jobNumber}` : "⏳ Waiting for Sage number"}
            </strong>
          </div>
          {jobId && (
            <Link
              href={`/jobs/${jobId}`}
              className="text-xs font-semibold text-emerald-700 hover:underline"
            >
              Open Internal Job Record →
            </Link>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 pt-2">
      {/* Staff Share Bar (Copy Link or Send via Staff Google Workspace Gmail) */}
      <div className="rounded-2xl bg-slate-100 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="text-xs text-slate-600">
          <strong className="text-slate-900">Share with customer:</strong> send from your Google Workspace Gmail or copy the link.
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => {
              navigator.clipboard.writeText(window.location.href);
              setCopied(true);
              setTimeout(() => setCopied(false), 2000);
            }}
            className="inline-flex items-center gap-1.5 rounded-xl bg-white border border-slate-300 hover:bg-slate-50 text-slate-800 font-semibold text-xs px-3 py-2"
          >
            <Copy className="w-3.5 h-3.5" />
            {copied ? "Link Copied!" : "Copy Approval Link"}
          </button>
          <a
            href={gmailComposeUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-semibold text-xs px-3.5 py-2"
          >
            <Mail className="w-3.5 h-3.5 text-amber-400" />
            Send via Gmail
          </a>
        </div>
      </div>

      {/* Customer Signature Box */}
      <div className="rounded-2xl border-2 border-slate-900 p-6 space-y-4">
        <div className="flex items-center gap-2.5">
          <ShieldCheck className="w-5 h-5 text-amber-500" />
          <h2 className="text-base font-bold text-slate-900">
            Approve Quote Online
          </h2>
        </div>
        <p className="text-xs text-slate-600">
          By typing your name and clicking <strong>Approve Quote</strong>, you authorize Giant Promotions Limited to proceed with the work above. Your job will be created immediately.
        </p>

        {error && (
          <div className="rounded-xl bg-rose-50 border border-rose-200 text-rose-700 px-3.5 py-2 text-xs font-medium">
            {error}
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Your Full Name (Signature)
            </label>
            <input
              type="text"
              required
              value={signerName}
              onChange={(e) => setSignerName(e.target.value)}
              placeholder="Mark O'Regan"
              className="w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm font-medium text-slate-900"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Email Address
            </label>
            <input
              type="email"
              value={signerEmail}
              onChange={(e) => setSignerEmail(e.target.value)}
              placeholder="name@company.com"
              className="w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm text-slate-900"
            />
          </div>
        </div>

        <button
          type="button"
          disabled={isPending || !signerName.trim()}
          onClick={() => {
            setError(null);
            startTransition(async () => {
              const res = await approveQuoteAction({
                publicToken,
                approvedByName: signerName,
                approvedByEmail: signerEmail,
              });
              if (!res.ok) {
                setError(res.error);
              }
            });
          }}
          className="w-full rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-sm py-3.5 px-6 transition shadow-md disabled:opacity-50"
        >
          {isPending
            ? "Approving & Allocating Sage Master Number…"
            : "✓ Approve Quote & Schedule Job"}
        </button>
      </div>
    </div>
  );
}
