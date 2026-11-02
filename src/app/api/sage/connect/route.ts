import crypto from "node:crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";

export async function GET(request: Request) {
  await requireUser(["admin"]);
  const origin = new URL(request.url).origin;
  const clientId = process.env.SAGE_CLIENT_ID;

  if (!clientId) {
    return NextResponse.redirect(new URL("/?sage=sandbox_active", origin));
  }

  // Random per-session OAuth state (fixes critical vulnerability S2 from code review)
  const state = crypto.randomBytes(24).toString("base64url");
  const cookieStore = await cookies();
  cookieStore.set("gp_sage_oauth_state", state, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 600,
  });

  const redirectUri =
    process.env.SAGE_REDIRECT_URI?.trim() || `${origin}/api/sage/callback`;

  const authUrl = new URL("https://www.sageone.com/oauth2/auth/central");
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("client_id", clientId);
  authUrl.searchParams.set("redirect_uri", redirectUri);
  authUrl.searchParams.set("scope", "full_access");
  authUrl.searchParams.set("state", state);

  return NextResponse.redirect(authUrl);
}
