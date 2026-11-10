"use server";

import { requireProfile } from "@/lib/auth";
import { hoursAgo } from "@/lib/calendar";
import { logError } from "@/lib/logs";
import { MAX_DESCRIPTION } from "@/lib/postForm";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export type FeedbackState = { ok?: true; error?: string };

// Same 2000-character limit as the database column.
const MAX_FEEDBACK = MAX_DESCRIPTION;
/** Stops spam: at most this many messages per person in any 24 hours. */
const LIMIT_PER_DAY = 3;

/** Saves a message from the home page's feedback box. Only admins can read it. */
export async function sendFeedback(_prev: FeedbackState, formData: FormData): Promise<FeedbackState> {
  const profile = await requireProfile();
  const message = String(formData.get("message") ?? "").trim();
  if (!message) return { error: "พิมพ์ข้อความก่อนส่ง" };
  if (message.length > MAX_FEEDBACK) return { error: `ข้อความยาวเกิน ${MAX_FEEDBACK} ตัวอักษร` };

  try {
    // Users can't read the feedback table, so the count uses the admin client.
    const { count, error: countErr } = await createAdminClient()
      .from("feedback")
      .select("id", { count: "exact", head: true })
      .eq("user_id", profile.id)
      .gte("created_at", hoursAgo(24));
    if (countErr) throw countErr;
    if ((count ?? 0) >= LIMIT_PER_DAY) {
      return { error: `ส่งได้วันละ ${LIMIT_PER_DAY} ข้อความ คุณส่งครบแล้ว ลองใหม่พรุ่งนี้` };
    }

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
