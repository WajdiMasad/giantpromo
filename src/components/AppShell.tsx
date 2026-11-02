"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  FileText,
  Briefcase,
  Signpost,
  Repeat,
  Users,
  HardHat,
  CheckCircle2,
  AlertTriangle,
  Sparkles,
  Plus,
} from "lucide-react";
import { switchActiveUserAction, toggleSageConnectionSimulationAction } from "@/app/actions";
import type { SessionUser } from "@/lib/auth";

interface AppShellProps {
  currentUser: SessionUser;
  allUsers: { id: number; name: string; email: string; role: string }[];
  sageState: {
    environment: string;
    businessName: string | null;
    nextNumberPreview: number;
    lastSyncStatus: string;
  };
  readyToSendCount: number;
  children: React.ReactNode;
}

export function AppShell({
  currentUser,
  allUsers,
  sageState,
  readyToSendCount,
  children,
}: AppShellProps) {
  const pathname = usePathname();

  // Do not wrap public customer quote portal (/q/[token]) in internal staff shell
  if (pathname?.startsWith("/q/")) {
    return <>{children}</>;
  }

  const navItems = [
    {
      href: "/",
      label: "Dashboard",
      icon: LayoutDashboard,
      roles: ["admin", "office"],
    },
    {
      href: "/quotes",
      label: "Quotes",
      icon: FileText,
      roles: ["admin", "office"],
    },
    {
      href: "/jobs",
      label: "Jobs & Sage Invoices",
      icon: Briefcase,
      badge: readyToSendCount > 0 ? `${readyToSendCount} ready` : undefined,
      roles: ["admin", "office"],
    },
    {
      href: "/equipment",
      label: "Equipment & Map",
      icon: Signpost,
      roles: ["admin", "office", "installer"],
    },
    {
      href: "/billing",
      label: "Recurring Billing",
      icon: Repeat,
      roles: ["admin", "office"],
    },
    {
      href: "/customers",
      label: "Customers (Sage)",
      icon: Users,
      roles: ["admin", "office"],
    },
    {
      href: "/installer",
      label: "Installer Today View",
      icon: HardHat,
      roles: ["admin", "office", "installer"],
    },
  ].filter((item) => item.roles.includes(currentUser.role));

  const isConnected = sageState.lastSyncStatus === "connected";

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col lg:flex-row">
      {/* Desktop Sidebar */}
      <aside className="hidden lg:flex lg:w-72 lg:flex-col lg:fixed lg:inset-y-0 bg-slate-950 text-slate-100 border-r border-slate-800 z-30">
        <div className="p-6 border-b border-slate-800/80">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-amber-500 text-slate-950 font-black flex items-center justify-center text-lg shadow-lg shadow-amber-500/20">
              GP
            </div>
            <div>
              <div className="font-bold tracking-tight text-white text-base leading-tight">
                GIANT PROMOTIONS
              </div>
              <div className="text-xs text-slate-400 font-medium">
                Halifax Sign & Rental OS
              </div>
            </div>
          </div>

          <div className="mt-4">
            <Link
              href="/quotes/new"
              className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold text-sm py-2.5 px-4 transition shadow-sm"
            >
              <Plus className="w-4 h-4 stroke-[2.5]" />
              New Quote
            </Link>
          </div>
        </div>

        {/* Navigation Links */}
        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active =
              item.href === "/"
                ? pathname === "/"
                : pathname === item.href || pathname?.startsWith(`${item.href}/`);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center justify-between gap-3 px-3.5 py-2.5 rounded-xl text-sm font-medium transition ${
                  active
                    ? "bg-slate-800/90 text-amber-400 shadow-inner"
                    : "text-slate-300 hover:bg-slate-900 hover:text-white"
                }`}
              >
                <span className="flex items-center gap-3">
                  <Icon className={`w-4 h-4 ${active ? "text-amber-400" : "text-slate-400"}`} />
                  {item.label}
                </span>
                {item.badge && (
                  <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30">
                    {item.badge}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>

        {/* Sage Master Sequence Status Card */}
        <div className="p-4 m-3 rounded-2xl bg-slate-900/90 border border-slate-800 space-y-2.5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              Sage Master Number
            </span>
            <span
              className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full ${
                isConnected
                  ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30"
                  : "bg-rose-500/15 text-rose-400 border border-rose-500/30"
              }`}
            >
              {isConnected ? (
                <>
                  <CheckCircle2 className="w-3 h-3" /> Connected
                </>
              ) : (
                <>
                  <AlertTriangle className="w-3 h-3" /> Offline
                </>
              )}
            </span>
          </div>
          <div className="flex items-baseline justify-between">
            <span className="text-xs text-slate-400">Next Invoice / Job #</span>
            <span className="font-mono text-lg font-bold text-white">
              #{sageState.nextNumberPreview}
            </span>
          </div>
          <div className="text-[11px] text-slate-400 leading-relaxed">
            Mode:{" "}
            <span className="text-amber-300 font-medium">
              {sageState.environment === "sandbox" ? "Sage Test Business" : "Live Books"}
            </span>
          </div>
          <form action={toggleSageConnectionSimulationAction}>
            <button
              type="submit"
              className="w-full text-[11px] font-medium text-slate-400 hover:text-slate-200 underline text-left pt-1"
            >
              {isConnected
                ? "Simulate Sage outage (test fallback)"
                : "Reconnect Sage Accounting"}
            </button>
          </form>
        </div>

        {/* User / Role Switcher Footer */}
        <div className="p-4 border-t border-slate-800/80 bg-slate-950/60">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-1.5 flex items-center gap-1.5">
            <Sparkles className="w-3 h-3 text-amber-400" />
            Active Staff Account
          </div>
          <form action={switchActiveUserAction} className="space-y-2">
            <select
              name="userId"
              defaultValue={currentUser.id}
              onChange={(e) => e.currentTarget.form?.requestSubmit()}
              aria-label="Switch active staff role"
              className="w-full rounded-lg bg-slate-900 border border-slate-700 text-xs text-slate-100 px-2.5 py-2 focus:outline-none focus:border-amber-400"
            >
              {allUsers.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name} ({u.role.toUpperCase()})
                </option>
              ))}
            </select>
          </form>
          <div className="mt-2 flex items-center justify-between text-[11px] text-slate-400">
            <span>{currentUser.email}</span>
            <span className="uppercase font-semibold text-amber-400">{currentUser.role}</span>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 lg:pl-72 flex flex-col min-h-screen pb-20 lg:pb-0">
        {/* Disconnected Sage Banner */}
        {!isConnected && (
          <div className="bg-rose-600 text-white px-4 py-2.5 text-sm font-medium flex items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>
                <strong>Sage Accounting is unreachable.</strong> Approved quotes will wait in{" "}
                <span className="underline">⏳ Waiting for Sage number</span> and never use a
                made-up number.
              </span>
            </div>
            <form action={toggleSageConnectionSimulationAction}>
              <button
                type="submit"
                className="shrink-0 rounded-lg bg-white text-rose-700 font-semibold px-3 py-1 text-xs hover:bg-rose-50"
              >
                Reconnect Now
              </button>
            </form>
          </div>
        )}

        {/* Mobile Top Header */}
        <header className="lg:hidden bg-slate-950 text-white px-4 py-3 flex items-center justify-between border-b border-slate-800 sticky top-0 z-20">
          <div className="flex items-center gap-2.5">
            <div className="h-8 w-8 rounded-lg bg-amber-500 text-slate-950 font-black flex items-center justify-center text-sm">
              GP
            </div>
            <div>
              <div className="font-bold text-sm leading-tight">Giant Promotions</div>
              <div className="text-[11px] text-slate-400">
                Next Sage #{sageState.nextNumberPreview}
              </div>
            </div>
          </div>

          <form action={switchActiveUserAction}>
            <select
              name="userId"
              defaultValue={currentUser.id}
              onChange={(e) => e.currentTarget.form?.requestSubmit()}
              aria-label="Switch user role"
              className="rounded-lg bg-slate-900 border border-slate-700 text-xs text-slate-100 px-2 py-1.5"
            >
              {allUsers.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name.split(" ")[0]} ({u.role})
                </option>
              ))}
            </select>
          </form>
        </header>

        <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-7xl w-full mx-auto">
          {children}
        </main>
      </div>

      {/* Mobile PWA Bottom Navigation */}
      <nav className="lg:hidden fixed bottom-0 inset-x-0 bg-slate-950 text-slate-300 border-t border-slate-800 flex items-center justify-around py-2 px-1 z-30">
        {navItems.slice(0, 5).map((item) => {
          const Icon = item.icon;
          const active =
            item.href === "/"
              ? pathname === "/"
              : pathname === item.href || pathname?.startsWith(`${item.href}/`);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex flex-col items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-medium ${
                active ? "text-amber-400" : "text-slate-400"
              }`}
            >
              <Icon className="w-4 h-4" />
              <span className="truncate max-w-[68px]">{item.label.split(" ")[0]}</span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
