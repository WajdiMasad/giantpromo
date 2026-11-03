"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Briefcase,
  Signpost,
  Repeat,
  Users,
  HardHat,
  Sparkles,
  Plus,
  Receipt,
} from "lucide-react";
import { switchActiveUserAction } from "@/app/actions";
import type { SessionUser } from "@/lib/auth";

interface AppShellProps {
  currentUser: SessionUser;
  allUsers: { id: number; name: string; email: string; role: string }[];
  nextInvoiceNumber: number;
  readyToSendCount: number;
  children: React.ReactNode;
}

export function AppShell({
  currentUser,
  allUsers,
  nextInvoiceNumber,
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
      shortLabel: "Home",
      icon: LayoutDashboard,
      roles: ["admin", "office", "accountant"],
    },
    {
      href: "/projects",
      label: "Projects",
      shortLabel: "Projects",
      icon: Briefcase,
      badge: readyToSendCount > 0 ? `${readyToSendCount} to invoice` : undefined,
      roles: ["admin", "office", "accountant"],
    },
    {
      href: "/installer",
      label: "Installer Today View",
      shortLabel: "Installer",
      icon: HardHat,
      roles: ["admin", "office", "installer"],
    },
    {
      href: "/equipment",
      label: "Equipment & Map",
      shortLabel: "Rentals",
      icon: Signpost,
      roles: ["admin", "office", "installer"],
    },
    {
      href: "/billing",
      label: "Recurring Billing",
      shortLabel: "Billing",
      icon: Repeat,
      roles: ["admin", "office", "accountant"],
    },
    {
      href: "/accounting",
      label: "Accounting",
      shortLabel: "Books",
      icon: Receipt,
      roles: ["admin", "accountant"],
    },
    {
      href: "/customers",
      label: "Customers",
      shortLabel: "Clients",
      icon: Users,
      roles: ["admin", "office", "accountant"],
    },
  ].filter((item) => item.roles.includes(currentUser.role));

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
              href="/projects/new"
              className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold text-sm py-2.5 px-4 transition shadow-sm"
            >
              <Plus className="w-4 h-4 stroke-[2.5]" />
              New Project
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
                    ? "bg-slate-800/90 text-amber-400 shadow-inner border border-slate-700/70"
                    : "text-slate-300 hover:bg-slate-900 hover:text-white"
                }`}
              >
                <span className="flex items-center gap-3">
                  <Icon className={`w-4 h-4 ${active ? "text-amber-400" : "text-slate-400"}`} />
                  {item.label}
                </span>
                {item.badge && (
                  <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30 whitespace-nowrap">
                    {item.badge}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>

        {/* Next invoice number (the app owns numbering) */}
        <div className="p-4 m-3 rounded-2xl bg-slate-900/90 border border-slate-800 space-y-1.5">
          <div className="text-xs font-semibold uppercase tracking-wider text-slate-400">
            Next invoice / job #
          </div>
          <div className="font-mono text-lg font-bold text-white">#{nextInvoiceNumber}</div>
          <div className="text-[11px] text-slate-400 leading-relaxed">
            Assigned the moment a quote is signed. Numbers never repeat or skip.
          </div>
        </div>

        {/* User / Role Switcher Footer (pb-12 keeps clear of Next DevTools badge) */}
        <div className="p-4 pb-12 border-t border-slate-800/80 bg-slate-950/60">
          <label
            htmlFor="sidebar-staff-switcher"
            className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-1.5 flex items-center gap-1.5 cursor-pointer"
          >
            <Sparkles className="w-3 h-3 text-amber-400" />
            Active Staff Account
          </label>
          <form action={switchActiveUserAction} className="space-y-2">
            <select
              id="sidebar-staff-switcher"
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
            <span className="truncate">{currentUser.email}</span>
            <span className="uppercase font-semibold text-amber-400">{currentUser.role}</span>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 lg:pl-72 flex flex-col min-h-screen pb-20 lg:pb-0">
        {/* Mobile Top Header */}
        <header className="lg:hidden bg-slate-950 text-white px-4 py-3 flex items-center justify-between border-b border-slate-800 sticky top-0 z-20">
          <div className="flex items-center gap-2.5">
            <div className="h-8 w-8 rounded-lg bg-amber-500 text-slate-950 font-black flex items-center justify-center text-sm">
              GP
            </div>
            <div>
              <div className="font-bold text-sm leading-tight">Giant Promotions</div>
              <div className="text-[11px] text-slate-400">
                Next invoice #{nextInvoiceNumber}
              </div>
            </div>
          </div>

          <form action={switchActiveUserAction}>
            <select
              id="mobile-staff-switcher"
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

      {/* Mobile PWA Bottom Navigation (includes Installer & Clients) */}
      <nav className="lg:hidden fixed bottom-0 inset-x-0 bg-slate-950 text-slate-300 border-t border-slate-800 flex items-center justify-around py-2 px-1 z-30 overflow-x-auto">
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
              className={`flex flex-col items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-semibold transition shrink-0 ${
                active ? "text-amber-400 bg-slate-900" : "text-slate-400 hover:text-slate-200"
              }`}
            >
              <Icon className="w-4 h-4" />
              <span className="whitespace-nowrap">{item.shortLabel}</span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
