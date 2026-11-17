// Shared helpers for the scripts in this folder (Node only, not used by the app).
import { createHmac } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { config } from "dotenv";
import type { SupabaseClient } from "@supabase/supabase-js";

/** Loads .env.local, or the file given as --env=<file> (e.g. --env=.env.production.local). */
export function loadEnv(): string {
  const arg = process.argv.find((a) => a.startsWith("--env="));
  const path = arg ? arg.slice("--env=".length) : ".env.local";
  config({ path, quiet: true });
  return path;
}

/**
 * Stops unless this is the TEST database. The test project is marked once in its SQL Editor with
 *   insert into public.app_settings (key, value) values ('environment', '"test"');
 * The real school project never has that row, so pasting its keys into .env.local by mistake can't
 * let the seed or the security check create test accounts there.
 */
export async function requireTestDatabase(db: SupabaseClient) {
  const { data, error } = await db.from("app_settings").select("value").eq("key", "environment").maybeSingle();
  if (error || data?.value !== "test") {
    console.error(
      "✗ This is not the TEST database, so nothing was changed.\n" +
        "  The seed and the security check only run on the test project (docs/SETUP.md, step 2a).",
    );
    process.exit(1);
  }
}

/** The current 6-digit code of an authenticator app (TOTP, RFC 6238) for a base32 secret. */
export function totp(secretBase32: string, now = Date.now()): string {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = "";
  for (const c of secretBase32.replace(/[\s=]/g, "").toUpperCase()) bits += alphabet.indexOf(c).toString(2).padStart(5, "0");
  const key = Buffer.from((bits.match(/.{8}/g) ?? []).map((b) => parseInt(b, 2)));
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(now / 30_000)));
  const h = createHmac("sha1", key).update(counter).digest();
  const o = h[h.length - 1] & 0xf;
  return String((h.readUInt32BE(o) & 0x7fffffff) % 1_000_000).padStart(6, "0");
}

/** admin.test's two-step secret in the test project (written by the seed, gitignored). */
const TOTP_FILE = ".ptn-test-totp.json";
export type TestFactor = { userId: string; factorId: string; secret: string };
export function readTestFactor(): TestFactor | null {
  try {
    return JSON.parse(readFileSync(TOTP_FILE, "utf8")) as TestFactor;
  } catch {
    return null;
  }
}
export const saveTestFactor = (f: TestFactor) => writeFileSync(TOTP_FILE, JSON.stringify(f, null, 2));
