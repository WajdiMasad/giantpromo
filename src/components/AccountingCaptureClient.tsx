"use client";

import React, { useState, useTransition } from "react";
import { CheckCircle2, Lock } from "lucide-react";
import { captureAccountingBatchAction } from "@/app/actions";

export function AccountingCaptureClient({
  throughDate,
  summary,
}: {
  throughDate: string;
  summary: string;
}) {
  const [isPending, startTransition] = useTransition();
  const [note, setNote] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<number | null>(null);

  if (done) {
    return (
      <div className="rounded-xs bg-emerald-50 border border-emerald-300 p-4 text-xs text-emerald-950 flex items-center gap-2">
        <CheckCircle2 className="w-4 h-4 text-emerald-600" />
        Captured as Batch #{done}. Everything through {throughDate} is now marked as entered in the books.
      </div>
    );
  }

  return (
    <div className="rounded-xs bg-white border border-slate-300 p-5 space-y-3 shadow-2xs">
      <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-800">
        <Lock className="w-4 h-4 text-[#186ade]" /> Lock Accounting Capture Batch
      </div>
      <p className="text-xs text-slate-600 max-w-2xl">
        Marking these transactions as captured locks them into a batch so they will not appear in future captures ({summary}).
      </p>
      {error && (
        <div className="rounded-xs bg-rose-50 border border-rose-200 text-rose-800 px-3 py-2 text-xs font-semibold">
          {error}
        </div>
      )}
      <div className="flex flex-col sm:flex-row gap-2">
        <label htmlFor="capture-note" className="sr-only">
          Note (optional)
        </label>
        <input
          id="capture-note"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Batch note (optional), e.g. Week ending Nov 7"
          className="flex-1 rounded-xs bg-white border border-slate-300 px-3 py-1.5 text-xs text-slate-900"
        />
        {!confirming ? (
          <button
            type="button"
            onClick={() => setConfirming(true)}
            className="rounded-xs bg-[#186ade] hover:bg-[#1458b8] text-white font-semibold text-xs px-4 py-1.5 whitespace-nowrap cursor-pointer shadow-2xs"
          >
            Mark Transactions Through {throughDate} as Captured
          </button>
        ) : (
          <div className="flex gap-2">
            <button
              type="button"
              disabled={isPending}
              onClick={() => {
                setError(null);
                startTransition(async () => {
                  const res = await captureAccountingBatchAction({ throughDate, note });
                  if (!res.ok) setError(res.error);
                  else setDone(res.batchId);
                });
              }}
              className="rounded-xs bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs px-4 py-1.5 whitespace-nowrap disabled:opacity-50 cursor-pointer"
            >
              Confirm &amp; Lock Batch
            </button>
            <button
              type="button"
              onClick={() => setConfirming(false)}
              className="rounded-xs border border-slate-300 bg-white text-slate-700 font-semibold text-xs px-3 py-1.5 cursor-pointer"
            >
              Cancel
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
