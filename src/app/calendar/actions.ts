"use server";

import { requireProfile } from "@/lib/auth";
import { isUuid } from "@/lib/postForm";
import { createClient } from "@/lib/supabase/server";
import { trackSeen } from "@/lib/tracking";

/**
 * A student opened a day in the calendar: record that they saw these posts (post_views, migration 0020), so the
 * teacher can see who opened their post. Only posts the student may see (RLS) are recorded. Staff: nothing.
 */
export async function markSeen(postIds: string[]): Promise<void> {
  const profile = await requireProfile();
  if (profile.role !== "student") return;
  const ids = [...new Set((Array.isArray(postIds) ? postIds : []).filter((id) => typeof id === "string" && isUuid(id)))].slice(0, 50);
  if (!ids.length) return;
  const { data } = await (await createClient()).from("posts").select("id").in("id", ids);
  trackSeen(
    profile.id,
    (data ?? []).map((r) => r.id as string),
  );
}
