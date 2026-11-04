"use client";

import React, { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  Calendar,
  Calculator,
  CheckCircle2,
  Clock,
  Plus,
  RefreshCw,
  ShieldAlert,
  Sparkles,
  Trash2,
  Truck,
} from "lucide-react";
import {
  createProjectAction,
  getFleetAvailabilityAction,
} from "@/app/actions";
import type { FleetUnitWithAvailability } from "@/lib/availability";
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

type Line = {
  description: string;
  quantity: string;
  unitPriceDollars: string;
  taxExempt: boolean;
  groupName?: string;
  hiddenFromCustomer?: boolean;
  equipmentId?: number;
  rentalStartDate?: string;
  rentalEndDate?: string;
  availabilityStatus?: "available" | "potential_conflict" | "hard_conflict" | "maintenance" | "retired";
  availabilitySummary?: string;
};

const DEFAULT_SAMPLE_DESC =
  "Custom Printed 3M IJ35C Vinyl Graphics — Laminated & Installed";

export function QuoteBuilderForm({
  customers,
  initialCustomerId,
  initialTitle,
  initialLines,
}: {
  customers: CustomerRow[];
  initialCustomerId?: number;
  initialTitle?: string;
  initialLines?: Line[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const initialCust =
    customers.find((c) => c.id === initialCustomerId) ?? customers[0];

  const [customerId, setCustomerId] = useState<number>(initialCust?.id ?? 1);
  const [customerSearch, setCustomerSearch] = useState("");
  const selectedCustomer = useMemo(
    () => customers.find((c) => c.id === customerId) ?? customers[0],
    [customers, customerId]
  );

  const filteredCustomers = useMemo(() => {
    const q = customerSearch.trim().toLowerCase();
    if (!q) return customers;
    const matches = customers.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        (c.companyName ?? "").toLowerCase().includes(q) ||
        (c.email ?? "").toLowerCase().includes(q) ||
        (c.city ?? "").toLowerCase().includes(q)
    );
    if (selectedCustomer && !matches.some((m) => m.id === selectedCustomer.id)) {
      return [selectedCustomer, ...matches];
    }
    return matches;
  }, [customers, customerSearch, selectedCustomer]);

  const [title, setTitle] = useState(initialTitle ?? "");
  const [poReference, setPoReference] = useState("");
  const [siteAddress, setSiteAddress] = useState(
    initialCust
      ? [initialCust.addressLine1, initialCust.city]
          .map((s) => (s ?? "").trim())
          .filter(Boolean)
          .join(", ")
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

  const sendIntent = useRef(false);
  const [lines, setLines] = useState<Line[]>(
    initialLines && initialLines.length > 0
      ? initialLines
      : [
          {
            description: DEFAULT_SAMPLE_DESC,
            quantity: "1",
            unitPriceDollars: "450.00",
            taxExempt: false,
          },
        ]
  );

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

  // Equipment Fleet & Live Availability Drawer (Goodshuffle Pro-style)
  const [showFleet, setShowFleet] = useState(false);
  const [fleetLoading, setFleetLoading] = useState(false);
  const [fleetUnits, setFleetUnits] = useState<FleetUnitWithAvailability[]>([]);
  const [fleetCategory, setFleetCategory] = useState("all");
  const [fleetStartDate, setFleetStartDate] = useState(
    new Date().toISOString().slice(0, 10)
  );
  const [fleetEndDate, setFleetEndDate] = useState(
    new Date(Date.now() + 30 * 86400_000).toISOString().slice(0, 10)
  );
  const [isOngoingRental, setIsOngoingRental] = useState(false);

  useEffect(() => {
    if (!showFleet) return;
    let active = true;
    setFleetLoading(true);
    getFleetAvailabilityAction({
      startDate: fleetStartDate,
      endDate: isOngoingRental ? null : fleetEndDate,
    })
      .then((units) => {
        if (active) setFleetUnits(units);
      })
      .catch((err) => console.error("Fleet fetch error:", err))
      .finally(() => {
        if (active) setFleetLoading(false);
      });
    return () => {
      active = false;
    };
  }, [showFleet, fleetStartDate, fleetEndDate, isOngoingRental]);

  function addEquipmentLine(unit: FleetUnitWithAvailability) {
    const s = fleetStartDate;
    const e = isOngoingRental ? null : fleetEndDate;
    const dateLabel = isOngoingRental ? `${s} → Ongoing Monthly` : `${s} → ${e}`;
    appendOrReplaceSampleLine({
      description: `${unit.equipment.code} — ${unit.equipment.name} (${dateLabel})`,
      quantity: "1",
      unitPriceDollars: centsToDecimalString(unit.equipment.defaultMonthlyRateCents),
      taxExempt: false,
      groupName: "Equipment Rentals",
      equipmentId: unit.equipment.id,
      rentalStartDate: s,
      rentalEndDate: e || undefined,
      availabilityStatus: unit.availability.status,
      availabilitySummary: unit.availability.summary,
    });
  }

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
      setSiteAddress(
        [cust.addressLine1, cust.city]
          .map((s) => (s ?? "").trim())
          .filter(Boolean)
          .join(", ")
      );
    }
  }

  function appendOrReplaceSampleLine(newLine: Line) {
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
          const res = await createProjectAction({
            sendNow: sendIntent.current,
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
            router.push(`/projects/${res.projectId}`);
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
            <div className="flex items-center justify-between mb-1.5">
              <label
                htmlFor="quote-customer-select"
                className="block text-xs font-semibold uppercase tracking-wider text-slate-600"
              >
                Customer ({customers.length} Synced from Sage)
              </label>
              <input
                type="text"
                value={customerSearch}
                onChange={(e) => {
                  const val = e.target.value;
                  setCustomerSearch(val);
                  const q = val.trim().toLowerCase();
                  if (q) {
                    const firstMatch = customers.find(
                      (c) =>
                        c.name.toLowerCase().includes(q) ||
                        (c.companyName ?? "").toLowerCase().includes(q) ||
                        (c.email ?? "").toLowerCase().includes(q)
                    );
                    if (firstMatch) handleCustomerChange(firstMatch.id);
                  }
                }}
                placeholder="Type to filter customers…"
                className="rounded-xs border border-slate-300 bg-slate-50 px-2 py-0.5 text-xs text-slate-800 focus:border-[#186ade] focus:bg-white focus:outline-none w-48"
              />
            </div>
            <select
              id="quote-customer-select"
              name="customerId"
              value={customerId}
              onChange={(e) => handleCustomerChange(Number(e.target.value))}
              className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900"
            >
              {filteredCustomers.map((c) => (
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
              onClick={() => {
                setShowFleet((v) => !v);
                if (showCalc) setShowCalc(false);
              }}
              className="inline-flex items-center gap-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-amber-300 font-semibold text-xs px-3.5 py-2 transition cursor-pointer"
            >
              <Truck className="w-3.5 h-3.5 text-amber-400" />
              {showFleet ? "Hide Fleet Selector" : "Fleet Rentals & Live Availability"}
            </button>
            <button
              type="button"
              onClick={() => {
                setShowCalc((v) => !v);
                if (showFleet) setShowFleet(false);
              }}
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

        {/* Goodshuffle Pro-style Equipment Fleet & Real-Time Availability Drawer */}
        {showFleet && (
          <div className="rounded-2xl bg-slate-950 text-white p-5 space-y-4 border border-slate-800">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="flex items-center gap-2 text-sm font-bold text-amber-400">
                  <Truck className="w-4 h-4 text-amber-400" />
                  Live Fleet Availability Engine (Halifax Depot • 3797 Mackintosh St)
                </div>
                <p className="text-xs text-slate-400 mt-0.5">
                  Real-time double-booking protection & potential conflict tracking across draft quotes and active leases
                </p>
              </div>

              {/* Date Interval Controls */}
              <div className="flex flex-wrap items-center gap-3 bg-slate-900 p-2.5 rounded-xl border border-slate-800">
                <div className="flex items-center gap-2">
                  <Calendar className="w-3.5 h-3.5 text-slate-400" />
                  <label htmlFor="fleet-start-date" className="text-xs text-slate-300 font-medium">
                    Start:
                  </label>
                  <input
                    id="fleet-start-date"
                    type="date"
                    value={fleetStartDate}
                    onChange={(e) => setFleetStartDate(e.target.value)}
                    className="rounded bg-slate-800 border border-slate-700 px-2 py-1 text-xs text-white"
                  />
                </div>

                {!isOngoingRental && (
                  <div className="flex items-center gap-2">
                    <label htmlFor="fleet-end-date" className="text-xs text-slate-300 font-medium">
                      End:
                    </label>
                    <input
                      id="fleet-end-date"
                      type="date"
                      value={fleetEndDate}
                      onChange={(e) => setFleetEndDate(e.target.value)}
                      className="rounded bg-slate-800 border border-slate-700 px-2 py-1 text-xs text-white"
                    />
                  </div>
                )}

                <label className="inline-flex items-center gap-1.5 text-xs text-slate-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={isOngoingRental}
                    onChange={(e) => setIsOngoingRental(e.target.checked)}
                    className="rounded border-slate-700"
                  />
                  Ongoing Monthly
                </label>

                <button
                  type="button"
                  onClick={() => {
                    let active = true;
                    setFleetLoading(true);
                    getFleetAvailabilityAction({
                      startDate: fleetStartDate,
                      endDate: isOngoingRental ? null : fleetEndDate,
                    })
                      .then((units) => {
                        if (active) setFleetUnits(units);
                      })
                      .finally(() => {
                        if (active) setFleetLoading(false);
                      });
                  }}
                  title="Refresh availability"
                  className="p-1 rounded hover:bg-slate-800 text-slate-400 hover:text-white"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${fleetLoading ? "animate-spin" : ""}`} />
                </button>
              </div>
            </div>

            {/* Fleet Items Grid */}
            {fleetLoading && fleetUnits.length === 0 ? (
              <div className="py-6 text-center text-xs text-slate-400">
                Checking availability across active leases and draft quotes…
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {fleetUnits.map((u) => {
                  const status = u.availability.status;
                  const isAvail = status === "available";
                  const isHardConflict = status === "hard_conflict";
                  const isPotConflict = status === "potential_conflict";
                  const isMaint = status === "maintenance" || status === "retired";

                  return (
                    <div
                      key={u.equipment.id}
                      className="rounded-xl bg-slate-900 border border-slate-800 p-3.5 flex flex-col justify-between space-y-3"
                    >
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-mono text-xs font-black px-2 py-0.5 rounded bg-slate-950 text-amber-400 border border-slate-800">
                            {u.equipment.code}
                          </span>
                          {/* Live Status Badge */}
                          {isAvail && (
                            <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-400 bg-emerald-950/60 px-2 py-0.5 rounded-full border border-emerald-800">
                              <CheckCircle2 className="w-3 h-3" /> Available
                            </span>
                          )}
                          {isPotConflict && (
                            <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-300 bg-amber-950/70 px-2 py-0.5 rounded-full border border-amber-700">
                              <AlertTriangle className="w-3 h-3" /> Potential Conflict
                            </span>
                          )}
                          {isHardConflict && (
                            <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-rose-300 bg-rose-950/80 px-2 py-0.5 rounded-full border border-rose-800">
                              <ShieldAlert className="w-3 h-3" /> Booked
                            </span>
                          )}
                          {isMaint && (
                            <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-slate-300 bg-slate-800 px-2 py-0.5 rounded-full border border-slate-700">
                              <Clock className="w-3 h-3" /> Maintenance
                            </span>
                          )}
                        </div>

                        <div className="font-semibold text-sm text-white">
                          {u.equipment.name}
                        </div>
                        <div className="text-xs text-slate-400">
                          {u.equipment.conditionNotes}
                        </div>
                      </div>

                      {/* Conflict Details Banner */}
                      {!isAvail && (
                        <div
                          className={`rounded-lg px-2.5 py-1.5 text-[11px] leading-tight ${
                            isHardConflict
                              ? "bg-rose-950/60 text-rose-200 border border-rose-900/60"
                              : isPotConflict
                              ? "bg-amber-950/60 text-amber-200 border border-amber-900/60"
                              : "bg-slate-800 text-slate-300 border border-slate-700"
                          }`}
                        >
                          {u.availability.summary}
                        </div>
                      )}

                      <div className="flex items-center justify-between gap-2 pt-2 border-t border-slate-800">
                        <div className="text-xs">
                          <span className="font-bold text-white">
                            {formatCAD(u.equipment.defaultMonthlyRateCents)}
                          </span>
                          <span className="text-slate-400 text-[11px]">/month</span>
                        </div>
                        <button
                          type="button"
                          disabled={isMaint}
                          onClick={() => addEquipmentLine(u)}
                          className="rounded-lg bg-amber-500 hover:bg-amber-400 disabled:opacity-40 disabled:hover:bg-amber-500 text-slate-950 font-bold text-xs px-3 py-1.5 transition cursor-pointer"
                        >
                          + Add to Quote
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

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
                <div className="sm:col-span-6 space-y-1.5">
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
                  {line.equipmentId && (
                    <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                      {line.availabilityStatus === "available" && (
                        <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                          <CheckCircle2 className="w-3 h-3 text-emerald-600 shrink-0" />
                          Available in Yard
                        </span>
                      )}
                      {line.availabilityStatus === "potential_conflict" && (
                        <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-800 bg-amber-50 px-2 py-0.5 rounded border border-amber-300">
                          <AlertTriangle className="w-3 h-3 text-amber-600 shrink-0" />
                          Potential Conflict
                        </span>
                      )}
                      {line.availabilityStatus === "hard_conflict" && (
                        <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-rose-800 bg-rose-50 px-2 py-0.5 rounded border border-rose-300">
                          <ShieldAlert className="w-3 h-3 text-rose-600 shrink-0" />
                          Hard Conflict (Booked)
                        </span>
                      )}
                      {line.availabilityStatus === "maintenance" && (
                        <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-900 bg-amber-100 px-2 py-0.5 rounded border border-amber-300">
                          <Clock className="w-3 h-3 text-amber-700 shrink-0" />
                          In Maintenance
                        </span>
                      )}
                      {line.availabilitySummary && (
                        <span className="text-[11px] text-slate-600 truncate max-w-sm" title={line.availabilitySummary}>
                          • {line.availabilitySummary}
                        </span>
                      )}
                    </div>
                  )}
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
                <div className="sm:col-span-12 sm:order-last flex flex-wrap items-center gap-4 text-xs text-slate-600">
                  <label className="inline-flex items-center gap-1.5">
                    <span className="font-semibold">Group</span>
                    <input
                      type="text"
                      aria-label={`Line ${index + 1} group`}
                      value={line.groupName ?? ""}
                      onChange={(e) => {
                        const copy = [...lines];
                        copy[index] = { ...line, groupName: e.target.value };
                        setLines(copy);
                      }}
                      placeholder="e.g. Window film"
                      className="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs text-slate-900 w-40"
                    />
                  </label>
                  <label className="inline-flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={Boolean(line.hiddenFromCustomer)}
                      onChange={(e) => {
                        const copy = [...lines];
                        copy[index] = { ...line, hiddenFromCustomer: e.target.checked };
                        setLines(copy);
                      }}
                    />
                    Internal only (hidden from the customer, $0)
                  </label>
                </div>
                <div className="sm:col-span-2 flex items-center justify-end gap-2">
                  <span
                    className={`font-mono text-sm font-bold ${
                      line.hiddenFromCustomer ? "text-slate-400 line-through" : "text-slate-900"
                    }`}
                  >
                    {line.hiddenFromCustomer ? formatCAD(0) : formatCAD(rowNetCents)}
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

      {/* Conflict Notices */}
      {lines.some((l) => l.availabilityStatus === "hard_conflict") && (
        <div className="rounded-2xl bg-rose-50 border border-rose-300 text-rose-900 p-4 text-xs sm:text-sm font-semibold flex items-start gap-3">
          <ShieldAlert className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
          <div className="space-y-0.5">
            <div className="font-bold text-rose-950">Fleet Schedule Conflict Detected</div>
            <p className="text-rose-800 text-xs">
              One or more selected equipment items have overlapping bookings on active jobs. You can still save or present this quote as an estimate, but physical unit dispatch requires resolving the schedule conflict or selecting an alternative unit.
            </p>
          </div>
        </div>
      )}

      {lines.some((l) => l.availabilityStatus === "potential_conflict") &&
        !lines.some((l) => l.availabilityStatus === "hard_conflict") && (
          <div className="rounded-2xl bg-amber-50 border border-amber-300 text-amber-900 p-4 text-xs sm:text-sm font-semibold flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
            <div className="space-y-0.5">
              <div className="font-bold text-amber-950">Potential Fleet Conflict (Tentative Quote)</div>
              <p className="text-amber-800 text-xs">
                One or more selected equipment items are currently held on another open quote awaiting customer approval. The unit will be awarded to whichever customer signs first.
              </p>
            </div>
          </div>
        )}

      <div className="flex flex-wrap items-center justify-end gap-3">
        <button
          type="submit"
          disabled={isPending}
          onClick={() => {
            sendIntent.current = false;
          }}
          className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-slate-900 font-semibold text-sm px-5 py-3 transition disabled:opacity-50 cursor-pointer"
        >
          {isPending && !sendIntent.current ? "Saving…" : "Save as draft"}
        </button>
        <button
          type="submit"
          disabled={isPending}
          onClick={() => {
            sendIntent.current = true;
          }}
          className="inline-flex items-center gap-2 rounded-xl bg-slate-950 hover:bg-slate-800 text-white font-semibold text-sm px-6 py-3 transition shadow-sm disabled:opacity-50 cursor-pointer"
        >
          <CheckCircle2 className="w-4 h-4 text-amber-400" />
          {isPending && sendIntent.current ? "Saving…" : "Save & mark as sent to client"}
        </button>
      </div>
    </form>
  );
}
