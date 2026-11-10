"use server";

import { redirect } from "next/navigation";
import { PDPA_VERSION, requireProfile } from "@/lib/auth";
import { logError } from "@/lib/logs";
import { createClient } from "@/lib/supabase/server";

export async function acceptPdpa() {
  const profile = await requireProfile({ skipPdpa: true });
  const supabase = await createClient();
  const { error } = await supabase.rpc("accept_pdpa", { p_version: PDPA_VERSION });
  if (error) {
    await logError("pdpa", error);
    redirect("/pdpa?error=1");
  }
  redirect(profile.must_change_password ? "/change-password" : "/calendar");
}

export async function declinePdpa() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/?pdpa=declined");
}
