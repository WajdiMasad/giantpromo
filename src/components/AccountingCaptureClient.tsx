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
      <div className="rounded-2xl bg-emerald-50 border border-emerald-300 p-5 text-sm text-emerald-950 flex items-center gap-2">
        <CheckCircle2 className="w-5 h-5 text-emerald-600" />
        Captured as batch #{done}. Everything through {throughDate} is now marked as entered in the books.
      </div>
    );
  }

  return (
    <div className="rounded-2xl bg-slate-950 text-white p-5 space-y-3">
      <div className="flex items-center gap-2 text-sm font-bold text-amber-400">
        <Lock className="w-4 h-4" /> Finished entering these into Sage?
      </div>
      <p className="text-xs text-slate-300 max-w-2xl">
        Marking them captured locks them in: they will not appear in the next capture, so nothing is entered twice, and anything issued, voided or paid after
        this date will appear next time. ({summary})
      </p>
      {error && <div className="rounded-lg bg-rose-500/20 border border-rose-400/40 text-rose-100 px-3 py-2 text-xs font-semibold">{error}</div>}
      <div className="flex flex-col sm:flex-row gap-2">
        <label htmlFor="capture-note" className="sr-only">Note (optional)</label>
        <input
          id="capture-note"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Note (optional), e.g. week ending Nov 7"
          className="flex-1 rounded-lg bg-slate-900 border border-slate-700 px-3 py-2 text-xs text-white placeholder:text-slate-500"
        />
        {!confirming ? (
          <button
            type="button"
            onClick={() => setConfirming(true)}
            className="rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs px-4 py-2 whitespace-nowrap cursor-pointer"
          >
            Mark everything through {throughDate} as captured
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
              className="rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs px-4 py-2 whitespace-nowrap disabled:opacity-50 cursor-pointer"
            >
              Yes, lock it in
            </button>
            <button
              type="button"
              onClick={() => setConfirming(false)}
              className="rounded-lg border border-slate-600 text-slate-200 font-semibold text-xs px-3 py-2 cursor-pointer"
            >
              Not yet
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
