"use client";

import React, { useState, useTransition } from "react";
import Link from "next/link";
import { CheckCircle2, Copy, ExternalLink, Send, XCircle, PenLine } from "lucide-react";
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
    <div className="rounded-2xl bg-white border border-slate-200/90 p-5 shadow-xs space-y-4 print:hidden">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        <div>
          <div className="text-sm font-bold text-slate-900">
            {status === "new"
              ? "This quote is a draft"
              : status === "action_needed"
                ? "The client asked for changes"
                : "Quote sent — waiting for the client"}
          </div>
          <div className="text-xs text-slate-500">
            {status === "new"
              ? "Nothing has been shared with the client yet."
              : sentAt
                ? `Last sent ${new Date(sentAt).toLocaleString("en-CA")}.`
                : ""}{" "}
            The Sage job number is created the moment the client signs.
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
                else setFeedback("Marked as sent. Copy the link or use Send via Gmail on the customer page.");
              });
            }}
            className="inline-flex items-center gap-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs px-4 py-2.5 whitespace-nowrap cursor-pointer"
          >
            <Send className="w-3.5 h-3.5" />
            {isResend ? "Re-send to client" : "Send to client"}
          </button>
          <button
            type="button"
            onClick={() => {
              navigator.clipboard.writeText(`${window.location.origin}/q/${publicToken}`);
              setCopied(true);
              setTimeout(() => setCopied(false), 2000);
            }}
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-slate-800 font-semibold text-xs px-3.5 py-2.5 whitespace-nowrap cursor-pointer"
          >
            <Copy className="w-3.5 h-3.5" /> {copied ? "Link copied" : "Copy client link"}
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
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-slate-800 font-semibold text-xs px-3.5 py-2.5 whitespace-nowrap cursor-pointer"
          >
            Email via Gmail
          </button>
          <Link
            href={`/q/${publicToken}`}
            target="_blank"
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-slate-800 font-semibold text-xs px-3.5 py-2.5 whitespace-nowrap"
          >
            <ExternalLink className="w-3.5 h-3.5 text-amber-600" /> View as client
          </Link>
          <button
            type="button"
            onClick={() => setMode(mode === "sign" ? null : "sign")}
            className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-300 bg-emerald-50 hover:bg-emerald-100 text-emerald-900 font-semibold text-xs px-3.5 py-2.5 whitespace-nowrap cursor-pointer"
          >
            <PenLine className="w-3.5 h-3.5" /> Mark signed
          </button>
          <button
            type="button"
            onClick={() => setMode(mode === "lost" ? null : "lost")}
            className="inline-flex items-center gap-1.5 rounded-xl border border-rose-200 bg-rose-50 hover:bg-rose-100 text-rose-700 font-semibold text-xs px-3.5 py-2.5 whitespace-nowrap cursor-pointer"
          >
            <XCircle className="w-3.5 h-3.5" /> Mark lost
          </button>
        </div>
      </div>

      {feedback && (
        <div className="rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900 px-4 py-2 text-xs font-semibold flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4" /> {feedback}
        </div>
      )}
      {error && (
        <div className="rounded-xl bg-rose-50 border border-rose-200 text-rose-800 px-4 py-2 text-xs font-semibold">
          {error}
        </div>
      )}

      {mode === "sign" && (
        <div className="rounded-xl bg-emerald-50/60 border border-emerald-200 p-4 space-y-2">
          <div className="text-xs font-bold text-emerald-900">
            Record an approval received by phone or email. This creates the job and its Sage number right away.
          </div>
          <div className="flex flex-col sm:flex-row gap-2">
            <label htmlFor="manual-signer" className="sr-only">
              Name of the person who approved
            </label>
            <input
              id="manual-signer"
              value={signer}
              onChange={(e) => setSigner(e.target.value)}
              placeholder="Name of the person who approved"
              className="flex-1 rounded-lg border border-emerald-300 bg-white px-3 py-2 text-xs text-slate-900"
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
                })
              }}
              className="rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs px-4 py-2 disabled:opacity-50 whitespace-nowrap cursor-pointer"
            >
              Confirm signed &amp; create job
            </button>
          </div>
        </div>
      )}

      {mode === "lost" && (
        <div className="rounded-xl bg-rose-50/60 border border-rose-200 p-4 space-y-2">
          <div className="text-xs font-bold text-rose-900">Why was this quote lost? (kept for your records)</div>
          <div className="flex flex-col sm:flex-row gap-2">
            <label htmlFor="lost-reason" className="sr-only">
              Reason lost
            </label>
            <input
              id="lost-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. went with another shop, project cancelled"
              className="flex-1 rounded-lg border border-rose-300 bg-white px-3 py-2 text-xs text-slate-900"
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
              className="rounded-lg bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs px-4 py-2 disabled:opacity-50 whitespace-nowrap cursor-pointer"
            >
              Confirm lost
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
