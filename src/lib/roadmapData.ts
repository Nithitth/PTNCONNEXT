import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { dayKey } from "@/lib/calendar";
import { isBoxKind, isTerm, roadmapContext, type AnyBox, type KeyDate, type RoadmapProgram, type RoadmapTemplate, type Term } from "@/lib/roadmap";
import { evaluateRoadmap, nextStreak, type Proof } from "@/lib/roadmapLevels";
import { createAdminClient } from "@/lib/supabase/admin";
import { loadMyTargets, loadProgram, type ProgramDetail, type TargetCard } from "@/lib/tcasData";

// Reads the user's roadmap (their own client, so RLS keeps it private) plus the shared
// templates and TCAS key dates, and keeps the saved stage/XP/streak in step (syncLevel).

/** What the server saved about the roadmap's level (stage, streak, rewards). */
export type LevelSaved = {
  stage: number;
  maxStage: number;
  finished: boolean;
  xp: number;
  streak: number;
  bestStreak: number;
  lastActiveWeek: string | null;
  frame: string;
};

export type MyRoadmap = { programId: string; position: number; updatedAt: string; boxes: AnyBox[]; level: LevelSaved };

const LEVEL_COLUMNS = "stage, max_stage, finished, xp, streak, best_streak, last_active_week, frame";
type LevelRow = {
  stage: number;
  max_stage: number;
  finished: boolean;
  xp: number;
  streak: number;
  best_streak: number;
  last_active_week: string | null;
  frame: string;
};
const toLevel = (r: LevelRow): LevelSaved => ({
  stage: r.stage,
  maxStage: r.max_stage,
  finished: r.finished,
  xp: r.xp,
  streak: r.streak,
  bestStreak: r.best_streak,
  lastActiveWeek: r.last_active_week,
  frame: r.frame,
});

/** The signed-in user's roadmap with its boxes in order, or null when they have none. */
export async function loadMyRoadmap(supabase: SupabaseClient): Promise<MyRoadmap | null> {
  const { data, error } = await supabase
    .from("tcas_roadmaps")
    .select(`program_id, position, updated_at, ${LEVEL_COLUMNS}, boxes:tcas_roadmap_boxes(id, kind, title, sort, data)`)
    .order("sort", { referencedTable: "tcas_roadmap_boxes" })
    .order("id", { referencedTable: "tcas_roadmap_boxes" })
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  type Row = LevelRow & {
    program_id: string;
    position: number;
    updated_at: string;
    boxes: { id: number; kind: string; title: string; sort: number; data: unknown }[];
  };
  const r = data as unknown as Row;
  return {
    programId: r.program_id,
    position: r.position,
    updatedAt: r.updated_at,
    level: toLevel(r),
    boxes: (r.boxes ?? [])
      .filter((b) => isBoxKind(b.kind))
      .map((b) => ({ id: String(b.id), kind: b.kind, title: b.title, sort: b.sort, data: b.data }) as AnyBox),
  };
}

/** The user's proof records (no file paths leave the server; only whether a file exists). */
export async function loadMyProofs(supabase: SupabaseClient): Promise<Proof[]> {
  const { data, error } = await supabase.from("tcas_roadmap_proofs").select("id, step, kind, value, url, file_path").order("id");
  if (error) throw error;
  return (data ?? []).map((p) => ({
    id: String(p.id),
    step: p.step,
    kind: p.kind,
    value: p.value === null ? null : Number(p.value),
    url: p.url,
    hasFile: Boolean(p.file_path),
  }));
}

/** Room comparison for a student (null when not a student, no room, or fewer than 3 classmates). */
export async function loadClassStats(supabase: SupabaseClient): Promise<{ students: number; avgStage: number; behind: number } | null> {
  const { data, error } = await supabase.rpc("roadmap_class_stats");
  if (error) throw error;
  const row = (data ?? [])[0] as { students: number; avg_stage: number | string; behind: number } | undefined;
  return row ? { students: row.students, avgStage: Number(row.avg_stage), behind: row.behind } : null;
}

/**
 * The program behind a roadmap, as the roadmap sees it: the program's detail (cached), the roadmap's
 * view of it (with its Round 3 option) and the chance from the saved target. Null when the program
 * is gone from TCAS. Callers must run requireProfile() first (loadProgram reads with the admin client).
 */
