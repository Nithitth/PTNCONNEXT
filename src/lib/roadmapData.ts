import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { isBoxKind, isTerm, type AnyBox, type KeyDate, type RoadmapTemplate, type Term } from "@/lib/roadmap";

// Reads the student's roadmap (their own client, so RLS keeps it private) plus the shared
// templates and TCAS key dates.

export type MyRoadmap = { programId: string; position: number; updatedAt: string; boxes: AnyBox[] };

/** The signed-in student's roadmap with its boxes in order, or null when they have none. */
export async function loadMyRoadmap(supabase: SupabaseClient): Promise<MyRoadmap | null> {
  const { data, error } = await supabase
    .from("tcas_roadmaps")
    .select("program_id, position, updated_at, boxes:tcas_roadmap_boxes(id, kind, title, sort, data)")
    .order("sort", { referencedTable: "tcas_roadmap_boxes" })
    .order("id", { referencedTable: "tcas_roadmap_boxes" })
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  type Row = {
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
    boxes: (r.boxes ?? [])
      .filter((b) => isBoxKind(b.kind))
      .map((b) => ({ id: String(b.id), kind: b.kind, title: b.title, sort: b.sort, data: b.data }) as AnyBox),
  };
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
