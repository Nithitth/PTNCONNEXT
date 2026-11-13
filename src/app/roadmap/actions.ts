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
import { loadApprovedTemplates, loadKeyDates, loadMyProofs, syncLevel, type LevelSaved } from "@/lib/roadmapData";
import { PROOF_BUCKET, PROOF_MAX_BYTES, PROOF_STEP, pickReward, type Proof } from "@/lib/roadmapLevels";
import { createClient } from "@/lib/supabase/server";
import { isProgramId, mytcasUrl } from "@/lib/tcas";
import { loadProgram } from "@/lib/tcasData";

// Every action: any signed-in user (students, teachers, admins), their own client (RLS keeps it to their own rows),
// a Thai error message, and unexpected failures logged for the Developer Console.

export type RoadmapResult = { ok?: true; error?: string; box?: AnyBox; level?: LevelSaved | null; proofs?: Proof[] };

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
    await syncLevel(supabase, profile.id, true);
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
    await syncLevel(supabase, profile.id, false);
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
    const { data: files } = await supabase.storage.from(PROOF_BUCKET).list(profile.id, { limit: 200 });
    if (files?.length) await supabase.storage.from(PROOF_BUCKET).remove(files.map((x) => `${profile.id}/${x.name}`));
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
    return { ok: true, box: toBox(data as BoxRow), level: await syncLevel(supabase, profile.id, true) };
  } catch (e) {
    await logError("tcas/roadmap", e);
    return { error: FAILED };
  }
}

/** Saves a box's title and data after checking both. */
export async function updateBox(id: string, title: unknown, data: unknown): Promise<RoadmapResult> {
  const profile = await requireProfile();
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
    return { ok: true, level: await syncLevel(supabase, profile.id, true) };
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
  const profile = await requireProfile();
  if (!isBoxId(id)) return { error: "ไม่พบกล่องนี้" };
  try {
    const supabase = await createClient();
    const { error } = await supabase.from("tcas_roadmap_boxes").delete().eq("id", id);
    if (error) throw error;
    return { ok: true, level: await syncLevel(supabase, profile.id, false) };
  } catch (e) {
    await logError("tcas/roadmap", e);
    return { error: "ลบไม่สำเร็จ ลองอีกครั้ง" };
  }
}

/** Adds the suggested quests for the roadmap's program to a quest box, keeping what's there. */
export async function fillQuestSuggestions(id: string): Promise<RoadmapResult> {
  const profile = await requireProfile();
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
    return { ok: true, box: toBox({ ...(row as BoxRow), data: { items } }), level: await syncLevel(supabase, profile.id, true) };
  } catch (e) {
    await logError("tcas/roadmap", e);
    return { error: FAILED };
  }
}

// ─── Proof (gate evidence) ───────────────────────────────────

const PROOF_FAILED = "บันทึกหลักฐานไม่สำเร็จ ลองอีกครั้ง";

/** Which proof kinds a step accepts: grade report = file; activities = file or link; scores = number; portfolio = link. */
function allowedKinds(step: string): Proof["kind"][] {
  if (step === "gpax") return ["file"];
  if (step === "portfolio-link") return ["link"];
  if (step.startsWith("score:")) return ["number"];
  return ["file", "link"];
}

/**
 * Saves (or replaces) the proof for one gate step. Files are uploaded by the browser straight to the
 * private bucket under <uid>/…; here we check the path is the user's own and the file exists.
 */
