import { type Cents, toCents } from "./money";

export interface PricingMaterialConfig {
  materialKey: string;
  name: string;
  costPerFtCents: Cents;
  usableWidthInches: number;
  markupMultiplier: number;
  supplier: string;
  notes: string;
}

export interface PricingSettingsConfig {
  laborRateCentsPerHr: Cents;
  inkRateCentsPerCc: Cents;
  inkConsumptionCcPerFt: number;
  laminateRateCentsPerFt: Cents;
  laminateWasteFt: number;
}

export interface CorexSizeConfig {
  sizeKey: string;
  sqft: number;
  baseCostCents: Cents;
  markup: number;
}

export const DEFAULT_PRICING_SETTINGS: PricingSettingsConfig = {
  laborRateCentsPerHr: 2500, // $25.00/hr
  inkRateCentsPerCc: 30, // $0.30/cc
  inkConsumptionCcPerFt: 1.2,
  laminateRateCentsPerFt: 200, // $2.00/ft
  laminateWasteFt: 4.0,
};

export const DEFAULT_MATERIALS: PricingMaterialConfig[] = [
  { materialKey: "vinyl_ij35c", name: "3M IJ35C Scotchal", costPerFtCents: 200, usableWidthInches: 50, markupMultiplier: 3.4, supplier: "ND Graphics/Grimco", notes: "" },
  { materialKey: "vinyl_controltac", name: "3M ControlTac IJ180MC-10", costPerFtCents: 650, usableWidthInches: 50, markupMultiplier: 2.7, supplier: "ND Graphics/Grimco", notes: "Wrap vinyl" },
  { materialKey: "vinyl_contravision", name: "ContraVision Window Perf", costPerFtCents: 415, usableWidthInches: 50, markupMultiplier: 3.4, supplier: "", notes: "70/30 window perf" },
  { materialKey: "vinyl_orajet3641", name: "ORAJET 3641 Soft PVC Film", costPerFtCents: 200, usableWidthInches: 50, markupMultiplier: 3.5, supplier: "", notes: "Calendered PVC" },
  { materialKey: "vinyl_briteline", name: "Briteline Translucent Film", costPerFtCents: 350, usableWidthInches: 50, markupMultiplier: 3.4, supplier: "", notes: "Backlit material" },
  { materialKey: "vinyl_oralite5600", name: "Oralite 5600 Reflective", costPerFtCents: 1700, usableWidthInches: 50, markupMultiplier: 2.7, supplier: "", notes: "Reflective white" },
  { materialKey: "vinyl_drytac", name: "Drytac Wall Vinyl", costPerFtCents: 400, usableWidthInches: 50, markupMultiplier: 3.4, supplier: "", notes: "Wall application" },
  { materialKey: "banner_13oz", name: "13oz Duratex Banner", costPerFtCents: 80, usableWidthInches: 50, markupMultiplier: 6.5, supplier: "", notes: "Add $10/ft for hemming/grommets" },
  { materialKey: "window_diamond", name: "Diamond Etch 125 2mil", costPerFtCents: 750, usableWidthInches: 48, markupMultiplier: 3.4, supplier: "Grimco", notes: "Frosted window film" },
  { materialKey: "window_tint", name: "Madico Optivision", costPerFtCents: 1100, usableWidthInches: 60, markupMultiplier: 3.4, supplier: "Madico", notes: "Window tint" },
];

export const DEFAULT_COREX_SIZES: CorexSizeConfig[] = [
  { sizeKey: "18x24", sqft: 3.0, baseCostCents: 1500, markup: 4.0 },
  { sizeKey: "24x36", sqft: 6.0, baseCostCents: 2400, markup: 4.0 },
  { sizeKey: "24x48", sqft: 8.0, baseCostCents: 2800, markup: 4.0 },
  { sizeKey: "36x48", sqft: 12.0, baseCostCents: 3600, markup: 4.0 },
  { sizeKey: "48x48", sqft: 16.0, baseCostCents: 4500, markup: 4.0 },
  { sizeKey: "48x60", sqft: 20.0, baseCostCents: 5500, markup: 4.0 },
  { sizeKey: "48x72", sqft: 24.0, baseCostCents: 6500, markup: 4.0 },
  { sizeKey: "48x84", sqft: 28.0, baseCostCents: 7500, markup: 4.0 },
  { sizeKey: "48x96", sqft: 32.0, baseCostCents: 8500, markup: 4.0 },
];

