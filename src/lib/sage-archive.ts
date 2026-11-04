import fs from "node:fs";
import path from "node:path";

export interface HistoricalSageLineItem {
  description: string;
  quantity: number;
  unitPriceCents: number;
  netCents: number;
  taxCents: number;
  totalCents: number;
}

export interface HistoricalSageInvoice {
  invoiceNumber: string;
  customerSageId: string;
  contactName: string;
  reference: string;
  status: "PAID" | "UNPAID" | "PART_PAID" | "VOID" | string;
  date: string;
  dueDate: string;
  subtotalCents: number;
  taxCents: number;
  totalCents: number;
  lines: HistoricalSageLineItem[];
  /** Precomputed lowercase search blob (invoice #, customer, reference, all line descriptions) */
  _searchBlob?: string;
}

interface SageArchiveCache {
  all: HistoricalSageInvoice[];
  byCustomerSageId: Map<string, HistoricalSageInvoice[]>;
  byContactNameLower: Map<string, HistoricalSageInvoice[]>;
  byInvoiceNumber: Map<string, HistoricalSageInvoice>;
  years: string[];
  statusCounts: Record<string, number>;
}

declare global {
  var __giantOsSageArchiveCache: SageArchiveCache | undefined;
}

function getArchiveCache(): SageArchiveCache {
  if (globalThis.__giantOsSageArchiveCache) {
    return globalThis.__giantOsSageArchiveCache;
  }

  const jsonPath = path.join(process.cwd(), "src", "db", "sage-historical-invoices.json");
  const raw = fs.readFileSync(jsonPath, "utf-8");
  const all = JSON.parse(raw) as HistoricalSageInvoice[];

  const byCustomerSageId = new Map<string, HistoricalSageInvoice[]>();
  const byContactNameLower = new Map<string, HistoricalSageInvoice[]>();
  const byInvoiceNumber = new Map<string, HistoricalSageInvoice>();
  const yearsSet = new Set<string>();
  const statusCounts: Record<string, number> = {
    ALL: all.length,
    PAID: 0,
    UNPAID: 0,
    PART_PAID: 0,
    VOID: 0,
  };

  for (const inv of all) {
    const lineText = inv.lines.map((l) => l.description).join(" ");
    inv._searchBlob =
      `${inv.invoiceNumber} ${inv.contactName} ${inv.customerSageId} ${inv.reference} ${inv.date} ${lineText}`.toLowerCase();

    byInvoiceNumber.set(inv.invoiceNumber, inv);

    if (inv.customerSageId) {
      const list = byCustomerSageId.get(inv.customerSageId);
      if (list) list.push(inv);
      else byCustomerSageId.set(inv.customerSageId, [inv]);
    }

    const cnameKey = inv.contactName.trim().toLowerCase();
    if (cnameKey) {
      const list = byContactNameLower.get(cnameKey);
      if (list) list.push(inv);
      else byContactNameLower.set(cnameKey, [inv]);
    }

    if (inv.date && inv.date.length >= 4) {
      yearsSet.add(inv.date.slice(0, 4));
    }

    statusCounts[inv.status] = (statusCounts[inv.status] ?? 0) + 1;
  }

  const years = Array.from(yearsSet).sort((a, b) => b.localeCompare(a));

  const cache: SageArchiveCache = {
    all,
    byCustomerSageId,
    byContactNameLower,
    byInvoiceNumber,
    years,
    statusCounts,
  };
  globalThis.__giantOsSageArchiveCache = cache;
  return cache;
}

export function getHistoricalInvoicesForCustomer(customer: {
  sageId?: string | null;
  name: string;
  companyName?: string | null;
}): HistoricalSageInvoice[] {
  const cache = getArchiveCache();
  if (customer.sageId) {
    const byId = cache.byCustomerSageId.get(customer.sageId);
    if (byId && byId.length > 0) return byId;
  }
  const compKey = (customer.companyName || customer.name).trim().toLowerCase();
  return (
    cache.byContactNameLower.get(compKey) ??
    cache.byContactNameLower.get(customer.name.trim().toLowerCase()) ??
    []
  );
}

export function getHistoricalInvoiceByNumber(
  invoiceNumber: string
): HistoricalSageInvoice | undefined {
  return getArchiveCache().byInvoiceNumber.get(invoiceNumber.trim());
}

export interface SearchHistoricalInvoicesParams {
  query?: string;
  status?: string;
  year?: string;
  page?: number;
  pageSize?: number;
}

export function searchHistoricalSageInvoices(params: SearchHistoricalInvoicesParams) {
  const cache = getArchiveCache();
  const q = (params.query ?? "").trim().toLowerCase();
  const terms = q ? q.split(/\s+/).filter(Boolean) : [];
  const status = (params.status ?? "ALL").toUpperCase();
  const year = (params.year ?? "ALL").trim();
  const pageSize = params.pageSize ?? 50;
  const requestedPage = Math.max(1, params.page ?? 1);

  const matches: HistoricalSageInvoice[] = [];
  let totalNetCents = 0;
  let totalTaxCents = 0;
  let totalGrossCents = 0;

  for (const inv of cache.all) {
    if (status !== "ALL" && inv.status !== status) continue;
    if (year !== "ALL" && !inv.date.startsWith(year)) continue;
    if (terms.length > 0) {
      const blob = inv._searchBlob ?? "";
      let allMatched = true;
      for (const t of terms) {
        if (!blob.includes(t)) {
          allMatched = false;
          break;
        }
      }
      if (!allMatched) continue;
    }

    matches.push(inv);
    if (inv.status !== "VOID") {
      totalNetCents += inv.subtotalCents;
      totalTaxCents += inv.taxCents;
      totalGrossCents += inv.totalCents;
    }
  }

  const totalCount = matches.length;
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  const page = Math.min(requestedPage, totalPages);
  const start = (page - 1) * pageSize;
  const rows = matches.slice(start, start + pageSize);

  return {
    rows,
    totalCount,
    page,
    pageSize,
    totalPages,
    totalNetCents,
    totalTaxCents,
    totalGrossCents,
    years: cache.years,
    statusCounts: cache.statusCounts,
  };
}
