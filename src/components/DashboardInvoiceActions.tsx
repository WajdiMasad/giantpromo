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
      <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-xs">
        <CheckCircle2 className="w-3.5 h-3.5" />
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
          className="inline-flex items-center gap-1.5 rounded-xs bg-[#186ade] hover:bg-[#1458b8] text-white text-xs font-semibold px-3 py-1.5 transition cursor-pointer shadow-2xs whitespace-nowrap"
        >
          <Send className="w-3 h-3" />
          Send Invoice #{invoiceNumber}
        </button>
      ) : (
        <div className="flex flex-wrap items-center gap-1.5 bg-slate-50 p-1.5 rounded-xs border border-slate-200">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="customer@email.com"
            className="rounded-xs border border-slate-300 bg-white px-2 py-1 text-xs text-slate-900 w-44"
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
                  setSentMsg(`Sent #${res.invoiceNumber}`);
                }
              });
            }}
            className="rounded-xs bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs px-2.5 py-1 disabled:opacity-50 cursor-pointer"
          >
            {isPending ? "Sending…" : `Confirm (${totalFormatted})`}
          </button>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="text-xs text-slate-500 hover:text-slate-800 px-1 cursor-pointer"
          >
            Cancel
          </button>
          {err && <span className="text-xs text-rose-600 font-medium">{err}</span>}
        </div>
      )}
    </div>
  );
}
