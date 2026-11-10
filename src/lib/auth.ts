import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { isSupabaseConfigured } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";

export type Role = "student" | "teacher" | "admin";

/** Bump this when the PDPA notice text changes — everyone will be asked again. */
export const PDPA_VERSION = 1;

export type Profile = {
  id: string;
  role: Role;
  login_id: string;
  display_name: string;
  must_change_password: boolean;
  pdpa_version: number | null;
  classroom: { grade: number; room: number } | null;
};

/**
 * A student's own classroom. Profiles also reach classrooms through
 * teaching_assignments, so the join must name which link to follow.
 */
export const PROFILE_CLASSROOM = "classroom:classrooms!profiles_classroom_id_fkey(grade, room)";

/**
 * The signed-in user's profile, or null for guests.
 * Cached per request, so the nav bar and the page share one lookup.
 */
export const getCurrentProfile = cache(async (): Promise<Profile | null> => {
  await connection(); // always render per request — who's logged in changes every time
  if (!isSupabaseConfigured) return null;
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const userId = claims?.claims?.sub;
  if (!userId) return null;

  const { data, error } = await supabase
    .from("profiles")
    .select(`id, role, login_id, display_name, must_change_password, pdpa_version, ${PROFILE_CLASSROOM}`)
    .eq("id", userId)
    .maybeSingle();
  if (error) console.error("getCurrentProfile", error);
  return (data as Profile | null) ?? null;
});

export const needsPdpa = (p: Profile) => (p.pdpa_version ?? 0) < PDPA_VERSION;

type Gate = { roles?: Role[]; skipPdpa?: boolean };

/**
 * Call at the top of every protected page or action.
 * Sends guests to /login, makes sure PDPA is accepted, then checks the role.
 * Changing the birthdate password is optional: it's offered once after PDPA,
 * then PasswordReminder nags until it's done (must_change_password = false).
 * (The database's RLS rules are the second, stronger lock.)
 */
export async function requireProfile(gate: Gate = {}): Promise<Profile> {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");
  if (!gate.skipPdpa && needsPdpa(profile)) redirect("/pdpa");
  if (gate.roles && !gate.roles.includes(profile.role)) redirect("/?denied=1");
  return profile;
}
