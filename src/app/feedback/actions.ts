"use server";

import { requireProfile } from "@/lib/auth";
import { logError } from "@/lib/logs";
import { MAX_DESCRIPTION } from "@/lib/postForm";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export type FeedbackState = { ok?: true; error?: string };

// Same 2000-character limit as the database column.
const MAX_FEEDBACK = MAX_DESCRIPTION;
/** Stops accidental double-sends and spam: at most this many messages per person per 10 minutes. */
const LIMIT_PER_10_MIN = 3;

/** Saves a message from the home page's feedback box. Only admins can read it. */
export async function sendFeedback(_prev: FeedbackState, formData: FormData): Promise<FeedbackState> {
  const profile = await requireProfile();
  const message = String(formData.get("message") ?? "").trim();
  if (!message) return { error: "พิมพ์ข้อความก่อนส่ง" };
  if (message.length > MAX_FEEDBACK) return { error: `ข้อความยาวเกิน ${MAX_FEEDBACK} ตัวอักษร` };

  try {
    // Users can't read the feedback table, so the count uses the admin client.
    const since = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    const { count } = await createAdminClient()
      .from("feedback")
      .select("id", { count: "exact", head: true })
      .eq("user_id", profile.id)
      .gte("created_at", since);
    if ((count ?? 0) >= LIMIT_PER_10_MIN) return { error: "ส่งบ่อยเกินไป รอสักครู่แล้วลองใหม่" };

    // The insert itself goes through the user's own client (RLS: only as yourself).
    const supabase = await createClient();
    const { error } = await supabase.from("feedback").insert({ user_id: profile.id, message });
    if (error) throw error;
    return { ok: true };
  } catch (e) {
    await logError("feedback/send", e);
    return { error: "ส่งไม่สำเร็จ ลองอีกครั้ง" };
  }
}
