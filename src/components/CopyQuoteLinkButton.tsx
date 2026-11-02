"use client";

import React, { useState } from "react";
import { Copy, Check } from "lucide-react";

export function CopyQuoteLinkButton({ publicToken }: { publicToken: string }) {
  const [copied, setCopied] = useState(false);

  return (
    <button
      type="button"
      onClick={() => {
        const url = `${window.location.origin}/q/${publicToken}`;
        navigator.clipboard.writeText(url);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }}
      className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-700 font-semibold text-xs px-2.5 py-1.5 transition cursor-pointer whitespace-nowrap"
      title="Copy public approval URL"
    >
      {copied ? (
        <>
          <Check className="w-3.5 h-3.5 text-emerald-600" /> Copied
        </>
      ) : (
        <>
          <Copy className="w-3.5 h-3.5 text-slate-500" /> Copy
        </>
      )}
    </button>
  );
}
