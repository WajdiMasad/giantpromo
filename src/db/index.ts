import path from "node:path";
import fs from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { drizzle as drizzlePglite } from "drizzle-orm/pglite";
import { drizzle as drizzleNodePg } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import type { PgDatabase } from "drizzle-orm/pg-core";
import * as schema from "./schema";
import { BOOTSTRAP_SQL } from "./bootstrap-sql";
import { seedInitialDataIfEmpty } from "./seed";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AppDatabase = PgDatabase<any, typeof schema>;

declare global {
  var __giantOsDbPromise: Promise<AppDatabase> | undefined;
}

async function createAndInitDatabase(): Promise<AppDatabase> {
  const databaseUrl = process.env.DATABASE_URL?.trim();
  const isMemoryTest = process.env.PGLITE_MEMORY === "1" || process.env.VITEST === "true";

  if (databaseUrl && (databaseUrl.startsWith("postgres://") || databaseUrl.startsWith("postgresql://"))) {
    const pool = new Pool({
      connectionString: databaseUrl,
      max: 10,
      idleTimeoutMillis: 30_000,
    });
    await pool.query(BOOTSTRAP_SQL);
    const db = drizzleNodePg(pool, { schema }) as unknown as AppDatabase;
    if (!isMemoryTest) {
      await seedInitialDataIfEmpty(db);
    }
    return db;
  }

  // Embedded PostgreSQL (PGlite) for local dev and automated tests
  let client: PGlite;
  if (isMemoryTest) {
    client = new PGlite();
  } else {
    const dataDir = path.join(process.cwd(), ".data", "pgdata");
    fs.mkdirSync(path.dirname(dataDir), { recursive: true });
    client = new PGlite(dataDir);
  }

  await client.exec(BOOTSTRAP_SQL);
  const db = drizzlePglite(client, { schema }) as unknown as AppDatabase;
  if (!isMemoryTest) {
    await seedInitialDataIfEmpty(db);
  }
  return db;
}

export async function getDb(): Promise<AppDatabase> {
  if (!globalThis.__giantOsDbPromise) {
    globalThis.__giantOsDbPromise = createAndInitDatabase();
  }
  return globalThis.__giantOsDbPromise;
}

/** Reset singleton (used in isolated unit tests). */
export function resetDbForTests() {
  globalThis.__giantOsDbPromise = undefined;
}

/** Extract the root Postgres error message when Drizzle wraps it in DrizzleQueryError. */
export function unwrapDbErrorMessage(err: unknown): string {
  if (err && typeof err === "object") {
    const cause = (err as { cause?: unknown }).cause;
    if (cause && typeof cause === "object" && "message" in cause && typeof cause.message === "string") {
      return cause.message;
    }
    if ("message" in err && typeof err.message === "string") {
      return err.message;
    }
  }
  return String(err);
}

