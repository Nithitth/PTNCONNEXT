import "server-only";
import { after } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { FeatureKey } from "@/lib/features";

// Activity logs (migration 0020). Written with the admin client after the response is sent (`after`),
// so pages never wait for them, and never throw. Rows are kept 365 days (daily cron).

/** One more visit to a feature by this person today (usage_daily). */
export function trackVisit(userId: string, feature: FeatureKey) {
  after(async () => {
    const { error } = await createAdminClient().rpc("track_usage", { p_user: userId, p_feature: feature });
    if (error) console.error("trackVisit", error.message);
  });
}

/** A student saw these posts (day drawer) or opened a post's file. Other roles are ignored by the database. */
export function trackSeen(userId: string, postIds: string[], file = false) {
  if (!postIds.length) return;
  after(async () => {
    const { error } = await createAdminClient().rpc("mark_seen", { p_user: userId, p_posts: postIds.slice(0, 50), p_file: file });
    if (error) console.error("trackSeen", error.message);
  });
}

/** Post history for disputes ("the deadline was moved"): who created, edited or deleted a post, and what changed. */
export function logPostHistory(actorId: string, postId: string, action: "create" | "edit" | "delete", title: string, detail?: Record<string, unknown>) {
  after(async () => {
    const { error } = await createAdminClient()
      .from("post_history")
      .insert({ post_id: postId, actor_id: actorId, action, title: title.slice(0, 200), detail: detail ?? null });
    if (error) console.error("logPostHistory", error.message);
  });
}
