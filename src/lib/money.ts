/**
 * Money helpers. All amounts are integer cents (CAD) — never floats.
 * Quantities are decimal strings/numbers, handled internally in thousandths.
 */

export type Cents = number;

const QTY_SCALE = 1000; // quantities support up to 3 decimals (e.g. 2.125 sq ft)

/** Round half away from zero for an integer numerator/denominator pair. */
export function divRoundHalfUp(numerator: number, denominator: number): number {
  if (denominator <= 0) throw new Error("denominator must be positive");
  const sign = numerator < 0 ? -1 : 1;
  const abs = Math.abs(numerator);
  const q = Math.floor(abs / denominator);
  const r = abs - q * denominator;
  return sign * (r * 2 >= denominator ? q + 1 : q);
}

function assertSafe(n: number, label: string) {
  if (!Number.isSafeInteger(n)) throw new Error(`${label} out of safe integer range`);
}

/** Parse a decimal string like "1,234.5" or "-12.345" into an integer scaled by 10^decimals. */
function parseScaled(input: string | number, decimals: number, label: string): number {
  const raw = typeof input === "number" ? input.toString() : input;
  const s = raw.replace(/[,\s$]/g, "");
  const m = /^(-)?(\d*)(?:\.(\d*))?$/.exec(s);
  if (!m || (m[2] === "" && (m[3] ?? "") === "")) throw new Error(`Invalid ${label}: "${raw}"`);
  const [, neg, whole, frac = ""] = m;
  const scale = 10 ** decimals;
  let fracPart: number;
  if (frac.length <= decimals) {
    fracPart = Number(frac.padEnd(decimals, "0") || "0");
  } else {
    // round half up on the extra digits
    const kept = Number(frac.slice(0, decimals) || "0");
    const nextDigit = Number(frac[decimals]);
    fracPart = kept + (nextDigit >= 5 ? 1 : 0);
  }
  const value = Number(whole || "0") * scale + fracPart;
  assertSafe(value, label);
  return neg ? -value : value;
}

/** "12.34" | 12.34 → 1234 cents. Extra decimals are rounded half-up. */
export function toCents(input: string | number): Cents {
  return parseScaled(input, 2, "amount");
}

/** Quantity → thousandths ("2.5" → 2500). */
export function toQtyMilli(input: string | number): number {
  return parseScaled(input, 3, "quantity");
}

/** Line net = quantity × unit price, rounded half-up to the cent. */
export function lineNet(quantity: string | number, unitPrice: Cents): Cents {
  const q = toQtyMilli(quantity);
  const product = q * unitPrice;
  assertSafe(product, "line total");
  return divRoundHalfUp(product, QTY_SCALE);
}

export function sum(values: readonly Cents[]): Cents {
  return values.reduce((a, b) => a + b, 0);
}

const cadFormatter = new Intl.NumberFormat("en-CA", { style: "currency", currency: "CAD" });

/** 123456 → "$1,234.56" */
export function formatCAD(cents: Cents): string {
  return cadFormatter.format(cents / 100);
}

/** 123456 → "1234.56" (for APIs such as Sage that expect decimal strings). */
export function centsToDecimalString(cents: Cents): string {
  const sign = cents < 0 ? "-" : "";
  const abs = Math.abs(cents);
  return `${sign}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, "0")}`;
}
