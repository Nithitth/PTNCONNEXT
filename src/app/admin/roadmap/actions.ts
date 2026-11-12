"use server";

import { revalidatePath } from "next/cache";
import { requireProfile } from "@/lib/auth";
import { logError } from "@/lib/logs";
import { isDayKey, isTerm } from "@/lib/roadmap";
import { createClient } from "@/lib/supabase/server";
import { TCAS_YEAR } from "@/lib/tcas";

// Developer Console → แม่แบบ Roadmap. Admin only. RLS allows writes for admins only too.

export type AdminRoadmapResult = { ok?: true; error?: string };

const PAGE = "/admin/roadmap";
const isId = (id: unknown): id is number => Number.isInteger(id) && (id as number) > 0;
const trim = (v: unknown, max: number) => (typeof v === "string" && v.trim().length <= max ? v.trim() : null);

async function run(fn: () => Promise<AdminRoadmapResult>): Promise<AdminRoadmapResult> {
  await requireProfile({ roles: ["admin"] });
  try {
    const res = await fn();
    if (res.ok) revalidatePath(PAGE);
    return res;
  } catch (e) {
    await logError("admin/roadmap", e);
    return { error: "บันทึกไม่สำเร็จ ลองอีกครั้ง" };
  }
}

/** Adds (no id) or edits a template quest. Editing it un-approves it until the teacher checks again. */
export async function saveTemplate(input: {
  id?: number;
  groupField: string;
  term: string;
  title: string;
  detail: string;
  xp: number;
}): Promise<AdminRoadmapResult> {
  return run(async () => {
    const groupField = trim(input.groupField, 200);
    const title = trim(input.title, 100);
    const detail = trim(input.detail ?? "", 500);
    if (!groupField) return { error: "เลือกกลุ่มสาขา" };
    if (!isTerm(input.term)) return { error: "เลือกเทอม" };
    if (!title) return { error: "ใส่ชื่อภารกิจ (ไม่เกิน 100 ตัวอักษร)" };
    if (detail === null) return { error: "รายละเอียดยาวเกิน 500 ตัวอักษร" };
    if (![10, 20, 30].includes(input.xp)) return { error: "XP ต้องเป็น 10, 20 หรือ 30" };
    const row = { group_field: groupField, term: input.term, title, detail, xp: input.xp, approved: false, updated_at: new Date().toISOString() };
    const supabase = await createClient();
    const { error } = isId(input.id)
      ? await supabase.from("tcas_roadmap_templates").update(row).eq("id", input.id)
      : await supabase.from("tcas_roadmap_templates").insert(row);
    if (error) throw error;
    return { ok: true };
  });
}

/** Marks a template as checked by the guidance teacher (students see only checked ones). */
export async function setTemplateApproved(id: number, approved: boolean): Promise<AdminRoadmapResult> {
  return run(async () => {
    if (!isId(id) || typeof approved !== "boolean") return { error: "ไม่พบแม่แบบนี้" };
    const supabase = await createClient();
    const { error } = await supabase.from("tcas_roadmap_templates").update({ approved }).eq("id", id);
    if (error) throw error;
    return { ok: true };
  });
}

export async function deleteTemplate(id: number): Promise<AdminRoadmapResult> {
  return run(async () => {
    if (!isId(id)) return { error: "ไม่พบแม่แบบนี้" };
    const supabase = await createClient();
    const { error } = await supabase.from("tcas_roadmap_templates").delete().eq("id", id);
    if (error) throw error;
    return { ok: true };
  });
}

/** Adds a TCAS key date (shown as a suggestion in students' countdown boxes). */
export async function saveKeyDate(input: { label: string; date: string }): Promise<AdminRoadmapResult> {
  return run(async () => {
    const label = trim(input.label, 60);
    if (!label) return { error: "ใส่ชื่อวัน (ไม่เกิน 60 ตัวอักษร)" };
    if (!isDayKey(input.date)) return { error: "เลือกวันที่" };
    const supabase = await createClient();
    const { error } = await supabase.from("tcas_key_dates").insert({ label, date: input.date, tcas_year: TCAS_YEAR });
    if (error) throw error;
    return { ok: true };
  });
}

export async function deleteKeyDate(id: number): Promise<AdminRoadmapResult> {
  return run(async () => {
    if (!isId(id)) return { error: "ไม่พบวันนี้" };
    const supabase = await createClient();
    const { error } = await supabase.from("tcas_key_dates").delete().eq("id", id);
    if (error) throw error;
    return { ok: true };
  });
}
