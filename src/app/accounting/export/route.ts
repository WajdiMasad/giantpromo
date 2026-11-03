import { getCurrentUser } from "@/lib/auth";
import { getBatchContents, getPendingCapture, type PendingCapture } from "@/lib/invoicing";
import { centsToDecimalString } from "@/lib/money";
import { toCsv } from "@/lib/csv";

export const dynamic = "force-dynamic";

const money = (c: number) => centsToDecimalString(c);

function invoicesCsv(data: PendingCapture) {
  const rows: (string | number)[][] = [
    ["Invoice #", "Invoice date", "Due date", "Customer", "Reference / PO", "Description", "Net sales", "Tax", "HST", "Total", "Status"],
  ];
  for (const i of data.invoices) {
    rows.push([
      i.invoiceNumber,
      i.issueDate ?? "",
      i.dueDate ?? "",
      i.customerName,
      i.reference ?? "",
      i.description ?? "",
      money(i.subtotalCents),
      i.taxLabel,
      money(i.taxCents),
      money(i.totalCents),
      "ISSUED",
    ]);
  }
  for (const v of data.voids) {
    rows.push([
      v.invoiceNumber,
      v.issueDate ?? v.voidedAt?.toISOString().slice(0, 10) ?? "",
      v.dueDate ?? "",
      v.customerName,
      v.reference ?? "",
      `VOID: ${v.voidReason ?? ""}`,
      "0.00",
      v.taxLabel,
      "0.00",
      "0.00",
      "VOID",
    ]);
  }
  return toCsv(rows);
}

function paymentsCsv(data: PendingCapture) {
  const rows: (string | number)[][] = [
    ["Date received", "Invoice #", "Customer", "Amount", "HST included", "Method", "Reference"],
  ];
  for (const p of data.payments) {
    rows.push([
      p.receivedOn,
      p.invoiceNumber,
      p.customerName,
      money(p.amountCents),
      money(p.taxPortionCents),
      p.method,
      p.reference ?? "",
    ]);
  }
  return toCsv(rows);
}

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user || !["admin", "accountant"].includes(user.role)) {
    return new Response("Forbidden", { status: 403 });
  }

  const url = new URL(request.url);
  const type = url.searchParams.get("type") === "payments" ? "payments" : "invoices";
  const batchParam = url.searchParams.get("batch");
  const through = url.searchParams.get("through") ?? new Date().toISOString().slice(0, 10);

  let data: PendingCapture | null;
  let label: string;
  if (batchParam) {
    data = await getBatchContents(Number(batchParam));
    label = `batch-${batchParam}`;
  } else {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(through)) return new Response("Bad date", { status: 400 });
    data = await getPendingCapture(through);
    label = `pending-through-${through}`;
  }
  if (!data) return new Response("Not found", { status: 404 });

  const body = type === "payments" ? paymentsCsv(data) : invoicesCsv(data);
  return new Response(body, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="giant-${type}-${label}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