export async function saveProof(
  step: string,
  input: { kind: "file"; path: string } | { kind: "link"; url: string } | { kind: "number"; value: number },
): Promise<RoadmapResult> {
  const profile = await requireProfile();
  if (!PROOF_STEP.test(step) || !allowedKinds(step).includes(input.kind)) return { error: "หลักฐานไม่ถูกต้อง" };
  const row: { owner_id: string; step: string; kind: string; file_path: string | null; url: string | null; value: number | null } = {
    owner_id: profile.id,
    step,
    kind: input.kind,
    file_path: null,
    url: null,
    value: null,
  };
  if (input.kind === "link") {
    const url = typeof input.url === "string" ? input.url.trim() : "";
    try {
      const u = new URL(url);
      if ((u.protocol !== "http:" && u.protocol !== "https:") || url.length > 500) throw new Error();
    } catch {
      return { error: "ลิงก์ไม่ถูกต้อง ต้องขึ้นต้นด้วย https://" };
    }
    row.url = url;
  } else if (input.kind === "number") {
    if (typeof input.value !== "number" || !Number.isFinite(input.value) || input.value < 0 || input.value > 100) {
      return { error: "คะแนนต้องอยู่ระหว่าง 0–100" };
    }
    row.value = Math.round(input.value * 100) / 100;
  } else {
    const path = typeof input.path === "string" ? input.path : "";
    if (!new RegExp(`^${profile.id}/[0-9a-f-]{36}\\.(pdf|jpg|jpeg|png|webp)$`).test(path)) return { error: "ไฟล์ไม่ถูกต้อง" };
    row.file_path = path;
  }
  try {
    const supabase = await createClient();
    if (row.file_path) {
      const name = row.file_path.split("/")[1];
      const { data: found } = await supabase.storage.from(PROOF_BUCKET).list(profile.id, { search: name, limit: 1 });
      const file = found?.find((x) => x.name === name);
      if (!file) return { error: "ไม่พบไฟล์ที่อัปโหลด ลองอีกครั้ง" };
      if ((file.metadata?.size ?? 0) > PROOF_MAX_BYTES) return { error: "ไฟล์ใหญ่เกิน 5 MB" };
    }
    const { data: old } = await supabase.from("tcas_roadmap_proofs").select("file_path").eq("step", step).maybeSingle();
    const { error } = await supabase.from("tcas_roadmap_proofs").upsert(row, { onConflict: "owner_id,step" });
    if (error) throw error;
    if (old?.file_path && old.file_path !== row.file_path) await supabase.storage.from(PROOF_BUCKET).remove([old.file_path]);
    return { ok: true, proofs: await loadMyProofs(supabase), level: await syncLevel(supabase, profile.id, true) };
  } catch (e) {
    await logError("tcas/roadmap-proof", e);
    return { error: PROOF_FAILED };
  }
}

/** Removes one gate step's proof (and its file). */
export async function removeProof(step: string): Promise<RoadmapResult> {
  const profile = await requireProfile();
  if (!PROOF_STEP.test(step)) return { error: "หลักฐานไม่ถูกต้อง" };
  try {
    const supabase = await createClient();
    const { data: old } = await supabase.from("tcas_roadmap_proofs").select("file_path").eq("step", step).maybeSingle();
    const { error } = await supabase.from("tcas_roadmap_proofs").delete().eq("step", step);
    if (error) throw error;
    if (old?.file_path) await supabase.storage.from(PROOF_BUCKET).remove([old.file_path]);
    return { ok: true, proofs: await loadMyProofs(supabase), level: await syncLevel(supabase, profile.id, false) };
  } catch (e) {
    await logError("tcas/roadmap-proof", e);
    return { error: "ลบหลักฐานไม่สำเร็จ ลองอีกครั้ง" };
  }
}

/** Chooses the card's frame and theme (only ones already unlocked). */
export async function setLook(frame: string, theme: string): Promise<RoadmapResult> {
  await requireProfile();
  try {
    const supabase = await createClient();
    const { data: r } = await supabase.from("tcas_roadmaps").select("max_stage, best_streak").maybeSingle();
    if (!r) return { error: "ยังไม่มี Roadmap" };
    const look = { frame: pickReward("frame", frame, r.max_stage, r.best_streak), theme: pickReward("theme", theme, r.max_stage, r.best_streak) };
    const { error } = await supabase.from("tcas_roadmaps").update(look).not("student_id", "is", null);
    if (error) throw error;
    return { ok: true };
  } catch (e) {
    await logError("tcas/roadmap", e);
    return { error: FAILED };
  }
}
