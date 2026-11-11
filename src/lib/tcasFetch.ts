import "server-only";
import { readSheet } from "read-excel-file/node";
import { logError } from "@/lib/logs";
import { TCAS_LAST_YEAR_MINMAX_URL } from "@/lib/tcas";
import {
  groupLastYear,
  parseMinMaxRows,
  roundsFromResponse,
  type LastYearRow,
  type RawCourse,
  type RawRound,
} from "@/lib/tcasSource";

// The public files course.mytcas.com loads (official TCAS database, ทปอ.).
const BASE = "https://my-tcas.s3.ap-southeast-1.amazonaws.com/mytcas/";
const HEADERS = { "User-Agent": "PTN-Connext/1.0 (school planning tool)" };
// Without a cache-buster the bucket can answer with an XML error.
const url = (path: string) => `${BASE}${path}?ts=${Date.now()}`;

/** Every program of one university. Throws on any network or format problem, so the pull stops. */
export async function fetchCourses(universityId: string): Promise<RawCourse[]> {
  const res = await fetch(url("courses.json"), { headers: HEADERS, cache: "no-store", signal: AbortSignal.timeout(30000) });
  if (!res.ok) throw new Error(`courses.json: HTTP ${res.status}`);
  const data: unknown = await res.json();
  if (!Array.isArray(data)) throw new Error("courses.json: not a list");
  return (data as RawCourse[]).filter((c) => c && c.university_id === universityId && typeof c.program_id === "string");
}

/**
 * Last year's official Round 3 min/max sheet (an .xlsx on mytcas.com/stat), grouped by program id.
 * Returns null on any problem: the pull then continues without last-year scores.
 */
export async function fetchLastYearMinMax(): Promise<Map<string, LastYearRow[]> | null> {
  try {
    const res = await fetch(TCAS_LAST_YEAR_MINMAX_URL, { headers: HEADERS, cache: "no-store", signal: AbortSignal.timeout(30000) });
    if (!res.ok) throw new Error(`min/max sheet: HTTP ${res.status}`);
    const rows = await readSheet(Buffer.from(await res.arrayBuffer()));
    const parsed = parseMinMaxRows(rows as unknown[][]);
    if (parsed.length === 0) throw new Error("min/max sheet: no rows recognised");
    return groupLastYear(parsed);
  } catch (e) {
    await logError("tcas/last-year", e);
    return null;
  }
}

/** One program's rounds. 403/404 means "no rounds"; throttling, server errors and network errors throw. */
export async function fetchRounds(programId: string): Promise<RawRound[]> {
  const res = await fetch(url(`rounds/${encodeURIComponent(programId)}.json`), {
    headers: HEADERS,
    cache: "no-store",
    signal: AbortSignal.timeout(15000),
  });
  return roundsFromResponse(res.status, await res.text());
}
