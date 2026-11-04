import { notFound } from "next/navigation";
import { asc, eq } from "drizzle-orm";
import { CheckCircle2, Clock } from "lucide-react";
import { getDb } from "@/db";
import { customers, invoices, jobItems, payments, projects } from "@/db/schema";
import { formatCAD } from "@/lib/money";
import { recordQuoteViewWorkflow } from "@/lib/workflows";
import { CustomerQuoteApprovalCard } from "@/components/CustomerQuoteApprovalCard";

export const dynamic = "force-dynamic";

export default async function PublicQuotePortalPage(props: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await props.params;
  const db = await getDb();

  const [row] = await db
    .select({ project: projects, customer: customers })
    .from(projects)
    .innerJoin(customers, eq(projects.customerId, customers.id))
    .where(eq(projects.publicToken, token))
    .limit(1);

  if (!row) notFound();

  const { customer } = row;
  // Only count it as a customer view when the quote has actually been sent to them
  if (row.project.status !== "new") {
    await recordQuoteViewWorkflow(token);
  }
  const [project] = await db.select().from(projects).where(eq(projects.publicToken, token)).limit(1);
  if (!project) notFound();

  const allItems = await db
    .select()
    .from(jobItems)
    .where(eq(jobItems.jobId, project.id))
    .orderBy(asc(jobItems.sortOrder));
  // Internal-only lines are never shown to the customer
  const items = allItems.filter((i) => !i.hiddenFromCustomer);

  const groups = new Map<string, typeof items>();
  for (const it of items) {
    const g = it.groupName || "Signage, Production & Installation";
    groups.set(g, [...(groups.get(g) ?? []), it]);
  }

  const signed = Boolean(project.approvedAt);

  const invoice = project.invoiceId
    ? ((await db.select().from(invoices).where(eq(invoices.id, project.invoiceId)).limit(1))[0] ?? null)
    : null;
  const invoicePayments = invoice
    ? await db.select().from(payments).where(eq(payments.invoiceId, invoice.id))
    : [];
  const paidCents = invoicePayments.reduce((a, pay) => a + pay.amountCents, 0);
  const balanceCents = invoice ? Math.max(0, invoice.totalCents - paidCents) : project.totalCents;
  const isPaid = invoice ? paidCents >= invoice.totalCents && invoice.totalCents > 0 : false;

  return (
    <div className="min-h-screen bg-[#eef1f6] print:bg-white text-slate-800 flex flex-col">
      {/* Sticky Top Client Portal Bar */}
      <header className="bg-[#082347] text-white border-b border-white/10 px-4 sm:px-8 h-16 flex items-center justify-between sticky top-0 z-20 print:hidden shadow-xs">
        <div className="flex items-center gap-3">
          <div className="h-8 w-8 rounded-xs bg-[#186ade] text-white font-bold flex items-center justify-center text-xs tracking-tighter">
            GP
          </div>
          <div>
            <div className="font-bold text-xs sm:text-sm tracking-wider uppercase leading-none">
              Giant Promotions Limited
            </div>
            <div className="text-[11px] text-[#8fa8c8] mt-0.5 hidden sm:block">
              Halifax Commercial Signage &amp; Event Rentals • 902-456-6487
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3 sm:gap-5">
          <div className="text-right tabular-nums">
            <div className="text-[10px] uppercase tracking-wider text-[#8fa8c8]">
              Contract Total
            </div>
            <div className="text-sm sm:text-base font-bold text-white whitespace-nowrap">
              {formatCAD(project.totalCents)}
            </div>
          </div>

          {signed ? (
            <span className="inline-flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-xs bg-[#1ca67a] text-white whitespace-nowrap">
              <CheckCircle2 className="w-3.5 h-3.5" /> Signed
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-xs bg-[#2b7fff] text-white whitespace-nowrap">
              <Clock className="w-3.5 h-3.5" /> Awaiting Signature
            </span>
          )}
        </div>
      </header>

      {/* Main Contract Document Sheet */}
      <div className="max-w-4xl w-full mx-auto my-6 sm:my-8 px-4 sm:px-6 print:my-0 print:px-0 print:max-w-none flex-1">
        <div className="bg-white border border-slate-200 rounded-xs shadow-xs print:border-0 print:shadow-none overflow-hidden">
          {/* Document Masthead */}
          <div className="p-6 sm:p-8 border-b border-slate-200 bg-[#f8fafc] print:bg-white flex flex-col sm:flex-row sm:items-start justify-between gap-4">
            <div className="space-y-1">
              <div className="text-xs font-bold uppercase tracking-widest text-[#186ade]">
                {signed ? "Signed Contract & Work Order" : "Commercial Quote & Proposal"}
              </div>
              <h1 className="text-xl sm:text-2xl font-bold text-slate-900">
                {project.title}
              </h1>
              <div className="text-xs text-slate-500 pt-1">
                Giant Promotions Limited • 3797 Mackintosh St, Halifax, NS B3K 5A7 • HST #888811650 RT 0001
              </div>
            </div>

            <div className="sm:text-right shrink-0 space-y-1 tabular-nums">
              <div className="inline-block rounded-xs bg-white border border-slate-300 px-3 py-1.5 text-xs font-bold text-slate-900 whitespace-nowrap">
                {project.jobNumber
                  ? `Contract / Invoice #${project.jobNumber}`
                  : `Quote ${project.quoteNumber}`}
              </div>
              {project.jobNumber && (
                <div className="text-xs text-slate-500 whitespace-nowrap">
                  Proposal Ref: {project.quoteNumber}
                </div>
              )}
              <div className="text-xs text-slate-500 whitespace-nowrap">
                {signed
                  ? `Authorized on ${project.approvedAt ? new Date(project.approvedAt).toLocaleDateString("en-CA") : "record"}`
                  : `Valid until ${project.validUntil || "30 days"}`}
              </div>
            </div>
          </div>

          {/* 3-Column Client / Venue / Contract Metadata Strip */}
          <div className="grid grid-cols-1 sm:grid-cols-3 divide-y sm:divide-y-0 sm:divide-x divide-slate-200 border-b border-slate-200 text-xs">
            <div className="p-4 sm:px-6 space-y-1">
              <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                Prepared For
              </div>
              <div className="font-bold text-slate-900 text-sm">{customer.name}</div>
              {customer.contactPerson && !customer.contactPerson.includes("@") && (
                <div className="text-slate-600">Attn: {customer.contactPerson}</div>
              )}
              {customer.email && <div className="text-slate-500">{customer.email}</div>}
            </div>

            <div className="p-4 sm:px-6 space-y-1">
              <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                Installation Site / Venue
              </div>
              <div className="font-semibold text-slate-800">
                {project.siteAddress || customer.addressLine1}
              </div>
              <div className="text-slate-500">
                Jurisdiction: {project.siteProvince} ({project.taxLabel})
              </div>
            </div>

            <div className="p-4 sm:px-6 space-y-1">
              <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                Project Reference
              </div>
              <div className="font-semibold text-slate-800">
                Sales Lead: Wajdi (AJ) Masad
              </div>
              <div className="text-slate-500">
                {project.poReference ? `Customer PO: ${project.poReference}` : "Terms: Net 30"}
              </div>
            </div>
          </div>

          {/* Itemized Breakdown */}
          <div className="p-6 sm:p-8 space-y-6">
            <div className="space-y-4">
              {[...groups.entries()].map(([groupName, groupItems]) => {
                const groupSubtotal = groupItems.reduce((a, i) => a + i.netCents, 0);
                return (
                  <div
                    key={groupName}
                    className="border border-slate-200 rounded-xs overflow-hidden"
                  >
                    <div className="bg-[#f8fafc] border-b border-slate-200 px-4 py-2.5 flex items-center justify-between text-xs">
                      <span className="font-bold uppercase tracking-wider text-slate-700">
                        {groupName}
                      </span>
                      <span className="font-bold text-slate-800 tabular-nums">
                        {formatCAD(groupSubtotal)}
                      </span>
                    </div>

                    <table className="w-full text-left border-collapse text-xs">
                      <thead>
                        <tr className="border-b border-slate-200 text-[11px] font-semibold text-slate-500 bg-white">
                          <th className="py-2.5 px-4 border-r border-slate-200">Description</th>
                          <th className="py-2.5 px-3 border-r border-slate-200 text-right w-20">Qty</th>
                          <th className="py-2.5 px-3 border-r border-slate-200 text-right w-28">
                            Unit Price
                          </th>
                          <th className="py-2.5 px-4 text-right w-28">Total</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200">
                        {groupItems.map((item) => (
                          <tr key={item.id}>
                            <td className="py-3 px-4 border-r border-slate-200 font-medium text-slate-800">
                              <div>{item.description}</div>
                              {item.rentalStartDate && (
                                <div className="text-[11px] text-slate-500 tabular-nums mt-0.5">
                                  Rental Period: {item.rentalStartDate} →{" "}
                                  {item.rentalEndDate || "Ongoing Monthly"}
                                </div>
                              )}
                            </td>
                            <td className="py-3 px-3 border-r border-slate-200 text-right tabular-nums text-slate-700">
                              {item.quantity}
                            </td>
                            <td className="py-3 px-3 border-r border-slate-200 text-right tabular-nums text-slate-700">
                              {formatCAD(item.unitPriceCents)}
                            </td>
                            <td className="py-3 px-4 text-right tabular-nums font-bold text-slate-900">
                              {formatCAD(item.netCents)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                );
              })}
            </div>

            {/* Scope Notes & Financial Summary */}
            <div className="grid grid-cols-1 md:grid-cols-12 gap-6 pt-2">
              <div className="md:col-span-7 text-xs text-slate-600 space-y-2">
                {project.description && (
                  <div>
                    <div className="font-bold uppercase tracking-wider text-slate-500 text-[10px] mb-0.5">
                      Scope &amp; Installation Notes
                    </div>
                    <p className="leading-relaxed text-slate-700">{project.description}</p>
                  </div>
                )}
                {project.customerTerms && (
                  <div className="pt-1">
                    <div className="font-bold uppercase tracking-wider text-slate-500 text-[10px] mb-0.5">
                      Terms &amp; Conditions
                    </div>
                    <p className="leading-relaxed text-slate-600">{project.customerTerms}</p>
                  </div>
                )}
              </div>

              <div className="md:col-span-5 rounded-xs bg-[#f8fafc] border border-slate-200 p-4 space-y-2 text-xs tabular-nums">
                <div className="flex justify-between text-slate-600">
                  <span>Subtotal</span>
                  <strong className="text-slate-800">{formatCAD(project.subtotalCents)}</strong>
                </div>
                <div className="flex justify-between text-slate-600">
                  <span>Tax ({project.taxLabel})</span>
                  <strong className="text-slate-800">{formatCAD(project.taxCents)}</strong>
                </div>
                <div className="flex justify-between pt-2 border-t border-slate-300 text-sm font-bold text-slate-900">
                  <span>Total Contract</span>
                  <span>{formatCAD(project.totalCents)}</span>
                </div>
                {paidCents > 0 && (
                  <div className="flex justify-between text-emerald-700 font-semibold">
                    <span>Amount Paid</span>
                    <span>{formatCAD(paidCents)}</span>
                  </div>
                )}
                <div className="flex justify-between pt-1.5 border-t border-slate-200 text-xs font-bold text-[#186ade]">
                  <span>Balance Due</span>
                  <span>{formatCAD(balanceCents)}</span>
                </div>
              </div>
            </div>

            {/* Interactive Signature & Payment Section */}
            <div className="pt-4 border-t border-slate-200">
              <CustomerQuoteApprovalCard
                projectId={project.id}
                invoiceId={invoice?.id ?? null}
                publicToken={project.publicToken}
                status={signed ? "approved" : project.status}
                approvedByName={project.approvedByName}
                approvedAt={project.approvedAt?.toISOString() ?? null}
                defaultSignerName={customer.contactPerson || customer.name}
                defaultSignerEmail={customer.email || ""}
                customerEmail={customer.email || ""}
                quoteNumber={project.quoteNumber}
                jobNumber={project.jobNumber}
                totalCents={project.totalCents}
                paidCents={paidCents}
                balanceCents={balanceCents}
                isPaid={isPaid}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
