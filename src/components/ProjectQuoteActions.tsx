"use client";

import React, { useState, useTransition } from "react";
import Link from "next/link";
import { CheckCircle2, Copy, ExternalLink, Send, XCircle, PenLine, Mail } from "lucide-react";
import {
  approveQuoteAction,
  markProjectLostAction,
  sendQuoteToClientAction,
} from "@/app/actions";

export function ProjectQuoteActions({
  projectId,
  publicToken,
  status,
  sentAt,
  customerContact,
  customerEmail,
  quoteNumber,
  title,
}: {
  projectId: number;
  publicToken: string;
  status: string;
  sentAt: string | null;
  customerContact: string;
  customerEmail: string;
  quoteNumber: string;
  title: string;
}) {
  const [isPending, startTransition] = useTransition();
  const [copied, setCopied] = useState(false);
  const [mode, setMode] = useState<null | "lost" | "sign">(null);
  const [reason, setReason] = useState("");
  const [signer, setSigner] = useState(customerContact.includes("@") ? "" : customerContact);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  const isResend = status === "quote_sent" || status === "action_needed";

  return (
    <div className="rounded-xs bg-white border border-slate-200 p-4 shadow-2xs space-y-3 print:hidden">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        <div>
          <div className="text-xs font-bold uppercase tracking-wider text-slate-700">
            {status === "new"
              ? "Proposal Workflow — Draft Quote"
              : status === "action_needed"
                ? "Proposal Workflow — Client Requested Revisions"
                : "Proposal Workflow — Sent & Awaiting Signature"}
          </div>
          <div className="text-xs text-slate-500 mt-0.5">
            {status === "new"
              ? "Send proposal link to customer for online review and e-signature."
              : sentAt
                ? `Last sent ${new Date(sentAt).toLocaleString("en-CA")}.`
                : ""}{" "}
            Master job number is assigned automatically upon signature.
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={isPending}
            onClick={() => {
              setError(null);
              startTransition(async () => {
                const res = await sendQuoteToClientAction(projectId);
                if (!res.ok) setError(res.error);
                else setFeedback("Marked as sent. Share the client portal link or email via Gmail.");
              });
            }}
            className="inline-flex items-center gap-1.5 rounded-xs bg-[#186ade] hover:bg-[#1458b8] text-white font-semibold text-xs px-3.5 py-2 whitespace-nowrap cursor-pointer shadow-2xs transition"
          >
            <Send className="w-3.5 h-3.5" />
            {isResend ? "Resend Proposal" : "Send Proposal"}
          </button>
          <button
            type="button"
            onClick={() => {
              navigator.clipboard.writeText(`${window.location.origin}/q/${publicToken}`);
              setCopied(true);
              setTimeout(() => setCopied(false), 2000);
            }}
            className="inline-flex items-center gap-1.5 rounded-xs border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 font-semibold text-xs px-3 py-2 whitespace-nowrap cursor-pointer transition"
          >
            <Copy className="w-3.5 h-3.5 text-slate-500" /> {copied ? "Link Copied" : "Copy Link"}
          </button>
          <button
            type="button"
            onClick={() => {
              const link = `${window.location.origin}/q/${publicToken}`;
              const greeting = customerContact.includes("@") ? "there" : customerContact;
              const url =
                "https://mail.google.com/mail/?view=cm&fs=1&to=" +
                encodeURIComponent(customerEmail) +
                "&su=" +
                encodeURIComponent(`Giant Promotions Quote ${quoteNumber} — ${title}`) +
                "&body=" +
                encodeURIComponent(
                  `Hi ${greeting},\n\nYour quote (${quoteNumber}) is ready to review and approve online:\n${link}\n\nThank you,\nGiant Promotions Limited\n902-456-6487`
                );
              window.open(url, "_blank", "noopener");
            }}
            className="inline-flex items-center gap-1.5 rounded-xs border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 font-semibold text-xs px-3 py-2 whitespace-nowrap cursor-pointer transition"
          >
            <Mail className="w-3.5 h-3.5 text-slate-500" /> Email via Gmail
          </button>
          <Link
            href={`/q/${publicToken}`}
            target="_blank"
            className="inline-flex items-center gap-1.5 rounded-xs border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 font-semibold text-xs px-3 py-2 whitespace-nowrap transition"
          >
            <ExternalLink className="w-3.5 h-3.5 text-[#186ade]" /> Preview Portal
          </Link>
          <button
            type="button"
            onClick={() => setMode(mode === "sign" ? null : "sign")}
            className="inline-flex items-center gap-1.5 rounded-xs border border-emerald-300 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 font-semibold text-xs px-3 py-2 whitespace-nowrap cursor-pointer transition"
          >
            <PenLine className="w-3.5 h-3.5" /> Record Offline Signature
          </button>
          <button
            type="button"
            onClick={() => setMode(mode === "lost" ? null : "lost")}
            className="inline-flex items-center gap-1.5 rounded-xs border border-rose-200 bg-rose-50 hover:bg-rose-100 text-rose-700 font-semibold text-xs px-3 py-2 whitespace-nowrap cursor-pointer transition"
          >
            <XCircle className="w-3.5 h-3.5" /> Mark Lost
          </button>
        </div>
      </div>

      {feedback && (
        <div className="rounded-xs bg-emerald-50 border border-emerald-200 text-emerald-900 px-3.5 py-2 text-xs font-semibold flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-600" /> {feedback}
        </div>
      )}
      {error && (
        <div className="rounded-xs bg-rose-50 border border-rose-200 text-rose-800 px-3.5 py-2 text-xs font-semibold">
          {error}
        </div>
      )}

      {mode === "sign" && (
        <div className="rounded-xs bg-emerald-50/60 border border-emerald-200 p-3.5 space-y-2">
          <div className="text-xs font-bold text-emerald-900">
            Record an approval received by phone or PO. Assigns the next sequential job number immediately.
          </div>
          <div className="flex flex-col sm:flex-row gap-2">
            <label htmlFor="manual-signer" className="sr-only">
              Name of the person who approved
            </label>
            <input
              id="manual-signer"
              value={signer}
              onChange={(e) => setSigner(e.target.value)}
              placeholder="Approving contact full name"
              className="flex-1 rounded-xs border border-emerald-300 bg-white px-3 py-1.5 text-xs text-slate-900"
            />
            <button
              type="button"
              disabled={isPending || !signer.trim()}
              onClick={() => {
                setError(null);
                startTransition(async () => {
                  const res = await approveQuoteAction({
                    projectId,
                    approvedByName: signer,
                  });
                  if (!res.ok) setError(res.error);
                });
              }}
              className="rounded-xs bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs px-4 py-1.5 disabled:opacity-50 whitespace-nowrap cursor-pointer"
            >
              Confirm Signed &amp; Assign Job #
            </button>
          </div>
        </div>
      )}

      {mode === "lost" && (
        <div className="rounded-xs bg-rose-50/60 border border-rose-200 p-3.5 space-y-2">
          <div className="text-xs font-bold text-rose-900">Reason quote was lost or cancelled:</div>
          <div className="flex flex-col sm:flex-row gap-2">
            <label htmlFor="lost-reason" className="sr-only">
              Reason lost
            </label>
            <input
              id="lost-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Budget constraints, event postponed"
              className="flex-1 rounded-xs border border-rose-300 bg-white px-3 py-1.5 text-xs text-slate-900"
            />
            <button
              type="button"
              disabled={isPending || !reason.trim()}
              onClick={() => {
                setError(null);
                startTransition(async () => {
                  const res = await markProjectLostAction({ projectId, reason });
                  if (!res.ok) setError(res.error);
                });
              }}
              className="rounded-xs bg-rose-600 hover:bg-rose-700 text-white font-semibold text-xs px-4 py-1.5 disabled:opacity-50 whitespace-nowrap cursor-pointer"
            >
              Confirm Lost
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
