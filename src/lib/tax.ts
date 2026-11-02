import { type Cents, divRoundHalfUp, lineNet, sum } from "./money";

export type ProvinceCode =
  | "AB"
  | "BC"
  | "MB"
  | "NB"
  | "NL"
  | "NS"
  | "NT"
  | "NU"
  | "ON"
  | "PE"
  | "QC"
  | "SK"
  | "YT";

export interface ProvinceTaxInfo {
  code: ProvinceCode;
  name: string;
  /** Rate in parts per million (1_000_000 = 100%). Exact for QC 14.975% = 149_750. */
  ratePpm: number;
  /** Decimal rate for display / Sage (e.g. 0.14 for 14%). */
  rateDecimal: number;
  /** Human-readable rate label (e.g. "14% HST", "14.975% GST + QST"). */
  label: string;
  taxType: "GST" | "HST" | "GST + PST" | "GST + QST";
}

const PPM = 1_000_000;

export const CANADIAN_TAX_RATES: Record<ProvinceCode, ProvinceTaxInfo> = {
  AB: { code: "AB", name: "Alberta", ratePpm: 50_000, rateDecimal: 0.05, label: "5% GST", taxType: "GST" },
  BC: { code: "BC", name: "British Columbia", ratePpm: 120_000, rateDecimal: 0.12, label: "12% GST + PST", taxType: "GST + PST" },
  MB: { code: "MB", name: "Manitoba", ratePpm: 120_000, rateDecimal: 0.12, label: "12% GST + PST", taxType: "GST + PST" },
  NB: { code: "NB", name: "New Brunswick", ratePpm: 150_000, rateDecimal: 0.15, label: "15% HST", taxType: "HST" },
  NL: { code: "NL", name: "Newfoundland and Labrador", ratePpm: 150_000, rateDecimal: 0.15, label: "15% HST", taxType: "HST" },
  NS: { code: "NS", name: "Nova Scotia", ratePpm: 140_000, rateDecimal: 0.14, label: "14% HST", taxType: "HST" },
  NT: { code: "NT", name: "Northwest Territories", ratePpm: 50_000, rateDecimal: 0.05, label: "5% GST", taxType: "GST" },
  NU: { code: "NU", name: "Nunavut", ratePpm: 50_000, rateDecimal: 0.05, label: "5% GST", taxType: "GST" },
  ON: { code: "ON", name: "Ontario", ratePpm: 130_000, rateDecimal: 0.13, label: "13% HST", taxType: "HST" },
  PE: { code: "PE", name: "Prince Edward Island", ratePpm: 150_000, rateDecimal: 0.15, label: "15% HST", taxType: "HST" },
  QC: { code: "QC", name: "Quebec", ratePpm: 149_750, rateDecimal: 0.14975, label: "14.975% GST + QST", taxType: "GST + QST" },
  SK: { code: "SK", name: "Saskatchewan", ratePpm: 110_000, rateDecimal: 0.11, label: "11% GST + PST", taxType: "GST + PST" },
  YT: { code: "YT", name: "Yukon", ratePpm: 50_000, rateDecimal: 0.05, label: "5% GST", taxType: "GST" },
};

export const PROVINCE_CODES = Object.keys(CANADIAN_TAX_RATES) as ProvinceCode[];

export function isProvinceCode(code: string): code is ProvinceCode {
  return Object.prototype.hasOwnProperty.call(CANADIAN_TAX_RATES, code.toUpperCase());
}

export function getProvinceTax(code: string): ProvinceTaxInfo {
  const upper = code.trim().toUpperCase();
  if (!isProvinceCode(upper)) {
    throw new Error(`Unknown Canadian province/territory code: "${code}"`);
  }
  return CANADIAN_TAX_RATES[upper];
}

/** Calculate tax in cents for a given net amount in cents, using half-up rounding. */
export function calculateTaxCents(
  netCents: Cents,
  province: ProvinceCode | string,
  options?: { taxExempt?: boolean }
): Cents {
  if (options?.taxExempt) return 0;
  const info = getProvinceTax(province);
  return divRoundHalfUp(netCents * info.ratePpm, PPM);
}

export interface PricedLineInput {
  description: string;
  quantity: string | number;
  unitPriceCents: Cents;
  taxExempt?: boolean;
}

export interface PricedLineResult {
  description: string;
  quantity: string;
  unitPriceCents: Cents;
  netCents: Cents;
  taxCents: Cents;
  totalCents: Cents;
  taxExempt: boolean;
}

export interface DocumentTotals {
  province: ProvinceCode;
  taxLabel: string;
  taxRatePpm: number;
  lines: PricedLineResult[];
  subtotalCents: Cents;
  taxCents: Cents;
  totalCents: Cents;
}

/**
 * Compute per-line net/tax/total and document totals using exact integer cents.
 * Matches Sage's per-line tax calculation so app totals and Sage totals never drift.
 */
export function calculateDocumentTotals(
  lines: readonly PricedLineInput[],
  province: ProvinceCode | string,
  options?: { customerTaxExempt?: boolean }
): DocumentTotals {
  const info = getProvinceTax(province);
  const customerExempt = Boolean(options?.customerTaxExempt);

  const computedLines: PricedLineResult[] = lines.map((line) => {
    const netCents = lineNet(line.quantity, line.unitPriceCents);
    const exempt = customerExempt || Boolean(line.taxExempt);
    const taxCents = calculateTaxCents(netCents, info.code, { taxExempt: exempt });
    return {
      description: line.description,
      quantity: String(line.quantity),
      unitPriceCents: line.unitPriceCents,
      netCents,
      taxCents,
      totalCents: netCents + taxCents,
      taxExempt: exempt,
    };
  });

  const subtotalCents = sum(computedLines.map((l) => l.netCents));
  const taxCents = sum(computedLines.map((l) => l.taxCents));

  return {
    province: info.code,
    taxLabel: customerExempt ? "Tax Exempt (0%)" : info.label,
    taxRatePpm: customerExempt ? 0 : info.ratePpm,
    lines: computedLines,
    subtotalCents,
    taxCents,
    totalCents: subtotalCents + taxCents,
  };
}
