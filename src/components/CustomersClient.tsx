"use client";

import React, { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import {
  Building2,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Download,
  Filter,
  Mail,
  MapPin,
  Phone,
  Plus,
  Search,
} from "lucide-react";
import { createCustomerAction } from "@/app/actions";
import { PROVINCE_CODES } from "@/lib/tax";

interface CustomerRow {
  id: number;
  sageId?: string | null;
  name: string;
  companyName: string | null;
  contactPerson: string | null;
  email: string | null;
  phone: string | null;
  addressLine1: string | null;
  city: string | null;
  province: string;
  postalCode: string | null;
  siteNotes: string | null;
}

const PAGE_SIZE = 100;

export function CustomersClient({ customers }: { customers: CustomerRow[] }) {
  const [search, setSearch] = useState("");
  const [provinceFilter, setProvinceFilter] = useState<string>("all");
  const [cityFilter, setCityFilter] = useState<string>("all");
  const [page, setPage] = useState(1);
  const [showAdd, setShowAdd] = useState(false);
  const [isPending, startTransition] = useTransition();

  const [name, setName] = useState("");
  const [contactPerson, setContactPerson] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [addressLine1, setAddressLine1] = useState("");
  const [city, setCity] = useState("Halifax");
  const [province, setProvince] = useState("NS");
  const [postalCode, setPostalCode] = useState("");
  const [siteNotes, setSiteNotes] = useState("");
  const [error, setError] = useState<string | null>(null);

  const provinceCounts = useMemo(() => {
    const map = new Map<string, number>();
    for (const c of customers) {
      const p = c.province || "NS";
      map.set(p, (map.get(p) ?? 0) + 1);
    }
    return Array.from(map.entries()).sort((a, b) => b[1] - a[1]);
  }, [customers]);

  const topCities = useMemo(() => {
    const map = new Map<string, number>();
    for (const c of customers) {
      if (provinceFilter !== "all" && c.province !== provinceFilter) continue;
      const cleanCity = (c.city ?? "").trim();
      if (!cleanCity) continue;
      map.set(cleanCity, (map.get(cleanCity) ?? 0) + 1);
    }
    return Array.from(map.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 12);
  }, [customers, provinceFilter]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return customers.filter((c) => {
      if (provinceFilter !== "all" && c.province !== provinceFilter) return false;
      if (cityFilter !== "all" && (c.city ?? "").trim() !== cityFilter) return false;
      if (!q) return true;
      return (
        c.name.toLowerCase().includes(q) ||
        (c.companyName ?? "").toLowerCase().includes(q) ||
        (c.contactPerson ?? "").toLowerCase().includes(q) ||
        (c.email ?? "").toLowerCase().includes(q) ||
        (c.phone ?? "").toLowerCase().includes(q) ||
        (c.addressLine1 ?? "").toLowerCase().includes(q) ||
        (c.city ?? "").toLowerCase().includes(q) ||
        (c.sageId ?? "").toLowerCase().includes(q)
      );
    });
  }, [customers, search, provinceFilter, cityFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const startIdx = (safePage - 1) * PAGE_SIZE;
  const pageRows = filtered.slice(startIdx, startIdx + PAGE_SIZE);

  function downloadCsv() {
    const headers = [
      "Sage ID",
      "Company / Account Name",
      "Contact Person",
      "Email",
      "Phone",
      "Address",
      "City",
      "Province",
      "Postal Code",
      "Notes",
    ];
    const rows = filtered.map((c) => [
      c.sageId ?? "",
      c.name,
      c.contactPerson ?? "",
      c.email ?? "",
      c.phone ?? "",
      c.addressLine1 ?? "",
      c.city ?? "",
      c.province,
      c.postalCode ?? "",
      c.siteNotes ?? "",
    ]);
    const csv = [headers, ...rows]
      .map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `giant-promotions-sage-customers-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="flex-1 flex flex-col min-h-0">
      {/* Goodshuffle Pro Top Bar */}
      <div className="bg-white border-b border-slate-200 px-6 h-16 flex items-center justify-between gap-4 shrink-0">
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-normal text-slate-600 tracking-tight">Directory</h1>
          <span className="text-xs text-slate-500 border-l border-slate-200 pl-3 tabular-nums font-medium">
            {customers.length.toLocaleString()} Commercial Accounts
          </span>
          <span className="hidden sm:inline-flex items-center gap-1 rounded-xs bg-emerald-50 border border-emerald-200 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">
            <CheckCircle2 className="w-3 h-3 text-emerald-600" />
            Sage Master List Synced
          </span>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={downloadCsv}
            className="inline-flex items-center gap-1.5 rounded-xs border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 font-semibold text-xs px-3 py-2 cursor-pointer transition"
          >
            <Download className="w-3.5 h-3.5 text-slate-500" />
            Export CSV ({filtered.length})
          </button>
          <button
            type="button"
            onClick={() => setShowAdd((v) => !v)}
            className="inline-flex items-center gap-1.5 rounded-xs bg-[#186ade] hover:bg-[#1458b8] text-white font-semibold text-xs px-3.5 py-2 cursor-pointer shadow-2xs transition"
          >
            <Plus className="w-3.5 h-3.5 stroke-[2.5]" />
            {showAdd ? "Close Form" : "New Company / Contact"}
          </button>
        </div>
      </div>

      {showAdd && (
        <div className="bg-[#f8fafc] border-b border-slate-200 px-6 py-4">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              setError(null);
              startTransition(async () => {
                const res = await createCustomerAction({
                  name,
                  companyName: name,
                  contactPerson,
                  email,
                  phone,
                  addressLine1,
                  city,
                  province,
                  postalCode,
                  siteNotes,
                });
                if (!res.ok) setError(res.error);
                else {
                  setShowAdd(false);
                  setName("");
                  setContactPerson("");
                  setEmail("");
                  setPhone("");
                  setAddressLine1("");
                  setSiteNotes("");
                }
              });
            }}
            className="max-w-6xl rounded-xs bg-white border border-slate-200 p-4 shadow-2xs space-y-3"
          >
            <div className="text-xs font-bold uppercase tracking-wider text-slate-700 border-b border-slate-100 pb-2">
              Add Commercial Account
            </div>
            {error && <div className="text-xs text-rose-600 font-semibold">{error}</div>}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                  Company / Account Name *
                </label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full rounded-xs border border-slate-300 px-2.5 py-1.5 text-xs text-slate-900"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                  Primary Contact Person
                </label>
                <input
                  type="text"
                  value={contactPerson}
                  onChange={(e) => setContactPerson(e.target.value)}
                  className="w-full rounded-xs border border-slate-300 px-2.5 py-1.5 text-xs text-slate-900"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                  Email Address
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full rounded-xs border border-slate-300 px-2.5 py-1.5 text-xs text-slate-900"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                  Phone Number
                </label>
                <input
                  type="text"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="w-full rounded-xs border border-slate-300 px-2.5 py-1.5 text-xs text-slate-900"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                  Street Address
                </label>
                <input
                  type="text"
                  value={addressLine1}
                  onChange={(e) => setAddressLine1(e.target.value)}
                  className="w-full rounded-xs border border-slate-300 px-2.5 py-1.5 text-xs text-slate-900"
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                    City
                  </label>
                  <input
                    type="text"
                    value={city}
                    onChange={(e) => setCity(e.target.value)}
                    className="w-full rounded-xs border border-slate-300 px-2.5 py-1.5 text-xs text-slate-900"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                    Province
                  </label>
                  <select
                    value={province}
                    onChange={(e) => setProvince(e.target.value)}
                    className="w-full rounded-xs border border-slate-300 px-2 py-1.5 text-xs text-slate-900"
                  >
                    {PROVINCE_CODES.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="sm:col-span-2">
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                  Site Access &amp; Installation Notes
                </label>
                <input
                  type="text"
                  value={siteNotes}
                  onChange={(e) => setSiteNotes(e.target.value)}
                  placeholder="Loading dock, gate code, or on-site superintendent…"
                  className="w-full rounded-xs border border-slate-300 px-2.5 py-1.5 text-xs text-slate-900"
                />
              </div>
              <div className="flex items-end">
                <button
                  type="submit"
                  disabled={isPending}
                  className="w-full rounded-xs bg-[#186ade] hover:bg-[#1458b8] text-white font-semibold text-xs py-1.5 px-4 cursor-pointer"
                >
                  {isPending ? "Saving…" : "Save Account"}
                </button>
              </div>
            </div>
          </form>
        </div>
      )}

      {/* Split Workspace: Left Filter Sidebar + Right Spreadsheet Table */}
      <div className="flex-1 flex flex-col lg:flex-row min-h-0">
        {/* Left Filter Column */}
        <aside className="w-full lg:w-60 bg-white border-b lg:border-b-0 lg:border-r border-slate-200 p-4 space-y-5 shrink-0">
          <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
              <Filter className="w-3.5 h-3.5 text-slate-400" /> Directory Filters
            </span>
            {(search || provinceFilter !== "all" || cityFilter !== "all") && (
              <button
                type="button"
                onClick={() => {
                  setSearch("");
                  setProvinceFilter("all");
                  setCityFilter("all");
                  setPage(1);
                }}
                className="text-xs text-[#186ade] hover:underline font-medium cursor-pointer"
              >
                Reset
              </button>
            )}
          </div>

          <div>
            <label
              htmlFor="customer-search-input"
              className="block text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-1"
            >
              Search Sage Accounts
            </label>
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                id="customer-search-input"
                type="text"
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
                placeholder="Company, email, Sage ID…"
                className="w-full rounded-xs border border-slate-300 bg-white pl-8 pr-2.5 py-1.5 text-xs text-slate-800 focus:border-[#186ade] focus:outline-none"
              />
            </div>
          </div>

          <div className="space-y-1 pt-2 border-t border-slate-100">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-1.5">
              Province
            </div>
            <div className="flex flex-wrap gap-1">
              <button
                type="button"
                onClick={() => {
                  setProvinceFilter("all");
                  setCityFilter("all");
                  setPage(1);
                }}
                className={`px-2 py-1 rounded-xs text-[11px] font-semibold border transition cursor-pointer ${
                  provinceFilter === "all"
                    ? "bg-[#186ade] text-white border-[#186ade]"
                    : "bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100"
                }`}
              >
                All ({customers.length})
              </button>
              {provinceCounts.map(([provCode, count]) => (
                <button
                  key={provCode}
                  type="button"
                  onClick={() => {
                    setProvinceFilter(provCode);
                    setCityFilter("all");
                    setPage(1);
                  }}
                  className={`px-2 py-1 rounded-xs text-[11px] font-semibold border transition cursor-pointer tabular-nums ${
                    provinceFilter === provCode
                      ? "bg-[#186ade] text-white border-[#186ade]"
                      : "bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100"
                  }`}
                >
                  {provCode} ({count})
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-1 pt-2 border-t border-slate-100">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-2">
              Top Municipalities
            </div>
            <button
              type="button"
              onClick={() => {
                setCityFilter("all");
                setPage(1);
              }}
              className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-xs text-xs transition cursor-pointer ${
                cityFilter === "all"
                  ? "bg-blue-50 text-[#186ade] font-semibold"
                  : "text-slate-600 hover:bg-slate-50"
              }`}
            >
              <span>All Locations</span>
              <span className="tabular-nums text-slate-400">{filtered.length}</span>
            </button>
            {topCities.map(([cName, count]) => (
              <button
                key={cName}
                type="button"
                onClick={() => {
                  setCityFilter(cName);
                  setPage(1);
                }}
                className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-xs text-xs transition cursor-pointer ${
                  cityFilter === cName
                    ? "bg-blue-50 text-[#186ade] font-semibold"
                    : "text-slate-600 hover:bg-slate-50"
                }`}
              >
                <span className="truncate">{cName}</span>
                <span className="tabular-nums text-slate-400">{count}</span>
              </button>
            ))}
          </div>
        </aside>

        {/* Right Spreadsheet Data Table */}
        <div className="flex-1 flex flex-col bg-white min-w-0">
          <div className="flex-1 overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-200 bg-[#f8fafc] text-[11px] font-bold text-slate-600">
                  <th className="py-3 px-4 border-r border-slate-200">Company / Account</th>
                  <th className="py-3 px-3.5 border-r border-slate-200">Primary Contact</th>
                  <th className="py-3 px-3.5 border-r border-slate-200">Email</th>
                  <th className="py-3 px-3.5 border-r border-slate-200">Phone</th>
                  <th className="py-3 px-3.5 border-r border-slate-200">Address &amp; City</th>
                  <th className="py-3 px-3.5 border-r border-slate-200">Tax Rule</th>
                  <th className="py-3 px-3.5 text-right">Quick Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {pageRows.map((c) => {
                  const cleanContact =
                    c.contactPerson &&
                    !c.contactPerson.includes("@") &&
                    c.contactPerson !== "Main Contact"
                      ? c.contactPerson
                      : "—";
                  const formattedAddress = [c.addressLine1, c.city, c.province, c.postalCode]
                    .map((part) => (part ?? "").trim())
                    .filter(Boolean)
                    .join(", ");

                  return (
                    <tr key={c.id} className="hover:bg-blue-50/30 transition group">
                      <td className="py-2.5 px-4 border-r border-slate-200">
                        <div className="flex items-start gap-2">
                          <Building2 className="w-3.5 h-3.5 text-slate-400 shrink-0 mt-0.5" />
                          <div className="min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <Link
                                href={`/customers/${c.id}`}
                                className="font-semibold text-slate-800 group-hover:text-[#186ade] hover:underline"
                              >
                                {c.name}
                              </Link>
                              {c.sageId && !c.sageId.startsWith("AUTO-") && c.sageId.length <= 12 && (
                                <span className="text-[10px] font-mono font-semibold px-1.5 py-0.2 rounded-xs bg-slate-100 text-slate-500 border border-slate-200">
                                  {c.sageId}
                                </span>
                              )}
                            </div>
                            {c.siteNotes && (
                              <div className="text-[11px] text-slate-400 truncate max-w-md mt-0.5">
                                {c.siteNotes}
                              </div>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="py-2.5 px-3.5 border-r border-slate-200 text-slate-700">
                        {cleanContact}
                      </td>
                      <td className="py-2.5 px-3.5 border-r border-slate-200">
                        {c.email ? (
                          <a
                            href={`mailto:${c.email}`}
                            className="text-[#186ade] hover:underline inline-flex items-center gap-1 break-all"
                          >
                            <Mail className="w-3 h-3 text-slate-400 shrink-0" />
                            {c.email}
                          </a>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>
                      <td className="py-2.5 px-3.5 border-r border-slate-200 tabular-nums whitespace-nowrap">
                        {c.phone ? (
                          <a
                            href={`tel:${c.phone}`}
                            className="text-slate-700 hover:text-[#186ade] inline-flex items-center gap-1"
                          >
                            <Phone className="w-3 h-3 text-slate-400" />
                            {c.phone}
                          </a>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>
                      <td className="py-2.5 px-3.5 border-r border-slate-200 text-slate-600">
                        <div className="flex items-center gap-1">
                          <MapPin className="w-3 h-3 text-slate-400 shrink-0" />
                          <span>{formattedAddress || c.province}</span>
                        </div>
                      </td>
                      <td className="py-2.5 px-3.5 border-r border-slate-200 whitespace-nowrap">
                        <span className="text-[11px] font-semibold px-2 py-0.5 rounded-xs bg-slate-100 text-slate-700 border border-slate-200">
                          {c.province} HST
                        </span>
                      </td>
                      <td className="py-2.5 px-3.5 text-right whitespace-nowrap">
                        <div className="inline-flex items-center gap-2">
                          <Link
                            href={`/customers/${c.id}`}
                            className="rounded-xs border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 font-semibold text-[11px] px-2.5 py-1"
                          >
                            Account Hub
                          </Link>
                          <Link
                            href={`/projects/new?customerId=${c.id}`}
                            className="rounded-xs bg-[#186ade] hover:bg-[#1458b8] text-white font-semibold text-[11px] px-2.5 py-1"
                          >
                            + Quote
                          </Link>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Sticky Pagination Footer */}
          <div className="bg-[#f8fafc] border-t border-slate-200 px-6 py-3 flex items-center justify-between text-xs text-slate-600 shrink-0">
            <div className="tabular-nums">
              Showing{" "}
              <span className="font-semibold text-slate-800">
                {filtered.length === 0 ? 0 : startIdx + 1}–
                {Math.min(startIdx + PAGE_SIZE, filtered.length)}
              </span>{" "}
              of <span className="font-semibold text-slate-800">{filtered.length}</span> commercial
              accounts
            </div>

            {totalPages > 1 && (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={safePage <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  className="inline-flex items-center gap-1 rounded-xs border border-slate-300 bg-white hover:bg-slate-50 disabled:opacity-40 px-2.5 py-1 font-semibold text-slate-700 cursor-pointer"
                >
                  <ChevronLeft className="w-3.5 h-3.5" /> Prev
                </button>
                <span className="tabular-nums font-medium px-2">
                  Page {safePage} of {totalPages}
                </span>
                <button
                  type="button"
                  disabled={safePage >= totalPages}
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  className="inline-flex items-center gap-1 rounded-xs border border-slate-300 bg-white hover:bg-slate-50 disabled:opacity-40 px-2.5 py-1 font-semibold text-slate-700 cursor-pointer"
                >
                  Next <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
