"use server";

import { getCurrentProfile, needsTwoStep } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Live } from "@/lib/warroom";

/**
 * Today's live numbers for the war room (report_live, migration 0020), polled every minute. Counts and
 * anonymous events only. Returns { expired } instead of redirecting, so a screen left open shows a sign-in note.
 */
export async function liveCounts(): Promise<{ live?: Live; expired?: true }> {
  const p = await getCurrentProfile();
  if (!p || p.role !== "admin" || needsTwoStep(p)) return { expired: true };
  const { data, error } = await createAdminClient().rpc("report_live");
  if (error || !data) return { live: undefined };
  return { live: data as Live };
}
