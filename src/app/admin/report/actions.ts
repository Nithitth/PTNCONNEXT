"use server";

import { revalidatePath, updateTag } from "next/cache";
import { REPORT_CACHE_TAG } from "@/lib/reportCache";
import { requireProfile } from "@/lib/auth";
import { logAudit, logError } from "@/lib/logs";
import { DEFAULT_ASSUMPTIONS, DEFAULT_OKRS, cleanAssumptions, cleanOkrs } from "@/lib/report";
import { cleanTags, type Tag } from "@/lib/reportIdeas";
import { createAdminClient } from "@/lib/supabase/admin";

// Saves for รายงาน & OKR. Everything lives in app_settings (server-only), checked by the pure clean* rules.

export type ReportResult = { ok?: boolean; error?: string };
const FAILED = "บันทึกไม่สำเร็จ ลองใหม่อีกครั้ง";

async function save(key: string, value: unknown, actorId: string) {
  const { error } = await createAdminClient().from("app_settings").upsert({ key, value, updated_by: actorId, updated_at: new Date().toISOString() });
  if (error) throw error;
  revalidatePath("/admin/report", "layout");
  revalidatePath("/admin");
  updateTag(REPORT_CACHE_TAG); // the war room's 5-minute cache
}

export async function saveOkrs(raw: unknown): Promise<ReportResult> {
  const profile = await requireProfile({ roles: ["admin"] });
  const r = cleanOkrs(raw);
  if ("error" in r) return { error: r.error };
  try {
    await save("report_okrs", r.okrs, profile.id);
    await logAudit(profile.id, "report-settings", "OKR", { objectives: r.okrs.length });
    return { ok: true };
  } catch (e) {
    await logError("admin/report/okrs", e);
    return { error: FAILED };
  }
}

export async function saveAssumptions(raw: unknown): Promise<ReportResult> {
  const profile = await requireProfile({ roles: ["admin"] });
  const r = cleanAssumptions(raw);
  if ("error" in r) return { error: r.error };
  try {
    await save("report_assumptions", r.assumptions, profile.id);
    await logAudit(profile.id, "report-settings", "สมมติฐาน", r.assumptions);
    return { ok: true };
  } catch (e) {
    await logError("admin/report/assumptions", e);
    return { error: FAILED };
  }
}

/** Back to the drafted OKRs and assumptions. */
export async function resetReportSettings(): Promise<ReportResult> {
  const profile = await requireProfile({ roles: ["admin"] });
  try {
    await save("report_okrs", DEFAULT_OKRS, profile.id);
    await save("report_assumptions", DEFAULT_ASSUMPTIONS, profile.id);
    await logAudit(profile.id, "report-settings", "ค่าเริ่มต้น");
    return { ok: true };
  } catch (e) {
    await logError("admin/report/reset", e);
    return { error: FAILED };
  }
}

/** The team re-tags one feedback message by hand (null = back to the automatic tag). */
export async function tagFeedback(id: string, tag: Tag | null): Promise<ReportResult> {
  const profile = await requireProfile({ roles: ["admin"] });
  try {
    const db = createAdminClient();
    const { data } = await db.from("app_settings").select("value").eq("key", "feedback_tags").maybeSingle();
    const current = cleanTags(data?.value ?? {});
    const tags = "tags" in current ? { ...current.tags } : {};
    if (tag) tags[id] = tag;
    else delete tags[id];
    const r = cleanTags(tags);
    if ("error" in r) return { error: r.error };
    await save("feedback_tags", r.tags, profile.id);
    await logAudit(profile.id, "feedback-tag", id.slice(0, 8), tag ? { kind: tag.kind, topics: tag.topics.join(",") } : { reset: true });
    return { ok: true };
  } catch (e) {
    await logError("admin/report/tag", e);
    return { error: FAILED };
  }
}
