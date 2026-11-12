import "server-only";
import { unstable_cache } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { TCAS_UNIVERSITIES, cleanSearch, toRound3Option, type Round3Option, type Round3Row } from "@/lib/tcas";

// Reads published TCAS data for the /tcas pages.
// - Personal data (targets) uses the user's own client (RLS).
// - Reference data that is the same for every signed-in user (the program list, counts, field groups,
//   one program's detail)
//   is cached across requests with unstable_cache. Cached code can't read cookies, so it uses the admin
//   client; callers must run requireProfile() first. Publishing a university clears the "tcas" tag.

export const TCAS_CACHE_TAG = "tcas";
const CACHE = { tags: [TCAS_CACHE_TAG], revalidate: 3600 };

export type ProgramCard = {
  programId: string;
  universityId: string;
  universityName: string;
  faculty: string;
  nameTh: string;
  programType: string;
  round3Seats: number | null;
  groupField: string;
  active: boolean;
  /** Last year's Round 3 result (TCAS69), null when unknown. */
  lastMin: number | null;
  lastMax: number | null;
  lastSeats: number | null;
  lastApplicants: number | null;
  /** How many Round 1 (Portfolio) projects and Round 3 options the program has (0 = not open in that round). */
  round1Projects: number;
  round3Options: number;
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
  university_id: string;
  last_min: number | string | null;
  last_max: number | string | null;
  last_seats: number | null;
  last_applicants: number | null;
  round1_count?: { count: number }[];
  round3_count?: { count: number }[];
};

const CARD_BASE =
  "program_id, university_id, university_name, faculty, name_th, program_type, round3_seats, group_field, active, last_min, last_max, last_seats, last_applicants";
/** Card columns plus how many Round 1 projects / Round 3 options each program has. */
const CARD_FIELDS = `${CARD_BASE}, round1_count:tcas_round1_projects(count), round3_count:tcas_round3(count)`;
const numOrNull = (v: number | string | null) => (v === null ? null : Number(v));

const toCard = (p: ProgramRow): ProgramCard => ({
  programId: p.program_id,
  universityName: p.university_name,
  faculty: p.faculty,
  nameTh: p.name_th,
  programType: p.program_type,
  round3Seats: p.round3_seats,
  groupField: p.group_field,
  active: p.active,
  universityId: p.university_id,
  lastMin: numOrNull(p.last_min),
  lastMax: numOrNull(p.last_max),
  lastSeats: p.last_seats,
  lastApplicants: p.last_applicants,
  round1Projects: p.round1_count?.[0]?.count ?? 0,
  round3Options: p.round3_count?.[0]?.count ?? 0,
});

/** How the program list can be sorted (the `?s=` parameter on /tcas). */
export type ProgramSort = "faculty" | "low" | "high" | "competition";
export const PROGRAM_SORTS: ProgramSort[] = ["faculty", "low", "high", "competition"];

/** Applicants per seat last year, or null when unknown. */
export const competition = (p: Pick<ProgramCard, "lastApplicants" | "lastSeats">) =>
  p.lastApplicants !== null && p.lastSeats ? p.lastApplicants / p.lastSeats : null;

type SearchableCard = ProgramCard & { field: string };

/**
 * Every active program as a list card (about 630 small rows), ordered university → faculty → name.
 * Cached for everyone and cleared on publish, so browsing and searching never hit the database.
 */
const loadAllCards = unstable_cache(
  async (): Promise<SearchableCard[]> => {
    const { data, error } = await createAdminClient()
      .from("tcas_programs")
      .select(`${CARD_FIELDS}, field`)
      .eq("active", true)
      .order("university_name")
      .order("faculty")
      .order("name_th")
      .range(0, 4999);
    if (error) throw error;
    return ((data ?? []) as (ProgramRow & { field: string | null })[]).map((r) => ({ ...toCard(r), field: r.field ?? "" }));
  },
  ["tcas-all-cards-v2"], // v2: cards carry round1/round3 counts; a new key skips old cached rows
  CACHE,
);

