import { asc, desc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import {
  customers,
  recurringBillingBatchItems,
  recurringBillingBatches,
  recurringBillingPlans,
} from "@/db/schema";
import { RecurringBillingClient } from "@/components/RecurringBillingClient";

export const dynamic = "force-dynamic";

export default async function RecurringBillingPage() {
  const db = await getDb();

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
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">
          Recurring Billing Engine (Rentals & Monthly Services)
        </h1>
        <p className="text-sm text-slate-600 mt-0.5">
          Bills in advance on the 1st. Mid-month starts charge half a month first. Returning equipment stops its plan automatically. Nothing goes out without a person clicking Approve & Send.
        </p>
      </div>

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
              sageInvoiceNumber: item.sageInvoiceNumber,
            })),
        }))}
        customers={customerList}
      />
    </div>
  );
}
