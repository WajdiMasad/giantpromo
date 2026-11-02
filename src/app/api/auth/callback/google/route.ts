import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { users } from "@/db/schema";
import { createSessionForUser, isAllowedWorkspaceEmail } from "@/lib/auth";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const cookieStore = await cookies();
  const expectedState = cookieStore.get("gp_google_oauth_state")?.value;
  cookieStore.delete("gp_google_oauth_state");

  if (!code || !state || !expectedState || state !== expectedState) {
    return NextResponse.redirect(new URL("/login?error=invalid_oauth_state", url.origin));
  }

  const clientId = process.env.GOOGLE_CLIENT_ID ?? "";
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET ?? "";
  const redirectUri = `${url.origin}/api/auth/callback/google`;

  const tokenResp = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
  });

  if (!tokenResp.ok) {
    return NextResponse.redirect(new URL("/login?error=token_exchange_failed", url.origin));
  }

  const tokenData = (await tokenResp.json()) as {
    access_token: string;
    refresh_token?: string;
  };

  const profileResp = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
    headers: { Authorization: `Bearer ${tokenData.access_token}` },
  });

  if (!profileResp.ok) {
    return NextResponse.redirect(new URL("/login?error=profile_fetch_failed", url.origin));
  }

  const profile = (await profileResp.json()) as {
    email?: string;
    email_verified?: boolean;
    name?: string;
    picture?: string;
  };

  if (!profile.email || !profile.email_verified || !isAllowedWorkspaceEmail(profile.email)) {
    return NextResponse.redirect(new URL("/login?error=unauthorized_domain", url.origin));
  }

  const emailLower = profile.email.toLowerCase();
  const db = await getDb();
  let [user] = await db.select().from(users).where(eq(users.email, emailLower)).limit(1);

  if (!user) {
    const [created] = await db
      .insert(users)
      .values({
        email: emailLower,
        name: profile.name ?? emailLower,
        role: "office",
        avatarUrl: profile.picture ?? null,
        googleRefreshToken: tokenData.refresh_token ?? null,
      })
      .returning();
    user = created!;
  } else if (tokenData.refresh_token) {
    await db
      .update(users)
      .set({
        googleRefreshToken: tokenData.refresh_token,
        avatarUrl: profile.picture ?? user.avatarUrl,
        updatedAt: new Date(),
      })
      .where(eq(users.id, user.id));
  }

  await createSessionForUser(user.id);
  return NextResponse.redirect(new URL(user.role === "installer" ? "/installer" : "/", url.origin));
}
