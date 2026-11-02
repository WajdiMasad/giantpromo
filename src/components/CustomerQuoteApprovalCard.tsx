"use client";

import React, { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { ArrowLeft, CheckCircle2, Copy, Mail, Printer, ShieldCheck } from "lucide-react";
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
  // Never pre-fill legal signature name with an email address
  const cleanInitialName = defaultSignerName.includes("@") ? "" : defaultSignerName;
  const [signerName, setSignerName] = useState(cleanInitialName);
  const [signerEmail, setSignerEmail] = useState(defaultSignerEmail);
  const [shareUrl, setShareUrl] = useState(`http://localhost:3000/q/${publicToken}`);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setShareUrl(window.location.href);
  }, [publicToken]);

  const greetingName = cleanInitialName || "there";
  const gmailComposeUrl = `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(
    customerEmail
  )}&su=${encodeURIComponent(
    `Giant Promotions Quote ${quoteNumber} — Review & Approve Online`
  )}&body=${encodeURIComponent(
    `Hi ${greetingName},\n\nYour quote (${quoteNumber}) from Giant Promotions is ready to view and approve online:\n${shareUrl}\n\nAs soon as you click Approve, our production & installation team will schedule your job.\n\nThank you,\nGiant Promotions Limited\n902-456-6487`
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
              className="text-xs font-semibold text-emerald-700 hover:underline whitespace-nowrap"
            >
              Open Internal Job Record →
            </Link>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5 pt-2">
      {/* Staff Toolbar (Hidden when printing) */}
      <div className="rounded-2xl bg-slate-900 text-slate-100 p-4 flex flex-col md:flex-row md:items-center justify-between gap-3 print:hidden">
        <div className="flex items-center gap-3 text-xs">
          <Link
            href="/quotes"
            className="inline-flex items-center gap-1 text-amber-400 hover:text-amber-300 font-semibold whitespace-nowrap"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            All Quotes
          </Link>
          <span className="text-slate-600">|</span>
          <span className="text-slate-300">
            <strong className="text-white">Staff Share Bar:</strong> Copy link or send via Workspace Gmail
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex items-center gap-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold text-xs px-3 py-2 whitespace-nowrap transition"
          >
            <Printer className="w-3.5 h-3.5" />
            Print / PDF
          </button>
          <button
            type="button"
            onClick={() => {
              navigator.clipboard.writeText(window.location.href);
              setCopied(true);
              setTimeout(() => setCopied(false), 2000);
            }}
            className="inline-flex items-center gap-1.5 rounded-xl bg-white hover:bg-slate-100 text-slate-900 font-semibold text-xs px-3 py-2 whitespace-nowrap transition"
          >
            <Copy className="w-3.5 h-3.5" />
            {copied ? "✓ Link Copied!" : "Copy Approval Link"}
          </button>
          <a
            href={gmailComposeUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs px-3.5 py-2 whitespace-nowrap transition"
          >
            <Mail className="w-3.5 h-3.5" />
            Send via Gmail
          </a>
        </div>
      </div>

      {/* Customer Signature Box */}
      <div className="rounded-2xl border-2 border-slate-900 p-6 space-y-4 bg-white">
        <div className="flex items-center justify-between gap-2.5">
          <div className="flex items-center gap-2.5">
            <ShieldCheck className="w-5 h-5 text-amber-500 shrink-0" />
            <h2 className="text-base font-bold text-slate-900">
              Customer Authorization & Digital Signature
            </h2>
          </div>
          <span className="text-[11px] font-semibold uppercase tracking-wider px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 whitespace-nowrap">
            Instant Scheduling
          </span>
        </div>
        <p className="text-xs text-slate-600 leading-relaxed">
          By typing your full name and clicking <strong>Approve Quote & Schedule Job</strong>, you authorize Giant Promotions Limited to proceed with the scope and pricing above.
        </p>

        {error && (
          <div className="rounded-xl bg-rose-50 border border-rose-200 text-rose-700 px-3.5 py-2 text-xs font-medium">
            {error}
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label
              htmlFor="quote-signer-name"
              className="block text-xs font-semibold text-slate-700 mb-1"
            >
              Your Full Name (Legal Signature) *
            </label>
            <input
              id="quote-signer-name"
              name="signerName"
              type="text"
              required
              value={signerName}
              onChange={(e) => setSignerName(e.target.value)}
              placeholder="e.g. David MacKay"
              className="w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm font-medium text-slate-900 focus:outline-none focus:border-slate-900"
            />
          </div>
          <div>
            <label
              htmlFor="quote-signer-email"
              className="block text-xs font-semibold text-slate-700 mb-1"
            >
              Confirmation Email Address
            </label>
            <input
              id="quote-signer-email"
              name="signerEmail"
              type="email"
              value={signerEmail}
              onChange={(e) => setSignerEmail(e.target.value)}
              placeholder="name@company.com"
              className="w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm text-slate-900 focus:outline-none focus:border-slate-900"
            />
          </div>
        </div>

        {/* Live Digital Signature Preview */}
        <div className="rounded-xl bg-slate-50 border border-dashed border-slate-300 px-4 py-3 flex items-center justify-between">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
            Electronic Signature
          </span>
          <span className="font-serif italic text-xl text-slate-800 tracking-wide">
            {signerName.trim() || "Type your name above to sign…"}
          </span>
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
          className="w-full rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-sm py-3.5 px-6 transition shadow-md disabled:opacity-50 cursor-pointer"
        >
          {isPending
            ? "Approving & Allocating Sage Master Number…"
            : "✓ Approve Quote & Schedule Job"}
        </button>
      </div>
    </div>
  );
}
