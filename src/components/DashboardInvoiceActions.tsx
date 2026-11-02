"use client";

import React, { useState, useTransition } from "react";
import { Send, CheckCircle2 } from "lucide-react";
import { sendJobInvoiceAction } from "@/app/actions";

export function DashboardInvoiceActions({
  jobId,
  invoiceNumber,
  defaultEmail,
  totalFormatted,
}: {
  jobId: number;
  invoiceNumber: string;
  defaultEmail: string;
  totalFormatted: string;
}) {
  const [email, setEmail] = useState(defaultEmail);
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [sentMsg, setSentMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  if (sentMsg) {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-3 py-1.5 rounded-lg">
        <CheckCircle2 className="w-4 h-4" />
        {sentMsg}
      </span>
    );
  }

  return (
    <div className="flex items-center gap-2">
      {!open ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="inline-flex items-center gap-1.5 rounded-xl bg-slate-950 hover:bg-slate-800 text-white text-xs font-semibold px-3.5 py-2 transition"
        >
          <Send className="w-3.5 h-3.5 text-amber-400" />
          Send Invoice #{invoiceNumber}
        </button>
      ) : (
        <div className="flex flex-wrap items-center gap-2 bg-slate-50 p-2 rounded-xl border border-slate-200">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="customer@email.com"
            className="rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-xs text-slate-900 w-52"
          />
          <button
            type="button"
            disabled={isPending}
            onClick={() => {
              setErr(null);
              startTransition(async () => {
                const res = await sendJobInvoiceAction({
                  jobId,
                  recipientEmail: email,
                });
                if (!res.ok) {
                  setErr(res.error);
                } else {
                  setSentMsg(`Sent #${res.invoiceNumber} to ${res.email}`);
                }
              });
            }}
            className="rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs px-3 py-1.5 disabled:opacity-50"
          >
            {isPending ? "Sending…" : `Confirm & Send (${totalFormatted})`}
          </button>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="text-xs text-slate-500 hover:text-slate-800 px-1.5"
          >
            Cancel
          </button>
          {err && <span className="text-xs text-rose-600 font-medium">{err}</span>}
        </div>
      )}
    </div>
  );
}
