import { notFound } from "next/navigation";
import { asc, eq } from "drizzle-orm";
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
    groups.set(it.groupName || "", [...(groups.get(it.groupName || "") ?? []), it]);
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
    <div className="min-h-screen bg-slate-950 print:bg-white text-slate-900 py-8 print:py-0 px-4 sm:px-6 print:px-0">
      <div className="max-w-3xl mx-auto space-y-6 print:space-y-4 print:max-w-none">
        {/* Branded Header */}
        <div className="rounded-3xl bg-slate-900 print:bg-white border border-slate-800 print:border-b print:border-slate-300 p-6 sm:p-8 text-white print:text-slate-900 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div className="h-12 w-12 rounded-2xl bg-amber-500 text-slate-950 font-black flex items-center justify-center text-xl print:border print:border-slate-900">
              GP
            </div>
            <div>
              <div className="font-bold text-lg tracking-tight print:text-xl">GIANT PROMOTIONS LIMITED</div>
              <div className="text-xs text-slate-400 print:text-slate-600">
                3797 Mackintosh Street, Halifax, NS B3K 5A7 • 902-456-6487 • HST #888811650 RT 0001
              </div>
            </div>
          </div>
          <div className="sm:text-right">
            <div className="font-mono text-sm font-bold text-amber-400 print:text-slate-950">
              {project.jobNumber ? `JOB #${project.jobNumber} • ${project.quoteNumber}` : project.quoteNumber}
            </div>
            <div className="text-xs text-slate-400 print:text-slate-600">
              {signed ? "Signed & Authorized" : `Valid until ${project.validUntil || "30 days"}`}
            </div>
          </div>
        </div>

        {/* Main Quote Card */}
        <div className="rounded-3xl bg-white p-6 sm:p-8 shadow-xl print:shadow-none print:p-0 space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 border-b border-slate-100 pb-6">
            <div>
              <div className="text-xs font-semibold uppercase tracking-wider text-slate-400">Prepared for</div>
              <h1 className="text-xl sm:text-2xl font-bold text-slate-900 mt-1">{customer.name}</h1>
              <div className="text-sm text-slate-600 mt-1">
                {project.siteAddress} ({project.siteProvince})
              </div>
              {project.poReference && (
                <div className="text-xs font-medium text-slate-500 mt-1">
                  Customer reference / PO: <strong>{project.poReference}</strong>
                </div>
              )}
            </div>
            <div className="sm:text-right">
              <div className="text-xs font-semibold uppercase tracking-wider text-slate-400">Project</div>
              <div className="text-base font-bold text-slate-900 mt-1">{project.title}</div>
            </div>
          </div>

          {/* Line Items */}
          <div className="space-y-4">
            <div className="text-xs font-semibold uppercase tracking-wider text-slate-400">Itemized breakdown</div>
            {[...groups.entries()].map(([groupName, groupItems]) => (
              <div key={groupName || "_"} className="space-y-2">
                {groupName && (
                  <div className="text-xs font-bold text-slate-600">{groupName}</div>
                )}
                <div className="divide-y divide-slate-100 border border-slate-200 rounded-2xl overflow-hidden">
                  {groupItems.map((item) => (
                    <div
                      key={item.id}
                      className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-2 bg-white"
                    >
                      <div>
                        <div className="font-semibold text-sm text-slate-900">{item.description}</div>
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
            ))}
          </div>

          {/* Totals */}
          <div className="rounded-2xl bg-slate-50 p-5 border border-slate-200/80 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="text-xs text-slate-600 space-y-1 max-w-md">
              {project.description && (
                <div>
                  <strong className="text-slate-900">Scope notes:</strong> {project.description}
                </div>
              )}
              {project.customerTerms && (
                <div>
                  <strong className="text-slate-900">Terms:</strong> {project.customerTerms}
                </div>
              )}
              <div className="text-[11px] text-slate-400 pt-1">GST/HST #888811650 RT 0001</div>
            </div>

            <div className="space-y-1 sm:text-right shrink-0">
              <div className="text-xs text-slate-600">
                Subtotal: <strong>{formatCAD(project.subtotalCents)}</strong>
              </div>
              <div className="text-xs text-slate-600">
                Tax ({project.taxLabel}): <strong>{formatCAD(project.taxCents)}</strong>
              </div>
              <div className="text-xl font-black text-slate-900 pt-1">
                Total: {formatCAD(project.totalCents)}
              </div>
            </div>
          </div>

          {/* Interactive Approval & Stripe Payment Component */}
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
  );
}
