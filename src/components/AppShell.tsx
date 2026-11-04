"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  FolderKanban,
  Package,
  Users,
  CreditCard,
  FileSpreadsheet,
  HardHat,
  Plus,
  ChevronDown,
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
      icon: FolderKanban,
      badge: readyToSendCount > 0 ? String(readyToSendCount) : undefined,
      roles: ["admin", "office", "accountant"],
    },
    {
      href: "/equipment",
      label: "Inventory",
      shortLabel: "Inventory",
      icon: Package,
      roles: ["admin", "office", "installer"],
    },
    {
      href: "/customers",
      label: "Directory",
      shortLabel: "Directory",
      icon: Users,
      roles: ["admin", "office", "accountant"],
    },
    {
      href: "/billing",
      label: "Billing",
      shortLabel: "Billing",
      icon: CreditCard,
      roles: ["admin", "office", "accountant"],
    },
    {
      href: "/accounting",
      label: "Accounting",
      shortLabel: "Accounting",
      icon: FileSpreadsheet,
      roles: ["admin", "accountant"],
    },
    {
      href: "/installer",
      label: "Crew Schedule",
      shortLabel: "Crew",
      icon: HardHat,
      roles: ["admin", "office", "installer"],
    },
  ].filter((item) => item.roles.includes(currentUser.role));

  const initials = currentUser.name
    .split(" ")
    .map((p) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <div className="min-h-screen bg-[#eef1f6] text-slate-800 flex flex-col lg:flex-row">
      {/* Goodshuffle Pro-style Deep Navy Sidebar */}
      <aside className="hidden lg:flex lg:w-56 lg:flex-col lg:fixed lg:inset-y-0 bg-[#082347] text-white z-30 select-none shadow-md">
        {/* Top Brand Bar */}
        <div className="h-16 px-4 flex items-center gap-2.5 border-b border-white/10 shrink-0">
          <div className="h-7 w-7 rounded-xs bg-[#186ade] text-white font-bold flex items-center justify-center text-xs tracking-tighter shadow-xs">
            GP
          </div>
          <div className="min-w-0">
            <div className="font-bold tracking-wider text-white text-[13px] leading-none truncate">
              GIANT PROMOTIONS
            </div>
            <div className="text-[10px] text-[#8fa8c8] tracking-wide mt-0.5 truncate">
              PRO INVENTORY &amp; JOBS
            </div>
          </div>
        </div>

        {/* Primary Navigation */}
        <nav className="flex-1 px-2.5 py-3 space-y-0.5 overflow-y-auto">
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
                className={`flex items-center justify-between gap-2.5 px-3 py-2 rounded-xs text-[13px] transition ${
                  active
                    ? "bg-[#186ade] text-white font-semibold shadow-2xs"
                    : "text-[#b4c6e0] hover:bg-white/8 hover:text-white font-medium"
                }`}
              >
                <span className="flex items-center gap-2.5 truncate">
                  <Icon
                    className={`w-4 h-4 shrink-0 ${
                      active ? "text-white" : "text-[#7c97bd]"
                    }`}
                  />
                  <span className="truncate">{item.label}</span>
                </span>
                {item.badge && (
                  <span
                    className={`text-[10px] font-bold px-1.5 py-0.2 rounded-xs tabular-nums ${
                      active
                        ? "bg-white text-[#186ade]"
                        : "bg-[#186ade]/40 text-white"
                    }`}
                  >
                    {item.badge}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>

        {/* Bottom Action & Quiet Account Switcher */}
        <div className="p-3 space-y-2.5 border-t border-white/10 bg-[#061b38]">
          <Link
            href="/projects/new"
            className="w-full inline-flex items-center justify-center gap-1.5 rounded-xs bg-[#186ade] hover:bg-[#1458b8] text-white font-semibold text-xs py-2 px-3 transition shadow-xs"
          >
            <Plus className="w-3.5 h-3.5 stroke-[2.5]" />
            Create New Project
          </Link>

          <div className="pt-1">
            <form action={switchActiveUserAction} className="relative">
              <div className="flex items-center gap-2 px-2 py-1.5 rounded-xs bg-white/5 hover:bg-white/10 transition border border-white/10">
                <div className="w-6 h-6 rounded-full bg-[#186ade] text-white text-[10px] font-bold flex items-center justify-center shrink-0">
                  {initials}
                </div>
                <div className="min-w-0 flex-1">
                  <select
                    id="sidebar-staff-switcher"
                    name="userId"
                    defaultValue={currentUser.id}
                    onChange={(e) => e.currentTarget.form?.requestSubmit()}
                    aria-label="Switch active staff role"
                    className="w-full bg-transparent text-white text-xs font-medium focus:outline-none cursor-pointer truncate appearance-none pr-4"
                  >
                    {allUsers.map((u) => (
                      <option key={u.id} value={u.id} className="text-slate-900">
                        {u.name} ({u.role})
                      </option>
                    ))}
                  </select>
                </div>
                <ChevronDown className="w-3.5 h-3.5 text-[#8fa8c8] pointer-events-none shrink-0" />
              </div>
            </form>
            <div className="mt-1.5 px-1 flex items-center justify-between text-[10px] text-[#7c97bd] tabular-nums">
              <span>Halifax Depot</span>
              <span>Next Job #{nextInvoiceNumber}</span>
            </div>
          </div>
        </div>
      </aside>

      {/* Main Content Area (Full-bleed workspace) */}
      <div className="flex-1 lg:pl-56 flex flex-col min-h-screen min-w-0 pb-16 lg:pb-0">
        {/* Mobile Top Header */}
        <header className="lg:hidden bg-[#082347] text-white px-4 h-14 flex items-center justify-between border-b border-white/10 sticky top-0 z-20">
          <div className="flex items-center gap-2">
            <div className="h-6 w-6 rounded-xs bg-[#186ade] text-white font-bold flex items-center justify-center text-xs">
              GP
            </div>
            <span className="font-bold text-xs tracking-wider uppercase">
              Giant Promotions
            </span>
          </div>

          <form action={switchActiveUserAction}>
            <select
              id="mobile-staff-switcher"
              name="userId"
              defaultValue={currentUser.id}
              onChange={(e) => e.currentTarget.form?.requestSubmit()}
              aria-label="Switch user role"
              className="rounded-xs bg-white/10 border border-white/15 text-xs text-white px-2 py-1"
            >
              {allUsers.map((u) => (
                <option key={u.id} value={u.id} className="text-slate-900">
                  {u.name.split(" ")[0]} ({u.role})
                </option>
              ))}
            </select>
          </form>
        </header>

        <main className="flex-1 flex flex-col min-w-0">{children}</main>
      </div>

      {/* Mobile Bottom Bar */}
      <nav className="lg:hidden fixed bottom-0 inset-x-0 bg-[#082347] text-white border-t border-white/10 flex items-center justify-around py-1.5 px-1 z-30 overflow-x-auto">
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
              className={`flex flex-col items-center gap-0.5 px-2.5 py-1 rounded-xs text-[10px] font-medium transition shrink-0 ${
                active ? "bg-[#186ade] text-white" : "text-[#b4c6e0]"
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
