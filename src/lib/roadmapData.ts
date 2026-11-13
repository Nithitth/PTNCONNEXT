import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { dayKey } from "@/lib/calendar";
import { isBoxKind, isTerm, scoreRoadmap, targetChance, toRoadmapProgram, type AnyBox, type KeyDate, type RoadmapTemplate, type Term } from "@/lib/roadmap";
import { nextStreak, stageOf, type Proof } from "@/lib/roadmapLevels";
import { createAdminClient } from "@/lib/supabase/admin";
import { pickOption } from "@/lib/tcas";
import { loadMyTargets, loadProgram } from "@/lib/tcasData";

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
 * Recomputes the roadmap's XP and stage from its boxes and proof, updates the weekly streak when
 * `progress` is true, and saves them (service role: users can't write these columns themselves).
 * Call after requireProfile(); `userId` must be that profile's id.
 */
export async function syncLevel(supabase: SupabaseClient, userId: string, progress: boolean): Promise<LevelSaved | null> {
  const [roadmap, proofs, targets] = await Promise.all([loadMyRoadmap(supabase), loadMyProofs(supabase), loadMyTargets(supabase).catch(() => [])]);
  if (!roadmap) return null;
  const program = await loadProgram(roadmap.programId);
  if (!program) return roadmap.level;
  const rp = toRoadmapProgram(program, roadmap.position);
  const today = dayKey(new Date());
  const target = targets.find((t) => t.programId === roadmap.programId) ?? null;
  const { xp } = scoreRoadmap(roadmap.boxes, { program: rp, chance: targetChance(program.round3, target), today });
  const option = pickOption(
    program.round3.filter((o) => !o.problem),
    roadmap.position,
  );
  const level = stageOf({ boxes: roadmap.boxes, program: rp, option, proofs }, xp);
  const prev = roadmap.level;
  const streak = progress ? nextStreak(prev.lastActiveWeek, prev.streak, today) : { lastWeek: prev.lastActiveWeek, streak: prev.streak };
  const next = {
    stage: level.stage,
    max_stage: Math.max(prev.maxStage, level.stage),
    finished: level.finished,
    xp,
    streak: streak.streak,
    best_streak: Math.max(prev.bestStreak, streak.streak),
    last_active_week: streak.lastWeek,
  };
  const { data, error } = await createAdminClient()
    .from("tcas_roadmaps")
    .update(next)
    .eq("student_id", userId)
    .select(LEVEL_COLUMNS)
    .single();
  if (error) throw error;
  return toLevel(data as LevelRow);
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
