// Turns the official TCAS JSON (course.mytcas.com) into our rows. Pure, unit-tested in tcasSource.test.ts.
// The NormalizedProgram shape is also what tcas_publish() reads from tcas_staging.payload (migration 0007).
import { TCAS_YEAR, checkRound3, type Round3Row } from "./tcas";

/** One entry of courses.json (only the fields we use). */
export type RawCourse = {
  program_id: string;
  university_id: string;
  university_name_th: string;
  campus_name_th: string;
  faculty_name_th: string;
  group_field_th: string;
  field_name_th: string;
  program_name_th: string;
  program_name_en: string;
  program_type_name_th: string;
  cost: string;
  updated_at?: string;
};

/** One entry of rounds/<program_id>.json. */
export type RawRound = Record<string, unknown> & { type?: string };

export type NormalizedProgram = {
  program: {
    program_id: string;
    university_id: string;
    university_name: string;
    campus: string;
    faculty: string;
    group_field: string;
    field: string;
    name_th: string;
    name_en: string;
    program_type: string;
    cost: string;
    round1_seats: number | null;
    round3_seats: number | null;
    tcas_year: number;
    source_updated_at: string | null;
  };
  round1: { project_name: string | null; seats: number | null; portfolio: string; criteria: string; link: string | null }[];
  round3: Round3Row[];
  fingerprint: string;
};

/** The rounds file, or [] when TCAS answers with an error page, XML, or anything that isn't a list. */
export function parseRounds(body: string): RawRound[] {
  try {
    const data: unknown = JSON.parse(body);
    return Array.isArray(data) ? (data.filter((r) => r && typeof r === "object") as RawRound[]) : [];
  } catch {
    return [];
  }
}

const num = (v: unknown): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};
const text = (v: unknown): string => (typeof v === "string" ? v : "");
const textOrNull = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v : null);
const obj = (v: unknown): Record<string, unknown> =>
  v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};

function numbersOnly(v: unknown): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [k, x] of Object.entries(obj(v))) {
    const n = num(x);
    if (n !== null && typeof x !== "boolean") out[k] = n;
  }
  return out;
}

/** "folio_q1", "folio_q2", … in number order, blank line between them. */
function portfolioText(folio: unknown): string {
  return Object.entries(obj(folio))
    .map(([k, v]) => [Number(/^folio_q(\d+)$/.exec(k)?.[1]), v] as const)
    .filter(([n, v]) => Number.isFinite(n) && typeof v === "string" && v.trim())
    .sort((a, b) => a[0] - b[0])
    .map(([, v]) => (v as string).trim())
    .join("\n\n");
}

const seatSum = (rows: RawRound[]) =>
  rows.length === 0 ? null : rows.reduce((s, r) => s + (num(r.receive_student_number) ?? 0), 0);

/** Sorts object keys at every level, so the same data always gives the same string. */
function stable(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(stable);
  if (v && typeof v === "object") {
    return Object.fromEntries(
      Object.keys(v as object)
        .sort()
        .map((k) => [k, stable((v as Record<string, unknown>)[k])]),
    );
  }
  return v;
}

export function normalizeProgram(course: RawCourse, rounds: RawRound[], year: number = TCAS_YEAR): NormalizedProgram {
  const r1 = rounds.filter((r) => r.type === `1_${year}`);
  const r3 = rounds.filter((r) => r.type === `3_${year}`);

  const program: NormalizedProgram["program"] = {
    program_id: course.program_id,
    university_id: course.university_id,
    university_name: text(course.university_name_th),
    campus: text(course.campus_name_th),
    faculty: text(course.faculty_name_th),
    group_field: text(course.group_field_th),
    field: text(course.field_name_th),
    name_th: text(course.program_name_th),
    name_en: text(course.program_name_en),
    program_type: text(course.program_type_name_th),
    cost: text(course.cost),
    round1_seats: seatSum(r1),
    round3_seats: seatSum(r3),
    tcas_year: year,
    source_updated_at: textOrNull(course.updated_at),
  };

  const round1 = r1.map((r) => ({
    project_name: textOrNull(r.project_name_th),
    seats: num(r.receive_student_number),
    portfolio: portfolioText(r.folio),
    criteria: text(r.criteria).trim(),
    link: textOrNull(r.link),
  }));

  const round3: Round3Row[] = r3.map((r, position) => {
    const weights = numbersOnly(r.scores);
    const conditions = numbersOnly(r.score_conditions);
    return {
      position,
      project_name: textOrNull(r.project_name_th),
      seats: num(r.receive_student_number),
      min_gpax: num(r.min_gpax),
      min_total: num(r.min_total_score),
      weights,
      conditions,
      link: textOrNull(r.link),
      // Check the raw object so non-numeric weights are flagged too.
      problem: checkRound3(obj(r.scores)),
    };
  });

  const { source_updated_at: _ignored, ...fingerprinted } = program;
  void _ignored;
  const fingerprint = JSON.stringify(stable({ program: fingerprinted, round1, round3 }));
  return { program, round1, round3, fingerprint };
}

/** courses.json can list one program more than once (e.g. per major); keep the first entry. */
export function uniqueCourses(courses: RawCourse[]): RawCourse[] {
  const seen = new Set<string>();
  return courses.filter((c) => !seen.has(c.program_id) && (seen.add(c.program_id), true));
}

/** Runs `fn` over `items` with at most `limit` running at once. Results keep the input order; the first error rejects. */
export async function mapLimit<T, R>(items: T[], limit: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const out = new Array<R>(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}

/** Compares program_id → fingerprint maps. Lists are sorted by program id. */
export function diffPrograms(
  live: Map<string, string>,
  staged: Map<string, string>,
): { added: string[]; changed: string[]; removed: string[] } {
  const added: string[] = [];
  const changed: string[] = [];
  for (const [id, fp] of staged) {
    if (!live.has(id)) added.push(id);
    else if (live.get(id) !== fp) changed.push(id);
  }
  const removed = [...live.keys()].filter((id) => !staged.has(id));
  return { added: added.sort(), changed: changed.sort(), removed: removed.sort() };
}
