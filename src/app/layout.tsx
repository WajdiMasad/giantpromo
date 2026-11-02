import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { getDb } from "@/db";
import { jobs, users } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth";
import { getSageConnectionState } from "@/lib/sage";
import { AppShell } from "@/components/AppShell";
import { eq, isNull, and } from "drizzle-orm";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Giant Promotions OS — Quotes, Jobs, Sage Invoicing & Rentals",
  description:
    "Halifax Sign & Equipment Rental Operating System for Giant Promotions Limited.",
};

export const dynamic = "force-dynamic";

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const db = await getDb();
  const currentUser = await getCurrentUser();
  const allUsers = await db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      role: users.role,
    })
    .from(users);

  const sageState = await getSageConnectionState();
  const readyToSendJobs = await db
    .select({ id: jobs.id })
    .from(jobs)
    .where(and(eq(jobs.status, "installed"), isNull(jobs.invoiceSentAt)));

  const fallbackUser = currentUser ?? {
    id: allUsers[0]?.id ?? 1,
    email: allUsers[0]?.email ?? "aj@giantpro.ca",
    name: allUsers[0]?.name ?? "Wajdi (AJ) Masad",
    role: allUsers[0]?.role ?? "admin",
    phone: "902-456-6487",
  };

  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="min-h-full bg-slate-50 text-slate-900">
        <AppShell
          currentUser={fallbackUser}
          allUsers={allUsers}
          sageState={{
            environment: sageState.environment,
            businessName: sageState.businessName,
            nextNumberPreview: sageState.nextNumberPreview,
            lastSyncStatus: sageState.lastSyncStatus,
          }}
          readyToSendCount={readyToSendJobs.length}
        >
          {children}
        </AppShell>
      </body>
    </html>
  );
}
