"use client";

import React, { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { Building2, Filter, Mail, MapPin, Phone, Plus, Search } from "lucide-react";
import { createCustomerAction } from "@/app/actions";
import { PROVINCE_CODES } from "@/lib/tax";

interface CustomerRow {
  id: number;
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

export function CustomersClient({ customers }: { customers: CustomerRow[] }) {
  const [search, setSearch] = useState("");
  const [cityFilter, setCityFilter] = useState<string>("all");
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

  const cities = useMemo(() => {
    const set = new Set<string>();
    for (const c of customers) {
      if (c.city) set.add(c.city);
    }
    return Array.from(set).sort();
  }, [customers]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return customers.filter((c) => {
      if (cityFilter !== "all" && c.city !== cityFilter) return false;
      if (!q) return true;
      return (
        c.name.toLowerCase().includes(q) ||
        (c.companyName ?? "").toLowerCase().includes(q) ||
        (c.contactPerson ?? "").toLowerCase().includes(q) ||
        (c.email ?? "").toLowerCase().includes(q) ||
        (c.city ?? "").toLowerCase().includes(q)
      );
    });
  }, [customers, search, cityFilter]);

  return (
    <div className="flex-1 flex flex-col min-h-0">
      {/* Goodshuffle Pro Top Bar */}
      <div className="bg-white border-b border-slate-200 px-6 h-16 flex items-center justify-between gap-4 shrink-0">
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-normal text-slate-600 tracking-tight">Directory</h1>
          <span className="text-xs text-slate-400 border-l border-slate-200 pl-3 tabular-nums">
            {customers.length} Commercial Accounts
          </span>
        </div>

        <button
          type="button"
          onClick={() => setShowAdd((v) => !v)}
          className="inline-flex items-center gap-1.5 rounded-xs bg-[#186ade] hover:bg-[#1458b8] text-white font-semibold text-xs px-3.5 py-2 cursor-pointer shadow-2xs transition"
        >
          <Plus className="w-3.5 h-3.5 stroke-[2.5]" />
          {showAdd ? "Close Form" : "New Company / Contact"}
        </button>
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
            {(search || cityFilter !== "all") && (
              <button
                type="button"
                onClick={() => {
                  setSearch("");
                  setCityFilter("all");
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
              Search Accounts
            </label>
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                id="customer-search-input"
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Company, contact, email…"
                className="w-full rounded-xs border border-slate-300 bg-white pl-8 pr-2.5 py-1.5 text-xs text-slate-800 focus:border-[#186ade] focus:outline-none"
              />
            </div>
          </div>

          <div className="space-y-1 pt-2 border-t border-slate-100">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-2">
              Location / Municipality
            </div>
            <button
              type="button"
              onClick={() => setCityFilter("all")}
              className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-xs text-xs transition cursor-pointer ${
                cityFilter === "all"
                  ? "bg-blue-50 text-[#186ade] font-semibold"
                  : "text-slate-600 hover:bg-slate-50"
              }`}
            >
              <span>All Locations</span>
              <span className="tabular-nums text-slate-400">{customers.length}</span>
            </button>
            {cities.map((cName) => (
              <button
                key={cName}
                type="button"
                onClick={() => setCityFilter(cName)}
                className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-xs text-xs transition cursor-pointer ${
                  cityFilter === cName
                    ? "bg-blue-50 text-[#186ade] font-semibold"
                    : "text-slate-600 hover:bg-slate-50"
                }`}
              >
                <span>{cName}</span>
                <span className="tabular-nums text-slate-400">
                  {customers.filter((x) => x.city === cName).length}
                </span>
              </button>
            ))}
          </div>
        </aside>

        {/* Right Spreadsheet Data Table */}
        <div className="flex-1 bg-white overflow-x-auto">
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
              {filtered.map((c) => {
                const cleanContact =
                  c.contactPerson && !c.contactPerson.includes("@") ? c.contactPerson : "—";
                return (
                  <tr key={c.id} className="hover:bg-blue-50/30 transition group">
                    <td className="py-3 px-4 border-r border-slate-200">
                      <div className="flex items-start gap-2">
                        <Building2 className="w-3.5 h-3.5 text-slate-400 shrink-0 mt-0.5" />
                        <div>
                          <Link
                            href={`/customers/${c.id}`}
                            className="font-semibold text-slate-800 group-hover:text-[#186ade] hover:underline"
                          >
                            {c.name}
                          </Link>
                          {c.siteNotes && (
                            <div className="text-[11px] text-slate-400 truncate max-w-xs mt-0.5">
                              {c.siteNotes}
                            </div>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="py-3 px-3.5 border-r border-slate-200 text-slate-700">
                      {cleanContact}
                    </td>
                    <td className="py-3 px-3.5 border-r border-slate-200">
                      {c.email ? (
                        <a
                          href={`mailto:${c.email}`}
                          className="text-[#186ade] hover:underline inline-flex items-center gap-1"
                        >
                          <Mail className="w-3 h-3 text-slate-400" />
                          {c.email}
                        </a>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>
                    <td className="py-3 px-3.5 border-r border-slate-200 tabular-nums whitespace-nowrap">
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
                    <td className="py-3 px-3.5 border-r border-slate-200 text-slate-600">
                      <div className="flex items-center gap-1">
                        <MapPin className="w-3 h-3 text-slate-400 shrink-0" />
                        <span>
                          {c.addressLine1}, {c.city}, {c.province}
                        </span>
                      </div>
                    </td>
                    <td className="py-3 px-3.5 border-r border-slate-200 whitespace-nowrap">
                      <span className="text-[11px] font-semibold px-2 py-0.5 rounded-xs bg-slate-100 text-slate-700 border border-slate-200">
                        {c.province} HST
                      </span>
                    </td>
                    <td className="py-3 px-3.5 text-right whitespace-nowrap">
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
      </div>
    </div>
  );
}
