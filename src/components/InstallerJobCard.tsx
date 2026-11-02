"use client";

import React, { useState, useTransition } from "react";
import Link from "next/link";
import {
  Camera,
  CheckCircle2,
  MapPin,
  Navigation,
  Phone,
  Play,
} from "lucide-react";
import { updateJobStatusAction, uploadJobPhotoAction } from "@/app/actions";

export function InstallerJobCard({
  job,
  customer,
  items,
  photoCount,
}: {
  job: {
    id: number;
    jobNumber: string | null;
    title: string;
    status: string;
    priority: string;
    scheduledDate: string | null;
    siteAddress: string | null;
    siteProvince: string;
    installerNotes: string | null;
  };
  customer: {
    name: string;
    contactPerson: string | null;
    phone: string | null;
    addressLine1: string | null;
    city: string | null;
    siteNotes: string | null;
  };
  items: { id: number; description: string; quantity: string }[];
  photoCount: number;
}) {
  const [isPending, startTransition] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);

  const address =
    job.siteAddress || `${customer.addressLine1 ?? ""}, ${customer.city ?? "Halifax"}`;
  const mapsUrl = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(
    address
  )}`;

  return (
    <div className="rounded-3xl bg-white border border-slate-200/90 p-5 shadow-xs space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-mono text-xs font-black px-2.5 py-1 rounded-lg bg-slate-950 text-amber-400">
              {job.jobNumber ? `#${job.jobNumber}` : "⏳ Pending Sage #"}
            </span>
            <span className="text-xs font-semibold uppercase px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-800">
              {job.status.replace("_", " ")}
            </span>
            {job.priority === "rush" && (
              <span className="text-xs font-bold uppercase px-2 py-0.5 rounded-full bg-rose-100 text-rose-700">
                RUSH
              </span>
            )}
          </div>
          <Link
            href={`/jobs/${job.id}`}
            className="block text-base sm:text-lg font-bold text-slate-900 hover:text-amber-600 mt-1.5"
          >
            {job.title}
          </Link>
          <div className="text-xs text-slate-600 font-medium">
            {customer.name} • Scheduled: <strong>{job.scheduledDate || "TBD"}</strong>
          </div>
        </div>
      </div>

      {/* 1-Tap Navigation & Phone Call Buttons */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
        <a
          href={mapsUrl}
          target="_blank"
          rel="noreferrer"
          className="flex items-center justify-center gap-2 rounded-2xl bg-slate-900 hover:bg-slate-800 text-white font-semibold text-xs py-3 px-4 transition"
        >
          <Navigation className="w-4 h-4 text-amber-400" />
          Navigate: {address}
        </a>
        {customer.phone ? (
          <a
            href={`tel:${customer.phone}`}
            className="flex items-center justify-center gap-2 rounded-2xl border border-slate-300 bg-white hover:bg-slate-50 text-slate-900 font-semibold text-xs py-3 px-4 transition"
          >
            <Phone className="w-4 h-4 text-emerald-600" />
            Call {customer.contactPerson || customer.name} ({customer.phone})
          </a>
        ) : (
          <div className="flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 text-slate-400 text-xs py-3 px-4">
            <MapPin className="w-4 h-4" /> {job.siteProvince}
          </div>
        )}
      </div>

      {/* Work Order Scope */}
      <div className="rounded-2xl bg-slate-50 p-3.5 border border-slate-200/80 space-y-1.5">
        <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
          Work Order Items
        </div>
        {items.map((it) => (
          <div key={it.id} className="text-xs text-slate-800 flex justify-between">
            <span>• {it.description}</span>
            <strong className="ml-2">Qty {it.quantity}</strong>
          </div>
        ))}
      </div>

      {/* Site & Installer Notes */}
      {(job.installerNotes || customer.siteNotes) && (
        <div className="rounded-2xl bg-amber-50 border border-amber-200 p-3.5 space-y-1 text-xs text-amber-950">
          <div className="font-bold uppercase tracking-wider text-[11px] text-amber-800">
            Site Access & Installer Notes
          </div>
          {job.installerNotes && <div>{job.installerNotes}</div>}
          {customer.siteNotes && <div>{customer.siteNotes}</div>}
        </div>
      )}

      {msg && (
        <div className="rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900 px-3.5 py-2 text-xs font-semibold">
          {msg}
        </div>
      )}

      {/* Camera Upload + 1-Tap Status Buttons */}
      <div className="pt-2 border-t border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <form
          action={async (fd) => {
            const res = await uploadJobPhotoAction(fd);
            if (res.ok) setMsg("Photo uploaded & mirrored to Google Drive!");
            else setMsg(res.error);
          }}
          className="flex items-center gap-2"
        >
          <input type="hidden" name="jobId" value={job.id} />
          <input type="hidden" name="kind" value="install_photo" />
          <label className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-slate-800 font-semibold text-xs px-3.5 py-2.5 cursor-pointer">
            <Camera className="w-4 h-4 text-amber-600" />
            <span>Snap Photo ({photoCount})</span>
            <input
              type="file"
              name="file"
              accept="image/*"
              capture="environment"
              onChange={(e) => e.currentTarget.form?.requestSubmit()}
              className="hidden"
            />
          </label>
        </form>

        <div className="flex items-center gap-2">
          {job.status !== "in_progress" && job.status !== "installed" && (
            <button
              type="button"
              disabled={isPending}
              onClick={() =>
                startTransition(async () => {
                  await updateJobStatusAction({
                    jobId: job.id,
                    status: "in_progress",
                  });
                  setMsg("Marked In Progress.");
                })
              }
              className="flex-1 sm:flex-initial inline-flex items-center justify-center gap-1.5 rounded-xl bg-slate-200 hover:bg-slate-300 text-slate-900 font-semibold text-xs px-4 py-2.5"
            >
              <Play className="w-3.5 h-3.5" /> Start Install
            </button>
          )}

          {job.status !== "installed" && (
            <button
              type="button"
              disabled={isPending}
              onClick={() =>
                startTransition(async () => {
                  await updateJobStatusAction({
                    jobId: job.id,
                    status: "installed",
                  });
                  setMsg("Marked Installed! Queued for Office to Send Sage Invoice.");
                })
              }
              className="flex-1 sm:flex-initial inline-flex items-center justify-center gap-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs px-4 py-2.5 shadow-xs"
            >
              <CheckCircle2 className="w-4 h-4" /> Mark Installed
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
