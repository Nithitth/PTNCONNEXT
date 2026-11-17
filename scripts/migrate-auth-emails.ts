/**
 * Moves every account to the scrambled hidden email (src/lib/authEmailCore.ts), so nobody can sign in
 * to Supabase directly by guessing "<student ID>@ptn-connext.local". Run it once per Supabase project
 * after setting LOGIN_EMAIL_SECRET, and again if that secret is ever changed.
 *
 *   npm run migrate:auth-emails                                    (shows what would change)
 *   npm run migrate:auth-emails -- --apply                         (changes it)
 *   npm run migrate:auth-emails -- --env=.env.production.local --apply
 *
 * Passwords and sessions are untouched; people keep logging in exactly as before.
 */
import { createClient } from "@supabase/supabase-js";
import { hiddenEmailFor, loginEmailSecretFrom } from "../src/lib/authEmailCore";
import { LOGIN_EMAIL_DOMAIN } from "../src/lib/roster";
import { loadEnv } from "./lib";

const envFile = loadEnv();
const apply = process.argv.includes("--apply");
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error(`Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in ${envFile}`);
  process.exit(1);
}
const secret = loginEmailSecretFrom(process.env);
const db = createClient(url, key, { auth: { persistSession: false } });

async function main() {
  console.log(`Project: ${new URL(url!).hostname} (from ${envFile})${apply ? "" : " — dry run, add --apply to change"}`);
  const { data: profiles, error } = await db.from("profiles").select("id, login_id");
  if (error) throw error;
  const loginIdOf = new Map((profiles ?? []).map((p) => [p.id as string, p.login_id as string]));

  let changed = 0;
  let same = 0;
  let skipped = 0;
  for (let page = 1; ; page++) {
    const { data, error: listError } = await db.auth.admin.listUsers({ page, perPage: 1000 });
    if (listError) throw listError;
    for (const u of data.users) {
      const loginId = loginIdOf.get(u.id);
      if (!loginId || !u.email?.endsWith(`@${LOGIN_EMAIL_DOMAIN}`)) {
        skipped++;
        continue;
      }
      const email = hiddenEmailFor(loginId, secret);
      if (u.email === email) {
        same++;
        continue;
      }
      if (apply) {
        const { error: updateError } = await db.auth.admin.updateUserById(u.id, { email, email_confirm: true });
        if (updateError) throw updateError;
      }
      changed++;
    }
    if (data.users.length < 1000) break;
  }
  console.log(`${apply ? "Changed" : "Would change"} ${changed} · already done ${same} · skipped (no profile) ${skipped}`);
}

main().catch((e) => {
  console.error("✗", e);
  process.exit(1);
});
