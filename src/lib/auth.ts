import crypto from "node:crypto";
import { cookies } from "next/headers";
import { and, eq, gt } from "drizzle-orm";
import { getDb } from "@/db";
import { sessions, users, type UserRole } from "@/db/schema";

export const SESSION_COOKIE_NAME = "gp_session";
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 14; // 14 days

export interface SessionUser {
  id: number;
  email: string;
  name: string;
  role: UserRole;
  phone: string;
}

function hashToken(rawToken: string): string {
  return crypto.createHash("sha256").update(rawToken).digest("hex");
}

export function isAllowedWorkspaceEmail(email: string): boolean {
  const domain = email.trim().toLowerCase().split("@")[1] ?? "";
  const configured = (process.env.ALLOWED_GOOGLE_DOMAINS ?? "giantpro.ca,giantpro.com")
    .split(",")
    .map((d) => d.trim().toLowerCase())
    .filter(Boolean);
  return configured.includes(domain);
}

export async function createSessionForUser(userId: number, meta?: { ip?: string; userAgent?: string }) {
  const db = await getDb();
  const rawToken = crypto.randomBytes(32).toString("base64url");
  const tokenHash = hashToken(rawToken);
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);

  await db.insert(sessions).values({
    userId,
    tokenHash,
    expiresAt,
    ipAddress: meta?.ip ?? null,
    userAgent: meta?.userAgent ?? null,
  });

  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE_NAME, rawToken, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: expiresAt,
  });

  return rawToken;
}

export async function destroyCurrentSession() {
  const cookieStore = await cookies();
  const rawToken = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  if (rawToken) {
    const db = await getDb();
    await db.delete(sessions).where(eq(sessions.tokenHash, hashToken(rawToken)));
  }
  cookieStore.delete(SESSION_COOKIE_NAME);
}

/**
 * Retrieve the currently signed-in user.
 * In local development (when DEMO_AUTO_LOGIN !== 'false'), automatically signs in as
 * the seeded Admin user if no session cookie is set yet so local preview works immediately.
 */
export async function getCurrentUser(): Promise<SessionUser | null> {
  const db = await getDb();
  const cookieStore = await cookies();
  const rawToken = cookieStore.get(SESSION_COOKIE_NAME)?.value;

  if (rawToken) {
    const tokenHash = hashToken(rawToken);
    const rows = await db
      .select({
        id: users.id,
        email: users.email,
        name: users.name,
        role: users.role,
        phone: users.phone,
        isActive: users.isActive,
      })
      .from(sessions)
      .innerJoin(users, eq(sessions.userId, users.id))
      .where(and(eq(sessions.tokenHash, tokenHash), gt(sessions.expiresAt, new Date())))
      .limit(1);

    const row = rows[0];
    if (row && row.isActive) {
      return {
        id: row.id,
        email: row.email,
        name: row.name,
        role: row.role,
        phone: row.phone ?? "",
      };
    }
  }

  // In local dev mode, fall back to the first active admin user so you can test right away
  if (process.env.NODE_ENV !== "production" && process.env.DEMO_AUTO_LOGIN !== "false") {
    const [defaultUser] = await db
      .select()
      .from(users)
      .where(eq(users.isActive, true))
      .limit(1);
    if (defaultUser) {
      return {
        id: defaultUser.id,
        email: defaultUser.email,
        name: defaultUser.name,
        role: defaultUser.role,
        phone: defaultUser.phone ?? "",
      };
    }
  }

  return null;
}

export async function requireUser(allowedRoles?: readonly UserRole[]): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) {
    throw new Error("Authentication required");
  }
  if (allowedRoles && !allowedRoles.includes(user.role)) {
    throw new Error(`Forbidden: requires role ${allowedRoles.join(" or ")}`);
  }
  return user;
}
