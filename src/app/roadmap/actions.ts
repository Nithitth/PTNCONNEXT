"use server";

import { revalidatePath } from "next/cache";
import { requireProfile } from "@/lib/auth";
import { dayKey } from "@/lib/calendar";
import { logError } from "@/lib/logs";
import {
  ROADMAP_MAX_BOXES,
  cleanBoxData,
  cleanBoxTitle,
  isBoxKind,
  mergeQuests,
  newBoxData,
  suggestedQuests,
  toRoadmapProgram,
  type AnyBox,
  type BoxKind,
  type QuestItem,
} from "@/lib/roadmap";
import { loadApprovedTemplates, loadKeyDates } from "@/lib/roadmapData";
import { createClient } from "@/lib/supabase/server";
import { isProgramId, mytcasUrl } from "@/lib/tcas";
import { loadProgram } from "@/lib/tcasData";

// Every action: any signed-in user (students, teachers, admins), their own client (RLS keeps it to their own rows),
// a Thai error message, and unexpected failures logged for the Developer Console.

export type RoadmapResult = { ok?: true; error?: string; box?: AnyBox };

const PAGE = "/roadmap";
const FAILED = "บันทึกไม่สำเร็จ ลองอีกครั้ง";
const isBoxId = (id: string) => /^\d{1,18}$/.test(id);

type BoxRow = { id: number; kind: string; title: string; sort: number; data: unknown };
const toBox = (r: BoxRow) => ({ id: String(r.id), kind: r.kind, title: r.title, sort: r.sort, data: r.data }) as AnyBox;

async function activeProgram(programId: string) {
  if (!isProgramId(programId)) return null;
  const p = await loadProgram(programId);
  return p && p.active ? p : null;
}

/** Starting data for a box of this kind, filled from the roadmap's program. */
async function startingData(supabase: Awaited<ReturnType<typeof createClient>>, kind: BoxKind, programId: string, position: number) {
  const p = await loadProgram(programId);
  const program = p
    ? toRoadmapProgram(p, position)
    : { programId, groupField: "", minGpax: null, weights: {}, hasRound3: false, round1: [] };
  const [templates, keyDates] = await Promise.all([
    kind === "quests" ? loadApprovedTemplates(supabase, program.groupField) : Promise.resolve([]),
    kind === "countdown" ? loadKeyDates(supabase) : Promise.resolve([]),
  ]);
  return newBoxData(kind, program, { templates, keyDates, today: dayKey(new Date()), mytcasUrl: mytcasUrl(programId) });
}

/** Creates the student's one roadmap with three starter boxes (they can remove them). */
export async function createRoadmap(programId: string, position: number): Promise<RoadmapResult> {
  const profile = await requireProfile();
  if (!Number.isInteger(position)) return { error: "ไม่พบหลักสูตรนี้" };
  try {
    if (!(await activeProgram(programId))) return { error: "ไม่พบหลักสูตรนี้" };
    const supabase = await createClient();
    const { data: existing } = await supabase.from("tcas_roadmaps").select("student_id").maybeSingle();
    if (existing) return { error: "มี Roadmap อยู่แล้ว เปลี่ยนเป้าหมายแทนได้" };

    const { error } = await supabase.from("tcas_roadmaps").insert({ student_id: profile.id, program_id: programId, position });
    if (error) throw error;
    const starters: BoxKind[] = ["goal", "quests", "countdown"];
    const rows = await Promise.all(
      starters.map(async (kind, i) => ({
        student_id: profile.id,
        kind,
        title: cleanBoxTitle(kind, ""),
        sort: i,
        data: await startingData(supabase, kind, programId, position),
      })),
    );
    const { error: boxError } = await supabase.from("tcas_roadmap_boxes").insert(rows);
    if (boxError) {
      await supabase.from("tcas_roadmaps").delete().eq("student_id", profile.id);
      throw boxError;
    }
    revalidatePath(PAGE);
    revalidatePath("/tcas");
    return { ok: true };
  } catch (e) {
    await logError("tcas/roadmap", e);
    return { error: FAILED };
  }
}

