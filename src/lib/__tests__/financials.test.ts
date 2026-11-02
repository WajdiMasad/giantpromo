import { describe, expect, it } from "vitest";
import { centsToDecimalString, formatCAD, lineNet, toCents } from "../money";
import {
  CANADIAN_TAX_RATES,
  calculateDocumentTotals,
  calculateTaxCents,
  getProvinceTax,
} from "../tax";
import {
  DEFAULT_MATERIALS,
  calculateInitialRecurringChargeCents,
  calculateMaterialQuote,
} from "../pricing";

describe("money helpers", () => {
  it("converts decimal strings and numbers to exact integer cents", () => {
    expect(toCents("0")).toBe(0);
    expect(toCents("150.00")).toBe(15000);
    expect(toCents("$1,234.56")).toBe(123456);
    expect(toCents(19.99)).toBe(1999);
    expect(toCents("10.005")).toBe(1001); // half-up
  });

  it("computes line net with fractional quantities without float drift", () => {
    // 3 * $19.99 = $59.97
    expect(lineNet(3, 1999)).toBe(5997);
    // 2.5 * $15.00 = $37.50
    expect(lineNet("2.5", 1500)).toBe(3750);
    // 0.1 + 0.2 float classic trap: 0.3 * $10.00 = $3.00
    expect(lineNet("0.3", 1000)).toBe(300);
  });

  it("formats CAD and decimal strings cleanly", () => {
    expect(centsToDecimalString(15000)).toBe("150.00");
    expect(centsToDecimalString(5)).toBe("0.05");
    expect(formatCAD(123456)).toContain("1,234.56");
  });
});

describe("Canadian tax engine (2026 rates)", () => {
  it("has all 13 provinces and territories with accurate 2026 rates", () => {
    expect(Object.keys(CANADIAN_TAX_RATES)).toHaveLength(13);
    expect(getProvinceTax("NS").rateDecimal).toBe(0.14); // 14% NS HST
    expect(getProvinceTax("ON").rateDecimal).toBe(0.13);
    expect(getProvinceTax("NB").rateDecimal).toBe(0.15);
    expect(getProvinceTax("QC").rateDecimal).toBe(0.14975); // exact 14.975%
    expect(getProvinceTax("AB").rateDecimal).toBe(0.05);
  });

  it("calculates exact tax per province and respects tax exemption", () => {
    // $100.00 in NS -> $14.00
    expect(calculateTaxCents(100_00, "NS")).toBe(14_00);
    // $1,000.00 in QC -> $149.75 (not 150.00!)
    expect(calculateTaxCents(1000_00, "QC")).toBe(149_75);
    // Tax exempt
    expect(calculateTaxCents(100_00, "NS", { taxExempt: true })).toBe(0);
  });

  it("computes multi-line document totals per line to match Sage Accounting", () => {
    const doc = calculateDocumentTotals(
      [
        { description: "Mobile Sign Rental - Monthly", quantity: 1, unitPriceCents: 150_00 },
        { description: "Custom Vinyl Banner 4x8", quantity: 2, unitPriceCents: 125_50 },
      ],
      "NS"
    );
    expect(doc.subtotalCents).toBe(401_00); // 150 + 251
    expect(doc.taxCents).toBe(56_14); // 21.00 + 35.14
    expect(doc.totalCents).toBe(457_14);
    expect(doc.taxLabel).toBe("14% HST");
  });
});

describe("pricing & recurring billing rules", () => {
  it("calculates vinyl and banner quotes matching the legacy formula", () => {
    const ij35c = DEFAULT_MATERIALS.find((m) => m.materialKey === "vinyl_ij35c")!;
    const quote = calculateMaterialQuote({
      material: ij35c,
      widthFt: 8,
      heightFt: 4,
      needsLaminate: true,
    });
    // 4ft = 48" <= 50" usable width -> 1 piece, 8 linear ft
    expect(quote.piecesNeeded).toBe(1);
    expect(quote.linearFeet).toBe(8);
    expect(quote.finalPriceCents).toBeGreaterThan(quote.subtotalCostCents);
  });

  it("applies the half-month rule for mid-month starts and full month on the 1st", () => {
    expect(calculateInitialRecurringChargeCents(150_00, "2026-12-01")).toEqual({
      amountCents: 150_00,
      isHalfMonth: false,
    });
    expect(calculateInitialRecurringChargeCents(150_00, "2026-11-15")).toEqual({
      amountCents: 75_00,
      isHalfMonth: true,
    });
  });
});
