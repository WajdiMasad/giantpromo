import { getDb } from "@/db";
import { invoices, payments, projects } from "@/db/schema";
import { eq } from "drizzle-orm";
import { recordInvoicePayment } from "./invoicing";

export interface StripeCheckoutConfig {
  isConfigured: boolean;
  publishableKey?: string;
}

export function getStripeConfig(): StripeCheckoutConfig {
  const secretKey = process.env.STRIPE_SECRET_KEY?.trim();
  const pubKey = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY?.trim();
  return {
    isConfigured: Boolean(secretKey && secretKey.startsWith("sk_")),
    publishableKey: pubKey,
  };
}

/**
 * Creates a Stripe Checkout Session for a Project/Invoice.
 * Uses direct fetch to the official Stripe REST API so no additional heavy npm modules are required.
 * Falls back gracefully to developer test mode if STRIPE_SECRET_KEY is not yet configured.
 */
export async function createStripeSession(params: {
  projectId: number;
  customerEmail?: string;
  successUrl: string;
  cancelUrl: string;
}): Promise<{
  url: string;
  sessionId: string;
  isTestMode: boolean;
}> {
  const db = await getDb();
  const [project] = await db
    .select()
    .from(projects)
    .where(eq(projects.id, params.projectId))
    .limit(1);

  if (!project) throw new Error("Project not found");
  if (!project.invoiceId) {
    throw new Error("Project does not have an invoice generated yet.");
  }

  const [invoice] = await db
    .select()
    .from(invoices)
    .where(eq(invoices.id, project.invoiceId))
    .limit(1);

  if (!invoice) throw new Error("Invoice not found");

  const secretKey = process.env.STRIPE_SECRET_KEY?.trim();

  // If live or test Stripe key is provided, create a real Stripe Checkout Session
  if (secretKey && secretKey.startsWith("sk_")) {
    const body = new URLSearchParams();
    body.append("payment_method_types[]", "card");
    body.append("mode", "payment");
    body.append("success_url", params.successUrl);
    body.append("cancel_url", params.cancelUrl);
    body.append("client_reference_id", String(invoice.id));
    if (params.customerEmail) {
      body.append("customer_email", params.customerEmail);
    }
    body.append("line_items[0][price_data][currency]", "cad");
    body.append(
      "line_items[0][price_data][product_data][name]",
      `Giant Promotions — Invoice #${invoice.invoiceNumber}`
    );
    body.append(
      "line_items[0][price_data][product_data][description]",
      project.title
    );
    body.append(
      "line_items[0][price_data][unit_amount]",
      String(invoice.totalCents)
    );
    body.append("line_items[0][quantity]", "1");

    const res = await fetch("https://api.stripe.com/v1/checkout/sessions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${secretKey}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: body.toString(),
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(
        `Stripe API Error: ${data.error?.message || "Failed to create checkout session"}`
      );
    }

    return {
      url: data.url,
      sessionId: data.id,
      isTestMode: secretKey.includes("_test_"),
    };
  }

  // Developer Simulation Mode: Allows testing full end-to-end card payment flow without API keys
  const simulatedSessionId = `cs_sim_${Date.now()}`;
  const redirectSuccess = new URL(params.successUrl);
  redirectSuccess.searchParams.set("stripe_sim_success", "true");
  redirectSuccess.searchParams.set("session_id", simulatedSessionId);

  return {
    url: redirectSuccess.toString(),
    sessionId: simulatedSessionId,
    isTestMode: true,
  };
}

/**
 * Completes a Stripe payment by recording it into the payments ledger.
 */
export async function finalizeStripePayment(params: {
  invoiceId: number;
  amountCents: number;
  sessionId: string;
  actorName?: string;
}) {
  return recordInvoicePayment({
    invoiceId: params.invoiceId,
    amountCents: params.amountCents,
    method: "card",
    receivedOn: new Date().toISOString().slice(0, 10),
    reference: `Stripe Payment (${params.sessionId.slice(0, 16)})`,
    notes: "Processed via Stripe online checkout",
    actorName: params.actorName ?? "Stripe Checkout",
  });
}