/** Points the roadmap at another program. Boxes and their data stay. */
export async function changeRoadmapTarget(programId: string, position: number): Promise<RoadmapResult> {
  const profile = await requireProfile();
  if (!Number.isInteger(position)) return { error: "ไม่พบหลักสูตรนี้" };
  try {
    if (!(await activeProgram(programId))) return { error: "ไม่พบหลักสูตรนี้" };
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("tcas_roadmaps")
      .update({ program_id: programId, position, updated_at: new Date().toISOString() })
      .eq("student_id", profile.id)
      .select("student_id");
    if (error) throw error;
    if (!data?.length) return { error: "ยังไม่มี Roadmap" };
    revalidatePath(PAGE);
    revalidatePath("/tcas");
    return { ok: true };
  } catch (e) {
    await logError("tcas/roadmap", e);
    return { error: FAILED };
  }
}

/** Deletes the roadmap and every box in it. */
export async function deleteRoadmap(): Promise<RoadmapResult> {
  const profile = await requireProfile();
  try {
    const supabase = await createClient();
    const { error } = await supabase.from("tcas_roadmaps").delete().eq("student_id", profile.id);
    if (error) throw error;
    revalidatePath(PAGE);
    revalidatePath("/tcas");
    return { ok: true };
  } catch (e) {
    await logError("tcas/roadmap", e);
    return { error: "ลบไม่สำเร็จ ลองอีกครั้ง" };
  }
}

/** Adds a box of this kind at the end. At most 10 boxes. */
export async function addBox(kind: string): Promise<RoadmapResult> {
  const profile = await requireProfile();
  if (!isBoxKind(kind)) return { error: "ไม่รู้จักกล่องแบบนี้" };
  try {
    const supabase = await createClient();
    const { data: roadmap } = await supabase.from("tcas_roadmaps").select("program_id, position").maybeSingle();
    if (!roadmap) return { error: "ยังไม่มี Roadmap" };
    const { data: boxes, error: listError } = await supabase.from("tcas_roadmap_boxes").select("sort");
    if (listError) throw listError;
    if ((boxes?.length ?? 0) >= ROADMAP_MAX_BOXES) return { error: `ใส่ได้สูงสุด ${ROADMAP_MAX_BOXES} กล่อง ลบกล่องเดิมก่อน` };
    const sort = Math.max(-1, ...(boxes ?? []).map((b) => b.sort)) + 1;
    const { data, error } = await supabase
      .from("tcas_roadmap_boxes")
      .insert({
        student_id: profile.id,
        kind,
        title: cleanBoxTitle(kind, ""),
        sort,
        data: await startingData(supabase, kind, roadmap.program_id, roadmap.position),
      })
      .select("id, kind, title, sort, data")
      .single();
    if (error) {
      if (error.code === "23514") return { error: `ใส่ได้สูงสุด ${ROADMAP_MAX_BOXES} กล่อง ลบกล่องเดิมก่อน` };
      throw error;
    }
    return { ok: true, box: toBox(data as BoxRow) };
  } catch (e) {
    await logError("tcas/roadmap", e);
    return { error: FAILED };
  }
}

