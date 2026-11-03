"use client";

import React, { useState, useTransition } from "react";
import {
  CheckCircle2,
  CreditCard,
  Download,
  Printer,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import {
  approveQuoteAction,
  createStripeCheckoutAction,
  declineQuoteAction,
  finalizeStripePaymentAction,
} from "@/app/actions";
import { formatCAD } from "@/lib/money";

export function CustomerQuoteApprovalCard({
  projectId,
  invoiceId,
  publicToken,
  status,
  approvedByName,
  approvedAt,
  defaultSignerName,
  defaultSignerEmail,
  customerEmail,
  quoteNumber,
  jobNumber,
  totalCents,
  paidCents = 0,
  balanceCents = 0,
  isPaid = false,
}: {
  projectId?: number | null;
  invoiceId?: number | null;
  publicToken: string;
  status: string;
  approvedByName: string | null;
  approvedAt: string | null;
  defaultSignerName: string;
  defaultSignerEmail: string;
  customerEmail: string;
  quoteNumber: string;
  jobNumber: string | null;
  totalCents: number;
  paidCents?: number;
  balanceCents?: number;
  isPaid?: boolean;
}) {
  const cleanInitialName = defaultSignerName.includes("@") ? "" : defaultSignerName;
  const [signerName, setSignerName] = useState(cleanInitialName);
  const [signerEmail, setSignerEmail] = useState(defaultSignerEmail);
  const [isPending, startTransition] = useTransition();
  const [isPayingStripe, setIsPayingStripe] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stripeSuccessMsg, setStripeSuccessMsg] = useState<string | null>(null);
  const [showDecline, setShowDecline] = useState(false);
  const [declineReason, setDeclineReason] = useState("");
  const [declineSent, setDeclineSent] = useState(false);

  const handlePrint = () => {
    window.print();
  };

  const handleStripePay = async () => {
    if (!projectId) return;
    setError(null);
    setIsPayingStripe(true);
    try {
      const currentUrl = window.location.href.split("?")[0]!;
      const res = await createStripeCheckoutAction({
        projectId,
        customerEmail: signerEmail || customerEmail,
        successUrl: `${currentUrl}?payment=success`,
        cancelUrl: `${currentUrl}?payment=cancelled`,
      });

      if (!res.ok) {
        setError(res.error);
        setIsPayingStripe(false);
        return;
      }

      // If in Stripe simulated/developer mode, auto-finalize and show confirmation
      if (res.isTestMode && invoiceId) {
        await finalizeStripePaymentAction({
          invoiceId,
          amountCents: balanceCents > 0 ? balanceCents : totalCents,
          sessionId: res.sessionId,
        });
        setStripeSuccessMsg("✓ Payment processed successfully via Stripe Test Mode!");
        setIsPayingStripe(false);
        setTimeout(() => {
          window.location.reload();
        }, 1500);
        return;
      }

      // Real Stripe Checkout redirect
      window.location.href = res.url;
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setIsPayingStripe(false);
    }
  };

  if (status === "approved") {
    return (
      <div className="space-y-4 print:hidden">
        {/* Approved Summary Card */}
        <div className="rounded-2xl bg-emerald-50 border-2 border-emerald-300 p-6 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-emerald-600 text-white flex items-center justify-center shrink-0">
                <CheckCircle2 className="w-6 h-6" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-emerald-950">
                  Quote Approved & Scheduled
                </h2>
                <p className="text-xs text-emerald-800">
                  Authorized by <strong>{approvedByName}</strong>{" "}
                  {approvedAt ? `on ${new Date(approvedAt).toLocaleString("en-CA")}` : ""}
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={handlePrint}
              className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-300 bg-white hover:bg-emerald-50 text-emerald-950 font-semibold text-xs px-3.5 py-2 cursor-pointer shadow-xs"
            >
              <Printer className="w-3.5 h-3.5 text-emerald-700" />
              Print / Save PDF
            </button>
          </div>

          <div className="rounded-xl bg-white p-4 border border-emerald-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
            <div>
              <span className="text-slate-500">Official Work Order / Sage Reference: </span>
              <strong className="font-mono text-sm text-slate-950">
                {jobNumber ? `#${jobNumber}` : "⏳ Pending"}
              </strong>
            </div>

            {isPaid ? (
              <span className="inline-flex items-center gap-1 font-bold text-emerald-700 bg-emerald-100 px-3 py-1 rounded-full">
                <CheckCircle2 className="w-3.5 h-3.5" />
                Paid in Full ({formatCAD(totalCents)})
              </span>
            ) : (
              <div className="text-right">
                <span className="text-slate-500">Balance Owing: </span>
                <strong className="font-mono text-sm text-slate-950">
                  {formatCAD(balanceCents > 0 ? balanceCents : totalCents)}
                </strong>
              </div>
            )}
          </div>

          {/* Stripe Online Card Payment Option */}
          {!isPaid && (
            <div className="rounded-xl bg-slate-900 text-white p-4 space-y-3 border border-slate-800">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div className="space-y-0.5">
                  <div className="font-bold text-sm text-white flex items-center gap-2">
                    <CreditCard className="w-4 h-4 text-amber-400" />
                    Pay Online with Credit Card (Stripe)
                  </div>
                  <p className="text-xs text-slate-300">
                    Secure credit card processing powered by Stripe. Visa, Mastercard, AMEX & Apple Pay accepted.
                  </p>
                </div>
                <div className="text-right">
                  <div className="text-[11px] text-slate-400 uppercase tracking-wider">Amount Due</div>
                  <div className="text-base font-bold font-mono text-amber-400">
                    {formatCAD(balanceCents > 0 ? balanceCents : totalCents)}
                  </div>
                </div>
              </div>

              {stripeSuccessMsg && (
                <div className="p-3 rounded-lg bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-xs font-semibold">
                  {stripeSuccessMsg}
                </div>
              )}

              {error && (
                <div className="p-3 rounded-lg bg-rose-500/20 text-rose-300 border border-rose-500/30 text-xs font-semibold">
                  {error}
                </div>
              )}

              <button
                type="button"
                disabled={isPayingStripe}
                onClick={handleStripePay}
                className="w-full rounded-xl bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-slate-950 font-bold text-sm py-3 px-4 transition shadow cursor-pointer flex items-center justify-center gap-2"
              >
                <CreditCard className="w-4 h-4" />
                {isPayingStripe
                  ? "Connecting to Stripe Secure Checkout…"
                  : `Pay ${formatCAD(balanceCents > 0 ? balanceCents : totalCents)} with Credit Card`}
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }

  if (status === "lost" || status === "cancelled") {
    return (
      <div className="rounded-2xl bg-slate-100 border border-slate-300 p-6 text-sm text-slate-700 print:hidden">
        This quote is no longer active. Please contact Giant Promotions at 902-456-6487 if you have questions.
      </div>
    );
  }

  if (status === "action_needed" || declineSent) {
    return (
      <div className="rounded-2xl bg-amber-50 border-2 border-amber-300 p-6 space-y-1 print:hidden">
        <div className="text-base font-bold text-amber-950">Thanks — we&apos;ve got your request</div>
        <p className="text-sm text-amber-900">
          Our team will review your requested revisions and send an updated proposal. You can also reach us at 902-456-6487.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4 pt-2 print:hidden">
      {/* Top Utility Bar */}
      <div className="flex items-center justify-between">
        <span className="text-xs text-slate-500">
          Proposal Ref: <strong className="font-mono text-slate-900">{quoteNumber}</strong>
        </span>
        <button
          type="button"
          onClick={handlePrint}
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-700 hover:text-slate-950 bg-slate-100 hover:bg-slate-200 px-3 py-1.5 rounded-lg transition cursor-pointer"
        >
          <Printer className="w-3.5 h-3.5 text-slate-600" />
          Print / Save PDF
        </button>
      </div>

      {/* Customer Signature Box */}
      <div className="rounded-2xl border-2 border-slate-900 p-6 space-y-4 bg-white shadow-xs">
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
          By typing your full name and clicking <strong>Approve Quote & Schedule Job</strong>, you authorize Giant Promotions Limited to proceed with the specified scope and pricing.
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
            ? "Authorizing & Assigning Master Sage Invoice Number…"
            : "✓ Approve Quote & Schedule Job"}
        </button>

        <div className="pt-2 border-t border-slate-100">
          {!showDecline ? (
            <button
              type="button"
              onClick={() => setShowDecline(true)}
              className="text-xs font-semibold text-slate-500 hover:text-slate-800 underline cursor-pointer"
            >
              Need changes, or not going ahead? Let us know
            </button>
          ) : (
            <div className="space-y-2">
              <label htmlFor="quote-decline-reason" className="block text-xs font-semibold text-slate-700">
                What would you like changed, or why are you declining?
              </label>
              <textarea
                id="quote-decline-reason"
                name="declineReason"
                rows={3}
                value={declineReason}
                onChange={(e) => setDeclineReason(e.target.value)}
                className="w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm text-slate-900"
              />
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={isPending || !declineReason.trim()}
                  onClick={() => {
                    setError(null);
                    startTransition(async () => {
                      const res = await declineQuoteAction({
                        publicToken,
                        reason: declineReason,
                        name: signerName,
                      });
                      if (!res.ok) setError(res.error);
                      else setDeclineSent(true);
                    });
                  }}
                  className="rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-semibold text-xs px-4 py-2.5 disabled:opacity-50 cursor-pointer"
                >
                  Send to Giant Promotions
                </button>
                <button
                  type="button"
                  onClick={() => setShowDecline(false)}
                  className="text-xs font-semibold text-slate-500 hover:text-slate-800 cursor-pointer"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