export async function loadRoadmapContext(
  roadmap: { programId: string; position: number },
  targets: TargetCard[],
): Promise<{ detail: ProgramDetail; program: RoadmapProgram; chance: number | null; target: TargetCard | null } | null> {
  const detail = await loadProgram(roadmap.programId);
  if (!detail) return null;
  const target = targets.find((t) => t.programId === roadmap.programId) ?? null;
  return { detail, target, ...roadmapContext(detail, roadmap.position, target) };
}

/** Everything a roadmap's level depends on, read once (the user's own client, so RLS applies). */
export type RoadmapSnapshot = { roadmap: MyRoadmap; proofs: Proof[]; targets: TargetCard[] };

export async function loadSnapshot(supabase: SupabaseClient): Promise<RoadmapSnapshot | null> {
  const [roadmap, proofs, targets] = await Promise.all([
    loadMyRoadmap(supabase),
    loadMyProofs(supabase),
    loadMyTargets(supabase).catch(() => []),
  ]);
  return roadmap ? { roadmap, proofs, targets } : null;
}

/**
 * Recomputes the roadmap's XP and stage, moves the weekly streak when `progress` is true, and saves
 * them (service role: users can't write these columns). Pass a `snapshot` the action already holds
 * (with its own change applied) to skip re-reading it. Nothing is written when nothing changed.
 * Returns the saved level and the proof list. Call after requireProfile(); `userId` is that profile.
 */
export async function syncLevel(
  supabase: SupabaseClient,
  userId: string,
  progress: boolean,
  snapshot?: RoadmapSnapshot | null,
): Promise<{ level: LevelSaved; proofs: Proof[] } | null> {
  const snap = snapshot ?? (await loadSnapshot(supabase));
  if (!snap) return null;
  const { roadmap, proofs, targets } = snap;
  const prev = roadmap.level;
  const ctx = await loadRoadmapContext(roadmap, targets);
  if (!ctx) return { level: prev, proofs };

  const today = dayKey(new Date());
  const { score, level } = evaluateRoadmap(roadmap.boxes, { program: ctx.program, chance: ctx.chance, today }, proofs);
  const streak = progress ? nextStreak(prev.lastActiveWeek, prev.streak, today) : { lastWeek: prev.lastActiveWeek, streak: prev.streak };
  const next: LevelSaved = {
    stage: level.stage,
    maxStage: Math.max(prev.maxStage, level.stage),
    finished: level.finished,
    xp: score.xp,
    streak: streak.streak,
    bestStreak: Math.max(prev.bestStreak, streak.streak),
    lastActiveWeek: streak.lastWeek,
    frame: prev.frame,
  };
  const same = (Object.keys(next) as (keyof LevelSaved)[]).every((k) => next[k] === prev[k]);
  if (same) return { level: prev, proofs };

  const { error } = await createAdminClient()
    .from("tcas_roadmaps")
    .update({
      stage: next.stage,
      max_stage: next.maxStage,
      finished: next.finished,
      xp: next.xp,
      streak: next.streak,
      best_streak: next.bestStreak,
      last_active_week: next.lastActiveWeek,
    })
    .eq("student_id", userId);
  if (error) throw error;
  return { level: next, proofs };
}

/** Templates the guidance teacher has checked (students only ever receive approved rows). */
export async function loadApprovedTemplates(supabase: SupabaseClient, groupField?: string): Promise<RoadmapTemplate[]> {
  let q = supabase.from("tcas_roadmap_templates").select("id, group_field, term, title, xp").eq("approved", true);
  if (groupField) q = q.eq("group_field", groupField);
  const { data, error } = await q.order("term").order("id");
  if (error) throw error;
  return (data ?? [])
    .filter((t) => isTerm(t.term))
    .map((t) => ({ id: Number(t.id), groupField: t.group_field, term: t.term as Term, title: t.title, xp: t.xp }));
}

/** TCAS key dates (exams, applications), soonest first. */
export async function loadKeyDates(supabase: SupabaseClient): Promise<(KeyDate & { id: number })[]> {
  const { data, error } = await supabase.from("tcas_key_dates").select("id, label, date").order("date");
  if (error) throw error;
  return (data ?? []).map((d) => ({ id: Number(d.id), label: d.label, date: d.date }));
}