export interface MaterialQuoteBreakdown {
  piecesNeeded: number;
  linearFeet: number;
  materialCostCents: Cents;
  inkCostCents: Cents;
  laborCostCents: Cents;
  printCostCents: Cents;
  laminateCostCents: Cents;
  joiningLaborCostCents: Cents;
  laminatingLaborCostCents: Cents;
  grommetingLaborCostCents: Cents;
  subtotalCostCents: Cents;
  finalPriceCents: Cents;
  profitCents: Cents;
  profitMarginPct: number;
}

/**
 * Port of Giant Promotions' material quote formula (pricing.py:178-240).
 */
export function calculateMaterialQuote(params: {
  material: PricingMaterialConfig;
  settings?: PricingSettingsConfig;
  widthFt: number;
  heightFt: number;
  needsLaminate?: boolean;
  needsGrommets?: boolean;
}): MaterialQuoteBreakdown {
  const {
    material,
    settings = DEFAULT_PRICING_SETTINGS,
    widthFt,
    heightFt,
    needsLaminate = false,
    needsGrommets = false,
  } = params;

  if (widthFt <= 0 || heightFt <= 0) {
    throw new Error("Width and height must be greater than zero");
  }
  if (material.usableWidthInches <= 0) {
    throw new Error("Material usableWidthInches must be greater than zero");
  }

  const heightInches = heightFt * 12;
  const piecesNeeded = Math.ceil(heightInches / material.usableWidthInches);
  const linearFeet = widthFt * piecesNeeded;

  const costPerFt = material.costPerFtCents / 100;
  const laborRate = settings.laborRateCentsPerHr / 100;
  const inkRate = settings.inkRateCentsPerCc / 100;
  const laminateRate = settings.laminateRateCentsPerFt / 100;

  const materialCost = linearFeet * costPerFt;
  const inkCost = linearFeet * settings.inkConsumptionCcPerFt * inkRate;
  const baseLaborHours = linearFeet / 25.0;
  const laborCost = baseLaborHours * laborRate;
  const printCost = (linearFeet / 30.0) * laborRate;

  const laminateCost = needsLaminate
    ? (linearFeet + settings.laminateWasteFt) * laminateRate
    : 0;

  const isBanner = material.materialKey.includes("banner");
  const joiningHours = isBanner && piecesNeeded > 1 ? (3 * widthFt) / 60 : 0;
  const laminatingHours = !isBanner && needsLaminate ? (3 * widthFt) / 60 : 0;
  const grommetingHours = isBanner && needsGrommets ? (1 * widthFt) / 60 : 0;

  const joiningLaborCost = joiningHours * laborRate;
  const laminatingLaborCost = laminatingHours * laborRate;
  const grommetingLaborCost = grommetingHours * laborRate;

  const subtotal =
    materialCost +
    inkCost +
    laborCost +
    printCost +
    laminateCost +
    joiningLaborCost +
    laminatingLaborCost +
    grommetingLaborCost;

  const finalPrice = subtotal * material.markupMultiplier;
  const profit = finalPrice - subtotal;
  const profitMarginPct = finalPrice > 0 ? Math.round((profit / finalPrice) * 10000) / 100 : 0;

  return {
    piecesNeeded,
    linearFeet,
    materialCostCents: toCents(materialCost),
    inkCostCents: toCents(inkCost),
    laborCostCents: toCents(laborCost),
    printCostCents: toCents(printCost),
    laminateCostCents: toCents(laminateCost),
    joiningLaborCostCents: toCents(joiningLaborCost),
    laminatingLaborCostCents: toCents(laminatingLaborCost),
    grommetingLaborCostCents: toCents(grommetingLaborCost),
    subtotalCostCents: toCents(subtotal),
    finalPriceCents: toCents(finalPrice),
    profitCents: toCents(finalPrice) - toCents(subtotal),
    profitMarginPct,
  };
}

/**
 * Recurring billing half-month rule (plan §2c):
 * - Starts on the 1st of the month -> full monthly rate
 * - Starts on any other day (2nd..31st) -> half a month for that partial month,
 *   then full monthly rate starting the next 1st.
 */
export function calculateInitialRecurringChargeCents(
  monthlyRateCents: Cents,
  startDateIso: string
): { amountCents: Cents; isHalfMonth: boolean } {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(startDateIso.trim());
  if (!match) throw new Error(`Invalid ISO date: "${startDateIso}"`);
  const day = Number(match[3]);
  if (day < 1 || day > 31) throw new Error(`Invalid day of month in "${startDateIso}"`);
  if (day === 1) {
    return { amountCents: monthlyRateCents, isHalfMonth: false };
  }
  return {
    amountCents: Math.round(monthlyRateCents / 2),
    isHalfMonth: true,
  };
}
