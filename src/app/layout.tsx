import type { Metadata } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";
import { getDb } from "@/db";
import { jobs, users } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth";
import { getNextInvoiceNumberPreview } from "@/lib/invoicing";
import { AppShell } from "@/components/AppShell";
import { eq, isNull, and } from "drizzle-orm";

const jakartaSans = Plus_Jakarta_Sans({
  variable: "--font-jakarta-sans",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Giant Promotions OS",
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

  const nextInvoiceNumber = await getNextInvoiceNumberPreview();
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
    <html lang="en" className={`${jakartaSans.variable} h-full antialiased`}>
      <body className="min-h-full bg-slate-50 text-slate-900">
        <AppShell
          currentUser={fallbackUser}
          allUsers={allUsers}
          nextInvoiceNumber={nextInvoiceNumber}
          readyToSendCount={readyToSendJobs.length}
        >
          {children}
        </AppShell>
      </body>
    </html>
  );
}
