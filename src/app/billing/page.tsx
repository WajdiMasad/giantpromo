import Link from "next/link";
import { asc, desc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import {
  customers,
  invoices,
  payments,
  projects,
  recurringBillingBatchItems,
  recurringBillingBatches,
  recurringBillingPlans,
} from "@/db/schema";
import { RecurringBillingClient } from "@/components/RecurringBillingClient";
import { BillingLedgerClient, type InvoiceRow } from "@/components/BillingLedgerClient";

export const dynamic = "force-dynamic";

export default async function BillingPage(props: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const { tab: tabParam } = await props.searchParams;
  const activeTab = tabParam ?? "invoices";

  const db = await getDb();

  // 1. Fetch Invoices & Payments for the AR Ledger
  const allInvoices = await db
    .select({
      invoice: invoices,
      customer: customers,
      project: projects,
    })
    .from(invoices)
    .innerJoin(customers, eq(invoices.customerId, customers.id))
    .leftJoin(projects, eq(invoices.projectId, projects.id))
    .orderBy(desc(invoices.id));

  const allPayments = await db.select().from(payments);
  const today = new Date().toISOString().slice(0, 10);
  const DAY_MS = 86_400_000;

  const invoiceRows: InvoiceRow[] = allInvoices.map(({ invoice, customer, project }) => {
    const invPayments = allPayments.filter((p) => p.invoiceId === invoice.id);
    const paidCents = invPayments.reduce((a, p) => a + p.amountCents, 0);
    const balanceCents =
      invoice.status === "void" ? 0 : Math.max(0, invoice.totalCents - paidCents);

    let daysOverdue = 0;
    let isOverdue = false;
    let agingBucket: "current" | "1_30" | "31_60" | "60_plus" = "current";

    if (invoice.dueDate && invoice.status === "issued" && balanceCents > 0) {
      if (invoice.dueDate < today) {
        isOverdue = true;
        daysOverdue = Math.floor(
          (new Date(today).getTime() - new Date(invoice.dueDate).getTime()) / DAY_MS
        );
        if (daysOverdue <= 30) agingBucket = "1_30";
        else if (daysOverdue <= 60) agingBucket = "31_60";
        else agingBucket = "60_plus";
      }
    }

    return {
      id: invoice.id,
      invoiceNumber: invoice.invoiceNumber,
      projectId: invoice.projectId,
      customerId: customer.id,
      customerName: customer.name,
      customerEmail: customer.email,
      projectTitle: project?.title ?? invoice.description ?? "Job Invoicing",
      status: invoice.status,
      issueDate: invoice.issueDate,
      dueDate: invoice.dueDate,
      totalCents: invoice.totalCents,
      paidCents,
      balanceCents,
      isOverdue,
      daysOverdue,
      agingBucket,
      paymentsCount: invPayments.length,
    };
  });

  // 2. Fetch Recurring Plans & Batches for the Monthly Sign Leases Runner
  const planRows = await db
    .select({
      plan: recurringBillingPlans,
      customer: customers,
    })
    .from(recurringBillingPlans)
    .innerJoin(customers, eq(recurringBillingPlans.customerId, customers.id))
    .orderBy(desc(recurringBillingPlans.status), asc(customers.name));

  const batches = await db
    .select()
    .from(recurringBillingBatches)
    .orderBy(desc(recurringBillingBatches.monthKey));

  const batchItems = await db
    .select({
      item: recurringBillingBatchItems,
      plan: recurringBillingPlans,
      customer: customers,
    })
    .from(recurringBillingBatchItems)
    .innerJoin(
      recurringBillingPlans,
      eq(recurringBillingBatchItems.planId, recurringBillingPlans.id)
    )
    .innerJoin(customers, eq(recurringBillingPlans.customerId, customers.id))
    .orderBy(asc(customers.name));

  const customerList = await db
    .select({
      id: customers.id,
      name: customers.name,
      province: customers.province,
    })
    .from(customers)
    .orderBy(asc(customers.name));

  return (
    <div className="flex-1 flex flex-col min-h-0">
      {/* Goodshuffle Pro Top Bar */}
      <div className="bg-white border-b border-slate-200 px-6 h-16 flex flex-wrap items-center justify-between gap-4 shrink-0">
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-normal text-slate-600 tracking-tight">
            Billing &amp; Receivables
          </h1>
        </div>

        {/* Primary Navigation Tabs */}
        <div className="flex items-center gap-1">
          <Link
            href="/billing?tab=invoices"
            className={`px-3.5 py-1.5 text-xs font-semibold rounded-xs transition ${
              activeTab !== "recurring"
                ? "bg-[#186ade] text-white shadow-2xs"
                : "text-slate-600 hover:bg-slate-100"
            }`}
          >
            Accounts Receivable &amp; Invoices ({invoiceRows.length})
          </Link>
          <Link
            href="/billing?tab=recurring"
            className={`px-3.5 py-1.5 text-xs font-semibold rounded-xs transition ${
              activeTab === "recurring"
                ? "bg-[#186ade] text-white shadow-2xs"
                : "text-slate-600 hover:bg-slate-100"
            }`}
          >
            Monthly Sign Leases ({planRows.length})
          </Link>
        </div>
      </div>

      {/* Tab Content */}
      <div className="p-6 max-w-7xl w-full mx-auto">
        {activeTab !== "recurring" ? (
          <BillingLedgerClient invoices={invoiceRows} />
        ) : (
          <RecurringBillingClient
            plans={planRows.map(({ plan, customer }) => ({
              id: plan.id,
              customerName: customer.name,
              rentalId: plan.rentalId,
              kind: plan.kind,
              title: plan.title,
              description: plan.description,
              poReference: plan.poReference ?? "",
              province: plan.province,
              monthlyAmountCents: plan.monthlyAmountCents,
              startDate: plan.startDate,
              endDate: plan.endDate,
              status: plan.status,
            }))}
            batches={batches.map((b) => ({
              id: b.id,
              monthKey: b.monthKey,
              invoiceDate: b.invoiceDate,
              status: b.status,
              isDryRun: b.isDryRun,
              approvedAt: b.approvedAt?.toISOString() ?? null,
              executedAt: b.executedAt?.toISOString() ?? null,
              items: batchItems
                .filter((x) => x.item.batchId === b.id)
                .map(({ item, customer, plan }) => ({
                  id: item.id,
                  planId: item.planId,
                  customerName: customer.name,
                  planKind: plan.kind,
                  description: item.description,
                  netCents: item.netCents,
                  taxCents: item.taxCents,
                  totalCents: item.totalCents,
                  isHalfMonthProrated: item.isHalfMonthProrated,
                  changeFlag: item.changeFlag,
                  skipThisMonth: item.skipThisMonth,
                  invoiceId: item.invoiceId,
                  invoiceNumber: item.invoiceNumber,
                  emailedAt: item.emailedAt?.toISOString() ?? null,
                })),
            }))}
            customers={customerList}
          />
        )}
      </div>
    </div>
  );
}