/**
 * All active programs matching the filters (none = every program). Sort: university → faculty → name
 * (default), last year's lowest score (low/high), or competition (applicants per seat, lowest first).
 * Programs without last-year data go last in the score/competition sorts.
 */
export async function searchPrograms(f: {
  q?: string;
  university?: string;
  group?: string;
  sort?: ProgramSort;
}): Promise<ProgramCard[]> {
  const q = cleanSearch(f.q ?? "").toLowerCase();
  const cards = (await loadAllCards()).filter(
    (p) =>
      (!f.university || p.universityId === f.university) &&
      (!f.group || p.groupField === f.group) &&
      (!q || [p.nameTh, p.faculty, p.field].some((t) => t.toLowerCase().includes(q))),
  );
  // Array.prototype.sort is stable, so ties keep the university → faculty → name order.
  const last = (n: number | null, dir: 1 | -1) => (n === null ? Infinity : dir * n);
  if (f.sort === "low") cards.sort((a, b) => last(a.lastMin, 1) - last(b.lastMin, 1));
  if (f.sort === "high") cards.sort((a, b) => last(a.lastMin, -1) - last(b.lastMin, -1));
  if (f.sort === "competition") cards.sort((a, b) => (competition(a) ?? Infinity) - (competition(b) ?? Infinity));
  return cards;
}

/** Several programs by id, in the given order (for the compare page). Unknown ids are skipped. */
export async function loadPrograms(ids: string[]): Promise<ProgramDetail[]> {
  const all = await Promise.all(ids.map((id) => loadProgram(id)));
  return all.filter((p): p is ProgramDetail => p !== null);
}

/** Published programs per TCAS university id (empty = TCAS data not ready yet). Cached. */
export const countByUniversity = unstable_cache(
  async (): Promise<Record<string, number>> => {
    const supabase = createAdminClient();
    // One count-only request per university: no rows are downloaded.
    const results = await Promise.all(
      TCAS_UNIVERSITIES.map((u) =>
        supabase
          .from("tcas_programs")
          .select("program_id", { count: "exact", head: true })
          .eq("active", true)
          .eq("university_id", u.id),
      ),
    );
    const counts: Record<string, number> = {};
    TCAS_UNIVERSITIES.forEach((u, i) => {
      const { count, error } = results[i];
      if (error) throw error;
      if (count) counts[u.id] = count;
    });
    return counts;
  },
  ["tcas-count-by-university"],
  CACHE,
);

/** Field groups (e.g. "วิศวกรรมศาสตร์"), sorted ก–ฮ. Cached. */
export const loadGroupFields = unstable_cache(
  async (): Promise<string[]> => {
    const { data, error } = await createAdminClient()
      .from("tcas_programs")
      .select("group_field")
      .eq("active", true)
      .limit(5000);
    if (error) throw error;
    const groups = new Set(((data ?? []) as { group_field: string }[]).map((r) => r.group_field).filter(Boolean));
    return [...groups].sort((a, b) => a.localeCompare(b, "th"));
  },
  ["tcas-group-fields"],
  CACHE,
);

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

/**
 * One program with its Round 1 projects and Round 3 options, or null. Cached per program id.
 * Inactive programs are returned too (as before), so a saved target can show it is no longer offered.
 */
export const loadProgram = unstable_cache(readProgram, ["tcas-program-v2"], CACHE);

async function readProgram(programId: string): Promise<ProgramDetail | null> {
  const { data, error } = await createAdminClient()
    .from("tcas_programs")
    .select(
      `${CARD_BASE}, campus, field, name_en, cost, round1_seats, published_at,
       round1:tcas_round1_projects(id, project_name, seats, portfolio, criteria, link),
       round3:tcas_round3(position, project_name, seats, min_gpax, min_total, weights, conditions, link, problem, last_min, last_max, last_seats, last_applicants)`,
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
    ...toCard({ ...p, round1_count: [{ count: p.round1.length }], round3_count: [{ count: p.round3.length }] }),
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
