"use client";

import React, { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { MapPin, Phone, Plus, Search } from "lucide-react";
import { createCustomerAction } from "@/app/actions";
import { PROVINCE_CODES } from "@/lib/tax";

interface CustomerRow {
  id: number;
  sageId: string | null;
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

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return customers;
    return customers.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        (c.companyName ?? "").toLowerCase().includes(q) ||
        (c.email ?? "").toLowerCase().includes(q) ||
        (c.city ?? "").toLowerCase().includes(q)
    );
  }, [customers, search]);

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search customers by name, contact, email, or city…"
            className="w-full rounded-xl border border-slate-300 bg-white pl-10 pr-4 py-2.5 text-sm text-slate-900"
          />
        </div>

        <button
          type="button"
          onClick={() => setShowAdd((v) => !v)}
          className="inline-flex items-center gap-1.5 rounded-xl bg-slate-950 hover:bg-slate-800 text-white font-semibold text-xs px-4 py-2.5"
        >
          <Plus className="w-4 h-4 text-amber-400" />
          {showAdd ? "Close Form" : "Add Customer (Sync to Sage)"}
        </button>
      </div>

      {showAdd && (
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
          className="rounded-2xl bg-white border border-slate-200 p-5 shadow-xs space-y-4"
        >
          <h2 className="text-sm font-bold text-slate-900">
            New Sage Customer Contact
          </h2>
          {error && (
            <div className="text-xs text-rose-600 font-semibold">{error}</div>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Company / Customer Name
              </label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full rounded-xl border border-slate-300 px-3 py-2 text-xs text-slate-900"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Contact Person
              </label>
              <input
                type="text"
                value={contactPerson}
                onChange={(e) => setContactPerson(e.target.value)}
                className="w-full rounded-xl border border-slate-300 px-3 py-2 text-xs text-slate-900"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Email
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-xl border border-slate-300 px-3 py-2 text-xs text-slate-900"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Phone
              </label>
              <input
                type="text"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="w-full rounded-xl border border-slate-300 px-3 py-2 text-xs text-slate-900"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Street Address
              </label>
              <input
                type="text"
                value={addressLine1}
                onChange={(e) => setAddressLine1(e.target.value)}
                className="w-full rounded-xl border border-slate-300 px-3 py-2 text-xs text-slate-900"
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  City
                </label>
                <input
                  type="text"
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 px-3 py-2 text-xs text-slate-900"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Province
                </label>
                <select
                  value={province}
                  onChange={(e) => setProvince(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 px-2.5 py-2 text-xs text-slate-900"
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
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Site Access & Installer Notes
              </label>
              <input
                type="text"
                value={siteNotes}
                onChange={(e) => setSiteNotes(e.target.value)}
                placeholder="Loading bay location, gate code, or site contact…"
                className="w-full rounded-xl border border-slate-300 px-3 py-2 text-xs text-slate-900"
              />
            </div>
            <div className="flex items-end">
              <button
                type="submit"
                disabled={isPending}
                className="w-full rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs py-2.5 px-4"
              >
                {isPending ? "Saving…" : "Save & Sync to Sage"}
              </button>
            </div>
          </div>
        </form>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {filtered.map((c) => (
          <div
            key={c.id}
            className="rounded-2xl bg-white border border-slate-200/90 p-5 shadow-xs flex flex-col justify-between gap-3"
          >
            <div>
              <div className="flex items-center justify-between gap-2">
                <h3 className="font-bold text-base text-slate-900">{c.name}</h3>
                <span className="font-mono text-[11px] font-semibold text-slate-500 bg-slate-100 px-2 py-0.5 rounded">
                  {c.sageId || "Sage Synced"}
                </span>
              </div>
              <div className="text-xs text-slate-600 mt-1 flex flex-wrap items-center gap-3">
                {c.contactPerson && <span>Contact: {c.contactPerson}</span>}
                {c.email && <span>{c.email}</span>}
                {c.phone && (
                  <span className="inline-flex items-center gap-1 font-medium text-slate-800">
                    <Phone className="w-3 h-3" /> {c.phone}
                  </span>
                )}
              </div>
              <div className="text-xs text-slate-500 mt-1.5 flex items-center gap-1">
                <MapPin className="w-3.5 h-3.5 text-amber-600" />
                {c.addressLine1}, {c.city}, {c.province} {c.postalCode}
              </div>
              {c.siteNotes && (
                <div className="mt-2 rounded-lg bg-amber-50 border border-amber-200 px-3 py-1.5 text-xs text-amber-950">
                  <strong>Site Note:</strong> {c.siteNotes}
                </div>
              )}
            </div>

            <div className="pt-2 border-t border-slate-100 flex items-center justify-end">
              <Link
                href="/quotes/new"
                className="text-xs font-semibold text-amber-600 hover:underline"
              >
                + New Quote for {c.name} →
              </Link>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
