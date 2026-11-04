"use client";

import React, { useState, useTransition } from "react";
import {
  CheckCircle2,
  CreditCard,
  Printer,
  ShieldCheck,
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

      if (res.isTestMode && invoiceId) {
        await finalizeStripePaymentAction({
          invoiceId,
          amountCents: balanceCents > 0 ? balanceCents : totalCents,
          sessionId: res.sessionId,
        });
        setStripeSuccessMsg("✓ Payment processed successfully via Stripe Checkout!");
        setIsPayingStripe(false);
        setTimeout(() => {
          window.location.reload();
        }, 1200);
        return;
      }

      window.location.href = res.url;
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setIsPayingStripe(false);
    }
  };

  if (status === "approved") {
    const dueCents = balanceCents > 0 ? balanceCents : totalCents;
    return (
      <div className="space-y-4 print:hidden">
        {/* Clean Side-by-Side Signature Record & Online Payment */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Left Card: Electronic Signature Certificate */}
          <div className="rounded-xs bg-[#f8fafc] border border-slate-200 p-5 flex flex-col justify-between gap-4">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-emerald-700">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  Contract Signed &amp; Scheduled
                </span>
                <span className="text-xs font-bold text-slate-700 tabular-nums">
                  {jobNumber ? `Job #${jobNumber}` : quoteNumber}
                </span>
              </div>
              <p className="text-xs text-slate-600">
                Electronically signed by <strong className="text-slate-900">{approvedByName}</strong>
                {approvedAt ? ` on ${new Date(approvedAt).toLocaleDateString("en-CA")}` : ""}.
              </p>
              <div className="rounded-xs bg-white border border-slate-200 px-3.5 py-2.5 mt-2 flex items-center justify-between">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  Signature on File
                </span>
                <span className="font-serif italic text-base text-slate-800">
                  {approvedByName}
                </span>
              </div>
            </div>

            <div className="flex items-center justify-between pt-2 border-t border-slate-200/80">
              <span className="text-[11px] text-slate-500">
                Official copy for your records
              </span>
              <button
                type="button"
                onClick={handlePrint}
                className="inline-flex items-center gap-1.5 rounded-xs border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 font-semibold text-xs px-3 py-1.5 cursor-pointer transition"
              >
                <Printer className="w-3.5 h-3.5 text-slate-500" />
                Print / Save PDF
              </button>
            </div>
          </div>

          {/* Right Card: Online Invoice Payment */}
          <div className="rounded-xs bg-white border border-slate-200 p-5 flex flex-col justify-between gap-4">
            {isPaid ? (
              <div className="space-y-2 my-auto text-center py-4">
                <CheckCircle2 className="w-8 h-8 text-emerald-600 mx-auto" />
                <div className="text-sm font-bold text-slate-900">
                  Invoice Paid in Full ({formatCAD(totalCents)})
                </div>
                <p className="text-xs text-slate-500">
                  Thank you for your business. A receipt has been logged on your account.
                </p>
              </div>
            ) : (
              <>
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
                      <CreditCard className="w-4 h-4 text-[#186ade]" />
                      Online Invoice Payment
                    </span>
                    <span className="text-sm font-bold text-slate-900 tabular-nums">
                      {formatCAD(dueCents)} Due
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 leading-relaxed">
                    Pay securely online via Stripe Checkout using Visa, Mastercard, AMEX, or pay by Interac e-Transfer / corporate cheque per your terms.
                  </p>
                </div>

                {stripeSuccessMsg && (
                  <div className="p-2.5 rounded-xs bg-emerald-50 text-emerald-800 border border-emerald-200 text-xs font-semibold">
                    {stripeSuccessMsg}
                  </div>
                )}

                {error && (
                  <div className="p-2.5 rounded-xs bg-rose-50 text-rose-700 border border-rose-200 text-xs font-semibold">
                    {error}
                  </div>
                )}

                <button
                  type="button"
                  disabled={isPayingStripe}
                  onClick={handleStripePay}
                  className="w-full rounded-xs bg-[#186ade] hover:bg-[#1458b8] disabled:opacity-50 text-white font-semibold text-xs py-2.5 px-4 transition shadow-2xs cursor-pointer flex items-center justify-center gap-2"
                >
                  <CreditCard className="w-4 h-4" />
                  {isPayingStripe
                    ? "Connecting to Stripe Checkout…"
                    : `Pay ${formatCAD(dueCents)} with Credit Card`}
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    );
  }

  if (status === "lost" || status === "cancelled") {
    return (
      <div className="rounded-xs bg-slate-100 border border-slate-300 p-5 text-xs text-slate-700 print:hidden">
        This proposal is no longer active. Please contact Giant Promotions at 902-456-6487 for assistance.
      </div>
    );
  }

  if (status === "action_needed" || declineSent) {
    return (
      <div className="rounded-xs bg-amber-50 border border-amber-300 p-5 space-y-1 print:hidden">
        <div className="text-sm font-bold text-amber-950">Revision Request Received</div>
        <p className="text-xs text-amber-900">
          Our estimator team has been notified and will send an updated proposal shortly. You can also reach our Halifax office at 902-456-6487.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4 print:hidden">
      <div className="rounded-xs border border-slate-300 p-5 space-y-4 bg-[#f8fafc]">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 pb-3">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-[#186ade] shrink-0" />
            <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wider">
              Digital Signature &amp; Contract Authorization
            </h2>
          </div>
          <button
            type="button"
            onClick={handlePrint}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-700 hover:text-slate-950 bg-white border border-slate-300 px-2.5 py-1 rounded-xs transition cursor-pointer"
          >
            <Printer className="w-3.5 h-3.5 text-slate-500" />
            Print / Save PDF
          </button>
        </div>

        <p className="text-xs text-slate-600 leading-relaxed">
          By typing your full legal name and clicking <strong>Sign &amp; Approve Contract</strong>, you authorize Giant Promotions Limited to proceed with the scope and pricing detailed above.
        </p>

        {error && (
          <div className="rounded-xs bg-rose-50 border border-rose-200 text-rose-700 px-3 py-2 text-xs font-medium">
            {error}
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label
              htmlFor="quote-signer-name"
              className="block text-xs font-semibold text-slate-700 mb-1"
            >
              Full Legal Name (Authorized Signer) *
            </label>
            <input
              id="quote-signer-name"
              name="signerName"
              type="text"
              required
              value={signerName}
              onChange={(e) => setSignerName(e.target.value)}
              placeholder="e.g. David MacKay"
              className="w-full rounded-xs border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-900 focus:outline-none focus:border-[#186ade]"
            />
          </div>
          <div>
            <label
              htmlFor="quote-signer-email"
              className="block text-xs font-semibold text-slate-700 mb-1"
            >
              Email Address for Confirmation
            </label>
            <input
              id="quote-signer-email"
              name="signerEmail"
              type="email"
              value={signerEmail}
              onChange={(e) => setSignerEmail(e.target.value)}
              placeholder="name@company.com"
              className="w-full rounded-xs border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 focus:outline-none focus:border-[#186ade]"
            />
          </div>
        </div>

        {/* Live Digital Signature Preview */}
        <div className="rounded-xs bg-white border border-slate-300 px-4 py-2.5 flex items-center justify-between">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
            Electronic Signature
          </span>
          <span className="font-serif italic text-lg text-slate-800">
            {signerName.trim() || "Type your name above to sign…"}
          </span>
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1">
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
            className="rounded-xs bg-[#186ade] hover:bg-[#1458b8] text-white font-semibold text-xs py-2.5 px-6 transition shadow-2xs disabled:opacity-50 cursor-pointer"
          >
            {isPending
              ? "Authorizing & Assigning Contract Number…"
              : "✓ Sign & Approve Contract"}
          </button>

          {!showDecline && (
            <button
              type="button"
              onClick={() => setShowDecline(true)}
              className="text-xs font-semibold text-slate-500 hover:text-slate-800 underline cursor-pointer"
            >
              Request Changes or Decline Proposal
            </button>
          )}
        </div>

        {showDecline && (
          <div className="pt-3 border-t border-slate-200 space-y-2">
            <label htmlFor="quote-decline-reason" className="block text-xs font-semibold text-slate-700">
              Please let us know what changes you need:
            </label>
            <textarea
              id="quote-decline-reason"
              name="declineReason"
              rows={2}
              value={declineReason}
              onChange={(e) => setDeclineReason(e.target.value)}
              className="w-full rounded-xs border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900"
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
                className="rounded-xs bg-slate-800 hover:bg-slate-700 text-white font-semibold text-xs px-3.5 py-1.5 disabled:opacity-50 cursor-pointer"
              >
                Send Revision Request
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
  );
}
