import { notFound } from "next/navigation";
import { asc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { customers, jobs, quoteItems, quotes } from "@/db/schema";
import { formatCAD } from "@/lib/money";
import { CustomerQuoteApprovalCard } from "@/components/CustomerQuoteApprovalCard";

export const dynamic = "force-dynamic";

export default async function PublicQuotePortalPage(props: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await props.params;
  const db = await getDb();

  const [row] = await db
    .select({
      quote: quotes,
      customer: customers,
    })
    .from(quotes)
    .innerJoin(customers, eq(quotes.customerId, customers.id))
    .where(eq(quotes.publicToken, token))
    .limit(1);

  if (!row) {
    notFound();
  }

  const { quote, customer } = row;

  // Automatically record firstViewedAt when opened (tracks customer opens without email spy pixels)
  if (!quote.firstViewedAt || quote.status === "sent") {
    const now = new Date();
    await db
      .update(quotes)
      .set({
        firstViewedAt: quote.firstViewedAt ?? now,
        status: quote.status === "sent" ? "viewed" : quote.status,
        updatedAt: now,
      })
      .where(eq(quotes.id, quote.id));
  }

  const items = await db
    .select()
    .from(quoteItems)
    .where(eq(quoteItems.quoteId, quote.id))
    .orderBy(asc(quoteItems.sortOrder));

  const [linkedJob] = await db
    .select()
    .from(jobs)
    .where(eq(jobs.quoteId, quote.id))
    .limit(1);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-900 py-8 px-4 sm:px-6">
      <div className="max-w-3xl mx-auto space-y-6">
        {/* Branded Header */}
        <div className="rounded-3xl bg-slate-900 border border-slate-800 p-6 sm:p-8 text-white flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div className="h-12 w-12 rounded-2xl bg-amber-500 text-slate-950 font-black flex items-center justify-center text-xl">
              GP
            </div>
            <div>
              <div className="font-bold text-lg tracking-tight">
                GIANT PROMOTIONS LIMITED
              </div>
              <div className="text-xs text-slate-400">
                3797 Mackintosh Street, Halifax, NS B3K 5A7 • 902-456-6487
              </div>
            </div>
          </div>
          <div className="sm:text-right">
            <div className="font-mono text-sm font-bold text-amber-400">
              {quote.quoteNumber}
            </div>
            <div className="text-xs text-slate-400">
              Valid until {quote.validUntil || "30 days"}
            </div>
          </div>
        </div>

        {/* Main Quote Card */}
        <div className="rounded-3xl bg-white p-6 sm:p-8 shadow-xl space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 border-b border-slate-100 pb-6">
            <div>
              <div className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                Prepared For
              </div>
              <h1 className="text-xl sm:text-2xl font-bold text-slate-900 mt-1">
                {customer.name}
              </h1>
              <div className="text-sm text-slate-600 mt-1">
                {quote.siteAddress} ({quote.siteProvince})
              </div>
              {quote.poReference && (
                <div className="text-xs font-medium text-slate-500 mt-1">
                  Customer Reference / PO: <strong>{quote.poReference}</strong>
                </div>
              )}
            </div>

            <div className="sm:text-right">
              <div className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                Project
              </div>
              <div className="text-base font-bold text-slate-900 mt-1">
                {quote.title}
              </div>
            </div>
          </div>

          {/* Line Items */}
          <div className="space-y-3">
            <div className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              Itemized Breakdown
            </div>
            <div className="divide-y divide-slate-100 border border-slate-200 rounded-2xl overflow-hidden">
              {items.map((item) => (
                <div
                  key={item.id}
                  className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-2 bg-white"
                >
                  <div>
                    <div className="font-semibold text-sm text-slate-900">
                      {item.description}
                    </div>
                    <div className="text-xs text-slate-500 mt-0.5">
                      Qty: {item.quantity} × {formatCAD(item.unitPriceCents)}
                    </div>
                  </div>
                  <div className="font-bold text-sm text-slate-900 sm:text-right">
                    {formatCAD(item.netCents)}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Totals */}
          <div className="rounded-2xl bg-slate-50 p-5 border border-slate-200/80 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="text-xs text-slate-600 space-y-1 max-w-md">
              {quote.notes && (
                <div>
                  <strong className="text-slate-900">Scope Notes:</strong> {quote.notes}
                </div>
              )}
              {quote.customerTerms && (
                <div>
                  <strong className="text-slate-900">Terms:</strong> {quote.customerTerms}
                </div>
              )}
              <div className="text-[11px] text-slate-400 pt-1">
                GST/HST #888811650 RT 0001
              </div>
            </div>

            <div className="space-y-1 sm:text-right shrink-0">
              <div className="text-xs text-slate-600">
                Subtotal: <strong>{formatCAD(quote.subtotalCents)}</strong>
              </div>
              <div className="text-xs text-slate-600">
                Tax ({quote.taxLabel}): <strong>{formatCAD(quote.taxCents)}</strong>
              </div>
              <div className="text-xl font-black text-slate-900 pt-1">
                Total: {formatCAD(quote.totalCents)}
              </div>
            </div>
          </div>

          {/* Interactive Approval Component */}
          <CustomerQuoteApprovalCard
            publicToken={quote.publicToken}
            status={quote.status}
            approvedByName={quote.approvedByName}
            approvedAt={quote.approvedAt?.toISOString() ?? null}
            defaultSignerName={customer.contactPerson || customer.name}
            defaultSignerEmail={customer.email || ""}
            customerEmail={customer.email || ""}
            quoteNumber={quote.quoteNumber}
            jobNumber={linkedJob?.jobNumber ?? null}
            jobId={linkedJob?.id ?? null}
          />
        </div>
      </div>
    </div>
  );
}
