import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { cleanSearch, toRound3Option, type Round3Option, type Round3Row } from "@/lib/tcas";

// Reads published TCAS data for the /tcas pages. Always called with the user's own client (RLS).

export type ProgramCard = {
  programId: string;
  universityName: string;
  faculty: string;
  nameTh: string;
  programType: string;
  round3Seats: number | null;
  groupField: string;
  active: boolean;
};

export type TargetCard = ProgramCard & { position: number; sliderScores: Record<string, number> };

export type ProgramDetail = ProgramCard & {
  campus: string;
  field: string;
  nameEn: string;
  cost: string;
  round1Seats: number | null;
  publishedAt: string | null;
  round1: { projectName: string | null; seats: number | null; portfolio: string; criteria: string; link: string | null }[];
  round3: Round3Option[];
};

type ProgramRow = {
  program_id: string;
  university_name: string;
  faculty: string;
  name_th: string;
  program_type: string;
  round3_seats: number | null;
  group_field: string;
  active: boolean;
};

const CARD_FIELDS = "program_id, university_name, faculty, name_th, program_type, round3_seats, group_field, active";

const toCard = (p: ProgramRow): ProgramCard => ({
  programId: p.program_id,
  universityName: p.university_name,
  faculty: p.faculty,
  nameTh: p.name_th,
  programType: p.program_type,
  round3Seats: p.round3_seats,
  groupField: p.group_field,
  active: p.active,
});

/** Active programs matching the search, ordered university → faculty → name (at most 80). */
export async function searchPrograms(
  supabase: SupabaseClient,
  f: { q?: string; university?: string; group?: string },
): Promise<ProgramCard[]> {
  let query = supabase
    .from("tcas_programs")
    .select(CARD_FIELDS)
    .eq("active", true)
    .order("university_name")
    .order("faculty")
    .order("name_th")
    .limit(80);
  const q = cleanSearch(f.q ?? "");
  if (q) query = query.or(`name_th.ilike.%${q}%,faculty.ilike.%${q}%,field.ilike.%${q}%`);
  if (f.university) query = query.eq("university_id", f.university);
  if (f.group) query = query.eq("group_field", f.group);
  const { data, error } = await query;
  if (error) throw error;
  return ((data ?? []) as ProgramRow[]).map(toCard);
}

/** How many programs are published (0 = TCAS data not ready yet). */
export async function countPrograms(supabase: SupabaseClient): Promise<number> {
  const { count, error } = await supabase.from("tcas_programs").select("program_id", { count: "exact", head: true }).eq("active", true);
  if (error) throw error;
  return count ?? 0;
}

/** Field groups (e.g. "วิศวกรรมศาสตร์"), sorted ก–ฮ. */
export async function loadGroupFields(supabase: SupabaseClient): Promise<string[]> {
  const { data, error } = await supabase.from("tcas_programs").select("group_field").eq("active", true).limit(5000);
  if (error) throw error;
  const groups = new Set(((data ?? []) as { group_field: string }[]).map((r) => r.group_field).filter(Boolean));
  return [...groups].sort((a, b) => a.localeCompare(b, "th"));
}

/** The student's saved targets, newest change first. Includes programs no longer in the TCAS data. */
export async function loadMyTargets(supabase: SupabaseClient): Promise<TargetCard[]> {
  const { data, error } = await supabase
    .from("tcas_targets")
    .select(`position, slider_scores, updated_at, program:tcas_programs(${CARD_FIELDS})`)
    .order("updated_at", { ascending: false });
  if (error) throw error;
  type Row = { position: number; slider_scores: Record<string, number>; program: ProgramRow | null };
  return ((data ?? []) as unknown as Row[])
    .filter((r) => r.program)
    .map((r) => ({ ...toCard(r.program!), position: r.position, sliderScores: r.slider_scores ?? {} }));
}

/** One program with its Round 1 projects and Round 3 options, or null. */
export async function loadProgram(supabase: SupabaseClient, programId: string): Promise<ProgramDetail | null> {
  const { data, error } = await supabase
    .from("tcas_programs")
    .select(
      `${CARD_FIELDS}, campus, field, name_en, cost, round1_seats, published_at,
       round1:tcas_round1_projects(id, project_name, seats, portfolio, criteria, link),
       round3:tcas_round3(position, project_name, seats, min_gpax, min_total, weights, conditions, link, problem)`,
    )
    .eq("program_id", programId)
    .order("id", { referencedTable: "tcas_round1_projects" })
    .order("position", { referencedTable: "tcas_round3" })
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  type Row = ProgramRow & {
    campus: string;
    field: string;
    name_en: string;
    cost: string;
    round1_seats: number | null;
    published_at: string | null;
    round1: { project_name: string | null; seats: number | null; portfolio: string; criteria: string; link: string | null }[];
    round3: Round3Row[];
  };
  const p = data as unknown as Row;
  return {
    ...toCard(p),
    campus: p.campus,
    field: p.field,
    nameEn: p.name_en,
    cost: p.cost,
    round1Seats: p.round1_seats,
    publishedAt: p.published_at,
    round1: p.round1.map((r) => ({
      projectName: r.project_name,
      seats: r.seats,
      portfolio: r.portfolio,
      criteria: r.criteria,
      link: r.link,
    })),
    // numeric columns come back as numbers or strings depending on size; normalise.
    round3: p.round3.map((r) =>
      toRound3Option({
        ...r,
        min_gpax: r.min_gpax === null ? null : Number(r.min_gpax),
        min_total: r.min_total === null ? null : Number(r.min_total),
      }),
    ),
  };
}
