"use client";

import React, { useState, useTransition } from "react";
import {
  AlertTriangle,
  Calendar,
  CheckCircle2,
  ExternalLink,
  MapPin,
  Plus,
  RotateCcw,
  ShieldCheck,
} from "lucide-react";
import {
  bookEquipmentRentalAction,
  returnEquipmentRentalAction,
} from "@/app/actions";
import { centsToDecimalString, formatCAD } from "@/lib/money";

interface EquipmentItem {
  id: number;
  code: string;
  name: string;
  category: string;
  serialNumber: string | null;
  defaultMonthlyRateCents: number;
  status: string;
  conditionNotes: string | null;
}

interface RentalRow {
  id: number;
  equipmentId: number;
  equipmentCode: string;
  equipmentName: string;
  customerName: string;
  startDate: string;
  endDate: string | null;
  monthlyRateCents: number;
  locationAddress: string;
  lat: number;
  lng: number;
  status: string;
  notes: string;
}

export function EquipmentClientView({
  equipmentList,
  rentals,
  customers,
}: {
  equipmentList: EquipmentItem[];
  rentals: RentalRow[];
  customers: {
    id: number;
    name: string;
    addressLine1: string | null;
    city: string | null;
  }[];
}) {
  const [isPending, startTransition] = useTransition();
  const [selectedPinId, setSelectedPinId] = useState<number | null>(
    rentals.find((r) => r.status === "active")?.id ?? null
  );

  const initialUnit =
    equipmentList.find((e) => e.status === "available") ?? equipmentList[0];
  const initialCustomer = customers[0];

  const [equipmentId, setEquipmentId] = useState<number>(
    initialUnit?.id ?? 1
  );
  const [customerId, setCustomerId] = useState<number>(
    initialCustomer?.id ?? 1
  );
  const [startDate, setStartDate] = useState<string>(
    new Date().toISOString().slice(0, 10)
  );
  const [endDate, setEndDate] = useState<string>("");
  const [monthlyRateDollars, setMonthlyRateDollars] = useState<string>(
    initialUnit
      ? centsToDecimalString(initialUnit.defaultMonthlyRateCents)
      : "175.00"
  );
  const [locationAddress, setLocationAddress] = useState<string>(
    initialCustomer
      ? `${initialCustomer.addressLine1 ?? ""}, ${initialCustomer.city ?? "Halifax"}`
      : ""
  );
  const [poReference, setPoReference] = useState<string>("");
  const [notes, setNotes] = useState<string>("");

  const [feedback, setFeedback] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const activeRentals = rentals.filter(
    (r) => r.status === "active" || r.status === "scheduled"
  );
  const selectedRental =
    activeRentals.find((r) => r.id === selectedPinId) ?? activeRentals[0];

  const selectedFormUnitBookings = activeRentals.filter(
    (r) => r.equipmentId === equipmentId
  );

  function selectUnitForBooking(unit: EquipmentItem) {
    setEquipmentId(unit.id);
    setMonthlyRateDollars(centsToDecimalString(unit.defaultMonthlyRateCents));
  }

  // Bounding box for Halifax / Bedford / Dartmouth map canvas
  // Lat range: 44.63 (South End Halifax) -> 44.75 (Bedford)
  // Lng range: -63.68 (Bedford) -> -63.53 (Dartmouth Crossing)
  function projectToCanvas(lat: number, lng: number) {
    const minLat = 44.64;
    const maxLat = 44.75;
    const minLng = -63.68;
    const maxLng = -63.53;
    const xPct = Math.min(90, Math.max(10, ((lng - minLng) / (maxLng - minLng)) * 100));
    const yPct = Math.min(86, Math.max(14, (1 - (lat - minLat) / (maxLat - minLat)) * 100));
    return { xPct, yPct };
  }

  return (
    <div className="space-y-6">
      {feedback && (
        <div className="rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900 px-4 py-3 text-xs sm:text-sm font-semibold">
          {feedback}
        </div>
      )}
      {error && (
        <div className="rounded-xl bg-rose-50 border border-rose-200 text-rose-800 px-4 py-3 text-xs sm:text-sm font-semibold">
          {error}
        </div>
      )}

      {/* Top Grid: Live Halifax Deployment Map + Book Equipment Form */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Interactive HRM Deployment Map */}
        <div className="lg:col-span-7 rounded-3xl bg-slate-950 text-white border border-slate-800 p-6 flex flex-col justify-between space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                <MapPin className="w-4 h-4 text-amber-400" />
                Live Rental Deployment Map (Halifax / Dartmouth / Bedford)
              </h2>
              <p className="text-xs text-slate-400">
                Click any deployed unit pin to inspect location, customer, or return equipment
              </p>
            </div>
            <div className="flex items-center gap-2 text-xs font-mono">
              <span className="font-semibold text-amber-400 bg-slate-900 px-2.5 py-1 rounded-lg border border-slate-800 whitespace-nowrap">
                {activeRentals.length} Deployed
              </span>
              <span className="font-semibold text-emerald-400 bg-slate-900 px-2.5 py-1 rounded-lg border border-slate-800 whitespace-nowrap">
                {equipmentList.length - activeRentals.length} In Yard
              </span>
            </div>
          </div>

          {/* Stylized Interactive HRM Map Canvas */}
          <div className="relative h-72 sm:h-80 w-full rounded-2xl bg-slate-900 border border-slate-800 overflow-hidden">
            {/* Geographic Water & Highway Grid Overlay */}
            <svg
              viewBox="0 0 600 320"
              className="absolute inset-0 w-full h-full opacity-40 pointer-events-none"
            >
              {/* Bedford Basin & Halifax Harbour */}
              <path
                d="M 140 20 Q 250 40 310 130 L 360 320 L 270 320 L 235 160 Q 150 110 110 40 Z"
                fill="#0ea5e9"
                fillOpacity="0.22"
                stroke="#38bdf8"
                strokeWidth="1.5"
              />
              {/* Hwy 102 / Bedford Hwy / Kempt Rd / Hwy 111 */}
              <path
                d="M 80 40 Q 170 130 220 230"
                stroke="#f59e0b"
                strokeWidth="2"
                strokeDasharray="5 4"
                fill="none"
              />
              <path
                d="M 235 155 L 480 95"
                stroke="#94a3b8"
                strokeWidth="2"
                fill="none"
              />
              <text x="24" y="34" fill="#94a3b8" fontSize="10" fontWeight="700" letterSpacing="0.06em">
                BEDFORD HWY (102)
              </text>
              <text x="34" y="294" fill="#94a3b8" fontSize="10" fontWeight="700" letterSpacing="0.06em">
                KEMPT RD / HALIFAX PENINSULA
              </text>
              <text x="375" y="42" fill="#94a3b8" fontSize="10" fontWeight="700" letterSpacing="0.06em">
                BURNSIDE / DARTMOUTH CROSSING
              </text>
            </svg>

            {/* Giant Promotions HQ Pin (3797 Mackintosh St) */}
            {(() => {
              const hq = projectToCanvas(44.656, -63.635);
              return (
                <div
                  style={{ left: `${hq.xPct}%`, top: `${hq.yPct}%` }}
                  className="absolute -translate-x-1/2 -translate-y-1/2 z-10"
                  title="Giant Promotions HQ — 3797 Mackintosh St"
                >
                  <div className="px-2 py-0.5 rounded bg-slate-800/95 border border-slate-600 text-[10px] font-bold text-slate-300 whitespace-nowrap shadow">
                    ★ HQ (3797 Mackintosh)
                  </div>
                </div>
              );
            })()}

            {/* Deployed Rental Pins */}
            {activeRentals.map((r, idx) => {
              const pos = projectToCanvas(r.lat + idx * 0.004, r.lng - idx * 0.005);
              const isSelected = selectedRental?.id === r.id;
              return (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => setSelectedPinId(r.id)}
                  style={{ left: `${pos.xPct}%`, top: `${pos.yPct}%` }}
                  className={`absolute -translate-x-1/2 -translate-y-1/2 transition z-20 flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl font-mono text-xs font-bold shadow-lg whitespace-nowrap cursor-pointer ${
                    isSelected
                      ? "bg-amber-400 text-slate-950 ring-4 ring-amber-400/30 scale-110"
                      : "bg-slate-950/90 text-amber-400 border border-amber-500/50 hover:scale-105"
                  }`}
                >
                  <MapPin className="w-3.5 h-3.5 shrink-0" />
                  {r.equipmentCode}
                </button>
              );
            })}
          </div>

          {/* Selected Pin Details Bar */}
          {selectedRental && (
            <div className="rounded-2xl bg-slate-900 border border-slate-800 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs font-bold px-2 py-0.5 rounded bg-amber-500 text-slate-950 whitespace-nowrap">
                    {selectedRental.equipmentCode}
                  </span>
                  <span className="font-bold text-sm text-white">
                    {selectedRental.equipmentName}
                  </span>
                </div>
                <div className="text-xs text-slate-300 mt-1">
                  <strong>{selectedRental.customerName}</strong> •{" "}
                  {selectedRental.locationAddress}
                </div>
                <div className="text-[11px] text-slate-400 mt-0.5">
                  Since {selectedRental.startDate}{" "}
                  {selectedRental.endDate ? `→ Ends ${selectedRental.endDate}` : "• Ongoing Monthly"} •{" "}
                  {formatCAD(selectedRental.monthlyRateCents)}/mo
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <a
                  href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
                    selectedRental.locationAddress
                  )}`}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 rounded-xl border border-slate-700 hover:bg-slate-800 text-xs font-semibold text-slate-200 px-3 py-2 whitespace-nowrap"
                >
                  Street View <ExternalLink className="w-3 h-3" />
                </a>
                <button
                  type="button"
                  disabled={isPending}
                  onClick={() => {
                    setError(null);
                    startTransition(async () => {
                      const res = await returnEquipmentRentalAction(selectedRental.id);
                      if (!res.ok) setError(res.error);
                      else
                        setFeedback(
                          `Returned ${selectedRental.equipmentCode} and automatically stopped ${res.stoppedPlansCount} recurring billing plan(s)!`
                        );
                    });
                  }}
                  className="inline-flex items-center gap-1 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold px-3.5 py-2 whitespace-nowrap cursor-pointer"
                >
                  <RotateCcw className="w-3.5 h-3.5" /> Return & Stop Billing
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Book Equipment Rental Form (with Postgres Double-Booking Guard) */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            setError(null);
            setFeedback(null);
            startTransition(async () => {
              const res = await bookEquipmentRentalAction({
                equipmentId,
                customerId,
                startDate,
                endDate,
                monthlyRateDollars,
                locationAddress,
                poReference,
                notes,
              });
              if (!res.ok) {
                setError(res.error);
              } else {
                setFeedback(
                  "Equipment booked and added to monthly recurring billing! (Mid-month starts automatically charge half a month first.)"
                );
              }
            });
          }}
          className="lg:col-span-5 rounded-3xl bg-white border border-slate-200/90 p-6 shadow-xs space-y-4"
        >
          <div className="flex items-center justify-between">
            <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <Calendar className="w-4 h-4 text-amber-600" />
              Book Equipment Rental
            </h2>
            <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full whitespace-nowrap">
              <ShieldCheck className="w-3 h-3" /> Double-Book Guard
            </span>
          </div>

          <div className="space-y-3">
            <div>
              <label
                htmlFor="rental-unit-select"
                className="block text-xs font-semibold text-slate-700 mb-1"
              >
                Equipment Unit
              </label>
              <select
                id="rental-unit-select"
                name="equipmentId"
                value={equipmentId}
                onChange={(e) => {
                  const id = Number(e.target.value);
                  setEquipmentId(id);
                  const found = equipmentList.find((item) => item.id === id);
                  if (found) {
                    setMonthlyRateDollars(
                      centsToDecimalString(found.defaultMonthlyRateCents)
                    );
                  }
                }}
                className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
              >
                {equipmentList.map((eqItem) => (
                  <option key={eqItem.id} value={eqItem.id}>
                    {eqItem.code} — {eqItem.name} ({formatCAD(eqItem.defaultMonthlyRateCents)}/mo •{" "}
                    {eqItem.status.toUpperCase()})
                  </option>
                ))}
              </select>
              {selectedFormUnitBookings.length > 0 && (
                <div className="mt-1.5 rounded-lg bg-amber-50 border border-amber-200 px-2.5 py-1.5 text-[11px] text-amber-900 flex items-start gap-1.5">
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0 mt-0.5" />
                  <span>
                    Currently rented to <strong>{selectedFormUnitBookings[0]!.customerName}</strong> (
                    {selectedFormUnitBookings[0]!.startDate} →{" "}
                    {selectedFormUnitBookings[0]!.endDate || "Ongoing"}). Overlapping dates will be blocked.
                  </span>
                </div>
              )}
            </div>

            <div>
              <label
                htmlFor="rental-customer-select"
                className="block text-xs font-semibold text-slate-700 mb-1"
              >
                Customer (Sage)
              </label>
              <select
                id="rental-customer-select"
                name="customerId"
                value={customerId}
                onChange={(e) => {
                  const id = Number(e.target.value);
                  setCustomerId(id);
                  const cust = customers.find((c) => c.id === id);
                  if (cust) {
                    setLocationAddress(
                      `${cust.addressLine1 ?? ""}, ${cust.city ?? "Halifax"}`
                    );
                  }
                }}
                className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
              >
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label
                  htmlFor="rental-start-date"
                  className="block text-xs font-semibold text-slate-700 mb-1"
                >
                  Start Date
                </label>
                <input
                  id="rental-start-date"
                  name="startDate"
                  type="date"
                  required
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
                />
              </div>
              <div>
                <label
                  htmlFor="rental-end-date"
                  className="block text-xs font-semibold text-slate-700 mb-1"
                >
                  End Date (Blank = Monthly)
                </label>
                <input
                  id="rental-end-date"
                  name="endDate"
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label
                  htmlFor="rental-rate-dollars"
                  className="block text-xs font-semibold text-slate-700 mb-1"
                >
                  Monthly Rate ($)
                </label>
                <input
                  id="rental-rate-dollars"
                  name="monthlyRateDollars"
                  type="text"
                  required
                  value={monthlyRateDollars}
                  onChange={(e) => setMonthlyRateDollars(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-mono text-slate-900"
                />
              </div>
              <div>
                <label
                  htmlFor="rental-po-ref"
                  className="block text-xs font-semibold text-slate-700 mb-1"
                >
                  PO / Reference
                </label>
                <input
                  id="rental-po-ref"
                  name="poReference"
                  type="text"
                  value={poReference}
                  onChange={(e) => setPoReference(e.target.value)}
                  placeholder="Optional PO#"
                  className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
                />
              </div>
            </div>

            <div>
              <label
                htmlFor="rental-placement-address"
                className="block text-xs font-semibold text-slate-700 mb-1"
              >
                Placement Address (Shown on Map)
              </label>
              <input
                id="rental-placement-address"
                name="locationAddress"
                type="text"
                required
                value={locationAddress}
                onChange={(e) => setLocationAddress(e.target.value)}
                placeholder="e.g. 1650 Bedford Highway (South Entrance)"
                className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
              />
            </div>

            <div>
              <label
                htmlFor="rental-notes"
                className="block text-xs font-semibold text-slate-700 mb-1"
              >
                Sign Copy / Placement Notes
              </label>
              <input
                id="rental-notes"
                name="notes"
                type="text"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Letterboard text or delivery instructions…"
                className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={isPending}
            className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-slate-950 hover:bg-slate-800 text-white font-semibold text-sm py-3 px-4 transition disabled:opacity-50 cursor-pointer"
          >
            <Plus className="w-4 h-4 text-amber-400" />
            {isPending ? "Checking Availability & Booking…" : "Book Equipment & Start Recurring Plan"}
          </button>
        </form>
      </div>

      {/* Equipment Availability & Booking Calendar Matrix */}
      <div className="rounded-3xl bg-white border border-slate-200/90 shadow-xs overflow-hidden">
        <div className="p-5 border-b border-slate-100">
          <h2 className="text-base font-bold text-slate-900">
            Fleet Inventory & Booking Schedule ({equipmentList.length} Units)
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            PostgreSQL prevents any two active or scheduled bookings on the same unit from overlapping
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/70 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                <th className="py-3.5 px-4">Code & Unit</th>
                <th className="py-3.5 px-4">Status</th>
                <th className="py-3.5 px-4">Standard Rate</th>
                <th className="py-3.5 px-4">Active / Scheduled Bookings</th>
                <th className="py-3.5 px-4 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {equipmentList.map((eqItem) => {
                const unitRentals = activeRentals.filter(
                  (r) => r.equipmentId === eqItem.id
                );
                return (
                  <tr key={eqItem.id} className="hover:bg-slate-50/70">
                    <td className="py-4 px-4">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs font-bold px-2 py-0.5 rounded bg-slate-900 text-amber-400 whitespace-nowrap shrink-0">
                          {eqItem.code}
                        </span>
                        <span className="font-semibold text-slate-900">
                          {eqItem.name}
                        </span>
                      </div>
                      <div className="text-xs text-slate-500 mt-0.5">
                        {eqItem.conditionNotes}
                      </div>
                    </td>
                    <td className="py-4 px-4 whitespace-nowrap">
                      {unitRentals.length > 0 ? (
                        <span className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-0.5 rounded-full bg-amber-50 text-amber-800 border border-amber-200 whitespace-nowrap">
                          Rented
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 whitespace-nowrap">
                          <CheckCircle2 className="w-3 h-3" /> Available
                        </span>
                      )}
                    </td>
                    <td className="py-4 px-4 font-semibold text-slate-900 whitespace-nowrap">
                      {formatCAD(eqItem.defaultMonthlyRateCents)}/mo
                    </td>
                    <td className="py-4 px-4">
                      {unitRentals.length === 0 ? (
                        <span className="text-xs text-slate-400">
                          Ready at 3797 Mackintosh St yard
                        </span>
                      ) : (
                        <div className="space-y-1">
                          {unitRentals.map((r) => (
                            <div key={r.id} className="text-xs text-slate-800">
                              <strong>{r.customerName}</strong> ({r.startDate} →{" "}
                              {r.endDate || "Ongoing Monthly"}) •{" "}
                              <span className="text-slate-500">{r.locationAddress}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </td>
                    <td className="py-4 px-4 text-right whitespace-nowrap">
                      {unitRentals[0] ? (
                        <button
                          type="button"
                          disabled={isPending}
                          onClick={() => {
                            setError(null);
                            startTransition(async () => {
                              const res = await returnEquipmentRentalAction(
                                unitRentals[0]!.id
                              );
                              if (!res.ok) setError(res.error);
                              else
                                setFeedback(
                                  `Returned ${eqItem.code} and automatically ended ${res.stoppedPlansCount} recurring billing plan(s).`
                                );
                            });
                          }}
                          className="inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-800 font-semibold text-xs px-3 py-1.5 whitespace-nowrap cursor-pointer"
                        >
                          <RotateCcw className="w-3 h-3 text-emerald-600" /> Return Unit
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => selectUnitForBooking(eqItem)}
                          className={`inline-flex items-center gap-1 rounded-lg text-xs font-semibold px-3 py-1.5 whitespace-nowrap cursor-pointer transition ${
                            equipmentId === eqItem.id
                              ? "bg-amber-100 text-amber-900 border border-amber-300"
                              : "border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-700"
                          }`}
                        >
                          {equipmentId === eqItem.id ? "✓ Selected in Form" : "Select Unit →"}
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