/** Saves a box's title and data after checking both. */
export async function updateBox(id: string, title: unknown, data: unknown): Promise<RoadmapResult> {
  await requireProfile();
  if (!isBoxId(id)) return { error: "ไม่พบกล่องนี้" };
  try {
    const supabase = await createClient();
    const { data: row } = await supabase.from("tcas_roadmap_boxes").select("kind").eq("id", id).maybeSingle();
    if (!row || !isBoxKind(row.kind)) return { error: "ไม่พบกล่องนี้" };
    const cleanTitle = cleanBoxTitle(row.kind, title);
    const clean = cleanBoxData(row.kind, data);
    if (cleanTitle === null) return { error: "ชื่อกล่องยาวเกิน 60 ตัวอักษร" };
    if (clean === null) return { error: "ข้อมูลในกล่องไม่ถูกต้อง หรือยาว/มากเกินไป" };
    const { error } = await supabase
      .from("tcas_roadmap_boxes")
      .update({ title: cleanTitle, data: clean, updated_at: new Date().toISOString() })
      .eq("id", id);
    if (error) throw error;
    return { ok: true };
  } catch (e) {
    await logError("tcas/roadmap", e);
    return { error: FAILED };
  }
}

/** Moves a box one place up (-1) or down (+1). */
export async function moveBox(id: string, dir: number): Promise<RoadmapResult> {
  await requireProfile();
  if (!isBoxId(id) || (dir !== 1 && dir !== -1)) return { error: "ไม่พบกล่องนี้" };
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.from("tcas_roadmap_boxes").select("id, sort").order("sort").order("id");
    if (error) throw error;
    const ids = (data ?? []).map((b) => String(b.id));
    const i = ids.indexOf(id);
    const j = i + dir;
    if (i < 0) return { error: "ไม่พบกล่องนี้" };
    if (j < 0 || j >= ids.length) return { ok: true };
    [ids[i], ids[j]] = [ids[j], ids[i]];
    // Rewrite every sort as its position, so old gaps or ties are cleaned up too.
    const results = await Promise.all(
      ids.map((boxId, sort) => supabase.from("tcas_roadmap_boxes").update({ sort }).eq("id", boxId)),
    );
    const failed = results.find((r) => r.error);
    if (failed?.error) throw failed.error;
    return { ok: true };
  } catch (e) {
    await logError("tcas/roadmap", e);
    return { error: FAILED };
  }
}

export async function deleteBox(id: string): Promise<RoadmapResult> {
  await requireProfile();
  if (!isBoxId(id)) return { error: "ไม่พบกล่องนี้" };
  try {
    const supabase = await createClient();
    const { error } = await supabase.from("tcas_roadmap_boxes").delete().eq("id", id);
    if (error) throw error;
    return { ok: true };
  } catch (e) {
    await logError("tcas/roadmap", e);
    return { error: "ลบไม่สำเร็จ ลองอีกครั้ง" };
  }
}

/** Adds the suggested quests for the roadmap's program to a quest box, keeping what's there. */
export async function fillQuestSuggestions(id: string): Promise<RoadmapResult> {
  await requireProfile();
  if (!isBoxId(id)) return { error: "ไม่พบกล่องนี้" };
  try {
    const supabase = await createClient();
    const [{ data: roadmap }, { data: row }] = await Promise.all([
      supabase.from("tcas_roadmaps").select("program_id, position").maybeSingle(),
      supabase.from("tcas_roadmap_boxes").select("id, kind, title, sort, data").eq("id", id).maybeSingle(),
    ]);
    if (!roadmap || !row || row.kind !== "quests") return { error: "ไม่พบกล่องนี้" };
    const p = await loadProgram(roadmap.program_id);
    if (!p) return { error: "ไม่พบหลักสูตรนี้" };
    const program = toRoadmapProgram(p, roadmap.position);
    const current = cleanBoxData("quests", row.data) ?? { items: [] as QuestItem[] };
    const items = mergeQuests(current.items, suggestedQuests(program, await loadApprovedTemplates(supabase, program.groupField)));
    const { error } = await supabase
      .from("tcas_roadmap_boxes")
      .update({ data: { items }, updated_at: new Date().toISOString() })
      .eq("id", id);
    if (error) throw error;
    return { ok: true, box: toBox({ ...(row as BoxRow), data: { items } }) };
  } catch (e) {
    await logError("tcas/roadmap", e);
    return { error: FAILED };
  }
}
