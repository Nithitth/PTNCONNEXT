"use server";

import { redirect } from "next/navigation";
import { PDPA_VERSION, requireProfile } from "@/lib/auth";
import { logAudit, logError } from "@/lib/logs";
import { createClient } from "@/lib/supabase/server";

export async function acceptPdpa() {
  const profile = await requireProfile({ skipPdpa: true });
  const supabase = await createClient();
  const { error } = await supabase.rpc("accept_pdpa", { p_version: PDPA_VERSION });
  if (error) {
    await logError("pdpa", error);
    redirect("/pdpa?error=1");
  }
  // Consent record (activity log): which notice version, and when.
  await logAudit(profile.id, "pdpa-accept", `v${PDPA_VERSION}`, { from: profile.pdpa_version ?? 0 });
  redirect(profile.must_change_password ? "/change-password" : "/calendar");
}

export async function declinePdpa() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (data?.claims?.sub) await logAudit(data.claims.sub, "pdpa-decline", `v${PDPA_VERSION}`);
  await supabase.auth.signOut();
  redirect("/?pdpa=declined");
}
