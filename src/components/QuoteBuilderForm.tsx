"use client";

import React, { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Calculator, Plus, Trash2, CheckCircle2, Sparkles } from "lucide-react";
import { createQuoteAction } from "@/app/actions";
import { CANADIAN_TAX_RATES, PROVINCE_CODES, calculateDocumentTotals } from "@/lib/tax";
import { centsToDecimalString, formatCAD, lineNet, toCents } from "@/lib/money";
import {
  DEFAULT_MATERIALS,
  DEFAULT_COREX_SIZES,
  calculateMaterialQuote,
} from "@/lib/pricing";

interface CustomerRow {
  id: number;
  name: string;
  companyName: string | null;
  email: string | null;
  addressLine1: string | null;
  city: string | null;
  province: string;
  taxExempt: boolean;
}

const DEFAULT_SAMPLE_DESC =
  "Custom Printed 3M IJ35C Vinyl Graphics — Laminated & Installed";

export function QuoteBuilderForm({
  customers,
  initialCustomerId,
}: {
  customers: CustomerRow[];
  initialCustomerId?: number;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const initialCust =
    customers.find((c) => c.id === initialCustomerId) ?? customers[0];

  const [customerId, setCustomerId] = useState<number>(initialCust?.id ?? 1);
  const selectedCustomer = useMemo(
    () => customers.find((c) => c.id === customerId) ?? customers[0],
    [customers, customerId]
  );

  const [title, setTitle] = useState("");
  const [poReference, setPoReference] = useState("");
  const [siteAddress, setSiteAddress] = useState(
    initialCust
      ? `${initialCust.addressLine1 ?? ""}, ${initialCust.city ?? "Halifax"}`
      : ""
  );
  const [siteProvince, setSiteProvince] = useState<string>(
    initialCust?.province ?? "NS"
  );
  const [notes, setNotes] = useState("");
  const [customerTerms, setCustomerTerms] = useState(
    "Net 30 for approved commercial accounts. Quotes valid for 30 days."
  );
  const [validUntil, setValidUntil] = useState(
    new Date(Date.now() + 30 * 86400_000).toISOString().slice(0, 10)
  );

  const [lines, setLines] = useState([
    {
      description: DEFAULT_SAMPLE_DESC,
      quantity: "1",
      unitPriceDollars: "450.00",
      taxExempt: false,
    },
  ]);

  // Built-in Quick Sign & Material Calculator Drawer
  const [showCalc, setShowCalc] = useState(false);
  const [calcMaterialKey, setCalcMaterialKey] = useState(
    DEFAULT_MATERIALS[0]!.materialKey
  );
  const [calcWidthFt, setCalcWidthFt] = useState("8");
  const [calcHeightFt, setCalcHeightFt] = useState("4");
  const [calcQty, setCalcQty] = useState("1");
  const [calcLaminate, setCalcLaminate] = useState(true);
  const [calcGrommets, setCalcGrommets] = useState(false);
  const [calcFeedback, setCalcFeedback] = useState<string | null>(null);

  const [error, setError] = useState<string | null>(null);

  const isBannerMaterial = calcMaterialKey.includes("banner");

  const liveTotals = useMemo(() => {
    try {
      const parsed = lines.map((l) => ({
        description: l.description || "Item",
        quantity: l.quantity || "1",
        unitPriceCents: toCents(l.unitPriceDollars || "0"),
        taxExempt: l.taxExempt,
      }));
      return calculateDocumentTotals(parsed, siteProvince, {
        customerTaxExempt: selectedCustomer?.taxExempt,
      });
    } catch {
      return null;
    }
  }, [lines, siteProvince, selectedCustomer]);

  const calcPreview = useMemo(() => {
    try {
      const mat =
        DEFAULT_MATERIALS.find((m) => m.materialKey === calcMaterialKey) ??
        DEFAULT_MATERIALS[0]!;
      const w = Number(calcWidthFt) || 1;
      const h = Number(calcHeightFt) || 1;
      return {
        material: mat,
        result: calculateMaterialQuote({
          material: mat,
          widthFt: w,
          heightFt: h,
          needsLaminate: isBannerMaterial ? false : calcLaminate,
          needsGrommets: isBannerMaterial ? calcGrommets : false,
        }),
      };
    } catch {
      return null;
    }
  }, [
    calcMaterialKey,
    calcWidthFt,
    calcHeightFt,
    calcLaminate,
    calcGrommets,
    isBannerMaterial,
  ]);

  function handleCustomerChange(newId: number) {
    setCustomerId(newId);
    const cust = customers.find((c) => c.id === newId);
    if (cust) {
      setSiteProvince(cust.province || "NS");
      setSiteAddress(`${cust.addressLine1 ?? ""}, ${cust.city ?? "Halifax"}`);
    }
  }

  function appendOrReplaceSampleLine(newLine: {
    description: string;
    quantity: string;
    unitPriceDollars: string;
    taxExempt: boolean;
  }) {
    setLines((prev) => {
      if (
        prev.length === 1 &&
        (prev[0]!.description === DEFAULT_SAMPLE_DESC ||
          !prev[0]!.description.trim())
      ) {
        return [newLine];
      }
      return [...prev, newLine];
    });
    setCalcFeedback(`✓ Added "${newLine.description}"`);
    setTimeout(() => setCalcFeedback(null), 2500);
  }

  function addCalculatedMaterialLine() {
    if (!calcPreview) return;
    const { material, result } = calcPreview;
    const extras = [
      !isBannerMaterial && calcLaminate ? "Laminated" : null,
      isBannerMaterial && calcGrommets ? "Hemmed & Grommeted" : null,
    ]
      .filter(Boolean)
      .join(", ");

    appendOrReplaceSampleLine({
      description: `${material.name} (${calcWidthFt}ft × ${calcHeightFt}ft${extras ? ` — ${extras}` : ""})`,
      quantity: calcQty || "1",
      unitPriceDollars: centsToDecimalString(result.finalPriceCents),
      taxExempt: false,
    });
  }

  function addCorexPreset(sizeKey: string) {
    const c = DEFAULT_COREX_SIZES.find((s) => s.sizeKey === sizeKey);
    if (!c) return;
    const unitSellCents = Math.round((c.baseCostCents / 100) * c.markup * 100);
    appendOrReplaceSampleLine({
      description: `Coroplast Sign ${sizeKey.replace("x", '" × ')}" (${c.sqft} sq ft)`,
      quantity: calcQty || "1",
      unitPriceDollars: centsToDecimalString(unitSellCents),
      taxExempt: false,
    });
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        startTransition(async () => {
          const res = await createQuoteAction({
            customerId,
            title,
            poReference,
            siteAddress,
            siteProvince,
            notes,
            customerTerms,
            validUntil,
            lines,
          });
          if (!res.ok) {
            setError(res.error);
          } else {
            router.push(`/q/${res.publicToken}`);
          }
        });
      }}
      className="space-y-6"
    >
      {error && (
        <div className="rounded-xl bg-rose-50 border border-rose-200 text-rose-800 px-4 py-3 text-sm font-medium">
          {error}
        </div>
      )}

      {/* Customer & Site Details */}
      <div className="rounded-2xl bg-white border border-slate-200/90 p-6 shadow-xs space-y-5">
        <h2 className="text-base font-bold text-slate-900">
          1. Customer & Installation Site
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label
              htmlFor="quote-customer-select"
              className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1.5"
            >
              Customer (Synced from Sage)
            </label>
            <select
              id="quote-customer-select"
              name="customerId"
              value={customerId}
              onChange={(e) => handleCustomerChange(Number(e.target.value))}
              className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900"
            >
              {customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} ({c.province})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label
              htmlFor="quote-title-input"
              className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1.5"
            >
              Project / Quote Title *
            </label>
            <input
              id="quote-title-input"
              name="title"
              type="text"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Showroom Window Perf & Exterior Pylon Faces"
              className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900"
            />
          </div>

          <div>
            <label
              htmlFor="quote-site-address"
              className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1.5"
            >
              Site Address
            </label>
            <input
              id="quote-site-address"
              name="siteAddress"
              type="text"
              value={siteAddress}
              onChange={(e) => setSiteAddress(e.target.value)}
              placeholder="3240 Kempt Road, Halifax, NS"
              className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label
                htmlFor="quote-site-province"
                className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1.5"
              >
                Delivery Province (Tax)
              </label>
              <select
                id="quote-site-province"
                name="siteProvince"
                value={siteProvince}
                onChange={(e) => setSiteProvince(e.target.value)}
                className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900"
              >
                {PROVINCE_CODES.map((code) => (
                  <option key={code} value={code}>
                    {code} — {CANADIAN_TAX_RATES[code].label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label
                htmlFor="quote-po-reference"
                className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1.5"
              >
                Customer PO / Reference
              </label>
              <input
                id="quote-po-reference"
                name="poReference"
                type="text"
                value={poReference}
                onChange={(e) => setPoReference(e.target.value)}
                placeholder="PO-69158"
                className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Line Items + Quick Calculator */}
      <div className="rounded-2xl bg-white border border-slate-200/90 p-6 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-bold text-slate-900">2. Line Items</h2>
            <p className="text-xs text-slate-500">
              Exact integer-cent math per line, matching Sage Accounting
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setShowCalc((v) => !v)}
              className="inline-flex items-center gap-1.5 rounded-xl bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-300 font-semibold text-xs px-3.5 py-2 transition cursor-pointer"
            >
              <Calculator className="w-3.5 h-3.5 text-amber-600" />
              {showCalc ? "Hide Sign Calculator" : "Vinyl / Banner / Corex Calculator"}
            </button>
            <button
              type="button"
              onClick={() =>
                setLines((prev) => [
                  ...prev,
                  {
                    description: "",
                    quantity: "1",
                    unitPriceDollars: "150.00",
                    taxExempt: false,
                  },
                ])
              }
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-slate-800 font-semibold text-xs px-3.5 py-2 transition cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" /> Add Line
            </button>
          </div>
        </div>

        {/* Optional Integrated Pricing Calculator */}
        {showCalc && (
          <div className="rounded-2xl bg-slate-950 text-white p-5 space-y-4 border border-slate-800">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-sm font-bold text-amber-400">
                <Sparkles className="w-4 h-4" />
                Giant Promotions Material & Corex Pricing Helper
              </div>
              {calcFeedback ? (
                <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                  {calcFeedback}
                </span>
              ) : (
                <span className="text-xs text-slate-400">
                  Verified material costs, ink, laminate & $25/hr labor formulas
                </span>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-5 gap-3">
              <div className="sm:col-span-2">
                <label
                  htmlFor="calc-material-select"
                  className="block text-[11px] uppercase tracking-wider text-slate-400 mb-1"
                >
                  Material
                </label>
                <select
                  id="calc-material-select"
                  value={calcMaterialKey}
                  onChange={(e) => setCalcMaterialKey(e.target.value)}
                  className="w-full rounded-lg bg-slate-900 border border-slate-700 px-3 py-2 text-xs text-white"
                >
                  {DEFAULT_MATERIALS.map((m) => (
                    <option key={m.materialKey} value={m.materialKey}>
                      {m.name} ({formatCAD(m.costPerFtCents)}/ft × {m.markupMultiplier}x)
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label
                  htmlFor="calc-width-ft"
                  className="block text-[11px] uppercase tracking-wider text-slate-400 mb-1"
                >
                  Width (ft)
                </label>
                <input
                  id="calc-width-ft"
                  type="number"
                  step="0.5"
                  min="0.5"
                  value={calcWidthFt}
                  onChange={(e) => setCalcWidthFt(e.target.value)}
                  className="w-full rounded-lg bg-slate-900 border border-slate-700 px-3 py-2 text-xs text-white"
                />
              </div>
              <div>
                <label
                  htmlFor="calc-height-ft"
                  className="block text-[11px] uppercase tracking-wider text-slate-400 mb-1"
                >
                  Height (ft)
                </label>
                <input
                  id="calc-height-ft"
                  type="number"
                  step="0.5"
                  min="0.5"
                  value={calcHeightFt}
                  onChange={(e) => setCalcHeightFt(e.target.value)}
                  className="w-full rounded-lg bg-slate-900 border border-slate-700 px-3 py-2 text-xs text-white"
                />
              </div>
              <div>
                <label
                  htmlFor="calc-qty-input"
                  className="block text-[11px] uppercase tracking-wider text-slate-400 mb-1"
                >
                  Pieces / Qty
                </label>
                <input
                  id="calc-qty-input"
                  type="number"
                  step="1"
                  min="1"
                  value={calcQty}
                  onChange={(e) => setCalcQty(e.target.value)}
                  className="w-full rounded-lg bg-slate-900 border border-slate-700 px-3 py-2 text-xs text-white"
                />
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-4 pt-1">
              <div className="flex items-center gap-4 text-xs text-slate-300">
                {!isBannerMaterial ? (
                  <label className="inline-flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={calcLaminate}
                      onChange={(e) => setCalcLaminate(e.target.checked)}
                    />
                    Add UV Laminate (+4ft waste)
                  </label>
                ) : (
                  <label className="inline-flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={calcGrommets}
                      onChange={(e) => setCalcGrommets(e.target.checked)}
                    />
                    Hemmed & Brass Banner Grommets
                  </label>
                )}
              </div>

              {calcPreview && (
                <div className="flex items-center gap-3">
                  <div className="text-right text-xs">
                    <span className="text-slate-400">
                      {calcPreview.result.piecesNeeded} roll width ({calcPreview.result.linearFeet} lin ft) • Cost{" "}
                      {formatCAD(calcPreview.result.subtotalCostCents)} →{" "}
                    </span>
                    <strong className="text-amber-400 text-sm">
                      Unit Sell {formatCAD(calcPreview.result.finalPriceCents)}
                    </strong>{" "}
                    <span className="text-emerald-400">
                      ({calcPreview.result.profitMarginPct}% margin)
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={addCalculatedMaterialLine}
                    className="rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs px-3.5 py-2 cursor-pointer whitespace-nowrap"
                  >
                    + Insert into Quote
                  </button>
                </div>
              )}
            </div>

            <div className="border-t border-slate-800 pt-3 flex flex-wrap items-center gap-2">
              <span className="text-[11px] uppercase tracking-wider text-slate-400 mr-1">
                Quick Corex Sizes (4mm Coroplast):
              </span>
              {["12x18", "18x24", "24x36", "24x48", "36x48", "48x96"].map((sz) => {
                const c = DEFAULT_COREX_SIZES.find((s) => s.sizeKey === sz);
                const sellCents = c
                  ? Math.round((c.baseCostCents / 100) * c.markup * 100)
                  : 0;
                return (
                  <button
                    key={sz}
                    type="button"
                    onClick={() => addCorexPreset(sz)}
                    className="rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-700 text-xs text-slate-200 px-2.5 py-1 cursor-pointer whitespace-nowrap"
                  >
                    + Corex {sz.replace("x", '"×')}" ({formatCAD(sellCents)})
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Column Headers for Line Items */}
        <div className="hidden sm:grid sm:grid-cols-12 gap-2.5 px-3 text-[11px] font-bold uppercase tracking-wider text-slate-500">
          <div className="sm:col-span-6">Description</div>
          <div className="sm:col-span-2">Qty</div>
          <div className="sm:col-span-2">Unit Price ($)</div>
          <div className="sm:col-span-2 text-right">Line Total</div>
        </div>

        {/* Line Items Table */}
        <div className="space-y-2.5">
          {lines.map((line, index) => {
            let rowNetCents = 0;
            try {
              rowNetCents = lineNet(
                line.quantity || "0",
                toCents(line.unitPriceDollars || "0")
              );
            } catch {
              rowNetCents = 0;
            }
            return (
              <div
                key={index}
                className="grid grid-cols-1 sm:grid-cols-12 gap-2.5 items-center bg-slate-50/70 p-3 rounded-xl border border-slate-200/80"
              >
                <div className="sm:col-span-6">
                  <input
                    type="text"
                    required
                    aria-label={`Line ${index + 1} description`}
                    value={line.description}
                    onChange={(e) => {
                      const copy = [...lines];
                      copy[index] = { ...line, description: e.target.value };
                      setLines(copy);
                    }}
                    placeholder="Description (e.g. 4ft x 8ft Alupanel Sign Face + Installation)"
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
                  />
                </div>
                <div className="sm:col-span-2">
                  <input
                    type="text"
                    required
                    aria-label={`Line ${index + 1} quantity`}
                    value={line.quantity}
                    onChange={(e) => {
                      const copy = [...lines];
                      copy[index] = { ...line, quantity: e.target.value };
                      setLines(copy);
                    }}
                    placeholder="Qty"
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
                  />
                </div>
                <div className="sm:col-span-2">
                  <input
                    type="text"
                    required
                    aria-label={`Line ${index + 1} unit price`}
                    value={line.unitPriceDollars}
                    onChange={(e) => {
                      const copy = [...lines];
                      copy[index] = { ...line, unitPriceDollars: e.target.value };
                      setLines(copy);
                    }}
                    placeholder="Unit Price ($)"
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 font-mono"
                  />
                </div>
                <div className="sm:col-span-2 flex items-center justify-end gap-2">
                  <span className="font-mono text-sm font-bold text-slate-900">
                    {formatCAD(rowNetCents)}
                  </span>
                  {lines.length > 1 && (
                    <button
                      type="button"
                      onClick={() => setLines(lines.filter((_, i) => i !== index))}
                      className="p-1.5 text-slate-400 hover:text-rose-600 rounded-lg cursor-pointer"
                      title="Remove line"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Live Totals Footer */}
        {liveTotals && (
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pt-4 border-t border-slate-200">
            <div className="text-xs text-slate-500">
              Tax automatically calculated for{" "}
              <strong className="text-slate-800">{liveTotals.province}</strong> (
              {liveTotals.taxLabel})
            </div>
            <div className="space-y-1 text-right">
              <div className="text-xs text-slate-600">
                Subtotal:{" "}
                <strong className="text-slate-900">
                  {formatCAD(liveTotals.subtotalCents)}
                </strong>
              </div>
              <div className="text-xs text-slate-600">
                Tax ({liveTotals.taxLabel}):{" "}
                <strong className="text-slate-900">{formatCAD(liveTotals.taxCents)}</strong>
              </div>
              <div className="text-lg font-bold text-slate-900">
                Total: {formatCAD(liveTotals.totalCents)}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Notes & Terms */}
      <div className="rounded-2xl bg-white border border-slate-200/90 p-6 shadow-xs grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label
            htmlFor="quote-scope-notes"
            className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1.5"
          >
            Scope Notes (Shown on Quote & Installer Work Order)
          </label>
          <textarea
            id="quote-scope-notes"
            name="notes"
            rows={3}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Artwork specifications, site access notes, or installation timing…"
            className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900"
          />
        </div>
        <div className="space-y-3">
          <div>
            <label
              htmlFor="quote-terms"
              className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1.5"
            >
              Terms & Conditions
            </label>
            <textarea
              id="quote-terms"
              name="customerTerms"
              rows={2}
              value={customerTerms}
              onChange={(e) => setCustomerTerms(e.target.value)}
              className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-sm text-slate-900"
            />
          </div>
          <div>
            <label
              htmlFor="quote-valid-until"
              className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1"
            >
              Valid Until
            </label>
            <input
              id="quote-valid-until"
              name="validUntil"
              type="date"
              value={validUntil}
              onChange={(e) => setValidUntil(e.target.value)}
              className="rounded-xl border border-slate-300 bg-white px-3.5 py-1.5 text-sm text-slate-900"
            />
          </div>
        </div>
      </div>

      <div className="flex items-center justify-end gap-3">
        <button
          type="submit"
          disabled={isPending}
          className="inline-flex items-center gap-2 rounded-xl bg-slate-950 hover:bg-slate-800 text-white font-semibold text-sm px-6 py-3 transition shadow-sm disabled:opacity-50 cursor-pointer"
        >
          <CheckCircle2 className="w-4 h-4 text-amber-400" />
          {isPending ? "Creating Quote…" : "Create Quote & Open Customer Approval Link"}
        </button>
      </div>
    </form>
  );
}
