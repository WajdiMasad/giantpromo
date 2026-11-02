import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { sageConnection } from "@/db/schema";
import { requireUser } from "@/lib/auth";

export async function GET(request: Request) {
  await requireUser(["admin"]);
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");

  const cookieStore = await cookies();
  const expectedState = cookieStore.get("gp_sage_oauth_state")?.value;
  cookieStore.delete("gp_sage_oauth_state");

  // Strict OAuth CSRF state check (fixes S2)
  if (!code || !state || !expectedState || state !== expectedState) {
    return NextResponse.redirect(new URL("/?sage_error=invalid_state", url.origin));
  }

  const clientId = process.env.SAGE_CLIENT_ID ?? "";
  const clientSecret = process.env.SAGE_CLIENT_SECRET ?? "";
  const redirectUri = `${url.origin}/api/sage/callback`;

  const resp = await fetch("https://oauth.accounting.sage.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      code,
      grant_type: "authorization_code",
      redirect_uri: redirectUri,
    }),
    signal: AbortSignal.timeout(30_000),
  });

  if (!resp.ok) {
    return NextResponse.redirect(new URL("/?sage_error=token_exchange_failed", url.origin));
  }

  const tokenData = (await resp.json()) as {
    access_token: string;
    refresh_token: string;
    expires_in: number;
    resource_owner_id?: string;
  };

  const db = await getDb();
  await db
    .update(sageConnection)
    .set({
      accessToken: tokenData.access_token,
      refreshToken: tokenData.refresh_token,
      expiresAt: new Date(Date.now() + tokenData.expires_in * 1000),
      resourceOwnerId: tokenData.resource_owner_id ?? null,
      lastSyncStatus: "connected",
      lastSyncError: null,
      lastSyncAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(sageConnection.id, "primary"));

  return NextResponse.redirect(new URL("/?sage=connected", url.origin));
}
