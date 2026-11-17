/**
 * Gives the FIRST real admin a teacher personal code, without needing an admin in the app yet.
 * It pre-registers the name (no subjects) and prints a 9-character code, valid 14 days.
 * Then sign up at /signup → ครู with that name, subject "ไม่ได้สอนวิชาเหล่านี้", the code and your email,
 * and make the account an admin in the SQL Editor (docs/SETUP.md step 5).
 *
 *   npm run first-admin -- --env=.env.production.local --name="นายสมชาย ใจดี"
 *
 * Needs the same SIGNUP_SECRET as the live site (Vercel), or the code won't match there.
 */
import { createHmac } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { cleanCode, nameKeyFromFull, newPersonalCode, PERSONAL_CODE_DAYS, splitFullName } from "../src/lib/signup";
import { loadEnv } from "./lib";

const envFile = loadEnv();
const name = (process.argv.find((a) => a.startsWith("--name=")) ?? "").slice("--name=".length).trim();
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const secret = process.env.SIGNUP_SECRET ?? "";
if (!url || !key || secret.length < 16) {
  console.error(`Missing NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY or SIGNUP_SECRET in ${envFile}`);
  process.exit(1);
}
const nameKey = nameKeyFromFull(name);
if (!nameKey.includes(" ")) {
  console.error('Give your full name: --name="นายสมชาย ใจดี"');
  process.exit(1);
}
const db = createClient(url, key, { auth: { persistSession: false } });

async function main() {
  const { data: existing, error } = await db.from("registrations").select("id, claimed_by").eq("kind", "teacher").eq("name_key", nameKey).maybeSingle();
  if (error) throw error;
  if (existing?.claimed_by) {
    console.error("✗ This name has already signed up. Make that account an admin in the SQL Editor instead.");
    process.exit(1);
  }
  const code = newPersonalCode();
  const { prefix, first, last } = splitFullName(name);
  const values = {
    prefix,
    first_name: first,
    last_name: last,
    code_hash: createHmac("sha256", secret).update(cleanCode(code)).digest("hex"),
    code_expires_at: new Date(Date.now() + PERSONAL_CODE_DAYS * 86_400_000).toISOString(),
    code_attempts: 0,
    updated_at: new Date().toISOString(),
  };
  const { error: saveError } = existing
    ? await db.from("registrations").update(values).eq("id", existing.id)
    : await db.from("registrations").insert({ kind: "teacher", name_key: nameKey, assignments: [], ...values });
  if (saveError) throw saveError;
  console.log(`Project: ${new URL(url!).hostname}\nPersonal code for ${name}: ${code}  (valid ${PERSONAL_CODE_DAYS} days; shown once)`);
}

main().catch((e) => {
  console.error("✗", e);
  process.exit(1);
});
