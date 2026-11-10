import "server-only";
import { createClient } from "@supabase/supabase-js";
import { SUPABASE_URL } from "@/lib/env";

/**
 * Supabase client with the SERVICE ROLE key. It skips every RLS rule,
 * so only use it on the server, after checking the caller is allowed
 * (e.g. with requireProfile({ roles: ["admin"] })).
 * The key must never reach the browser — it has no NEXT_PUBLIC_ prefix.
 */
export function createAdminClient() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!SUPABASE_URL || !key) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set");
  }
  return createClient(SUPABASE_URL, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
