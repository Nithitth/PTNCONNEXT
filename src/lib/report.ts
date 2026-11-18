// รายงาน & OKR (Developer Console → /admin/report). Pure: the metrics, the OKRs and how progress is
// scored, date ranges, the impact assumptions and the page's Thai/English words. Tested in report.test.ts.
// The numbers come from reportData.ts (server) via computeStats() in reportAnalysis.ts.

import { addDays, dayKey, type DayKey } from "./calendar";

export type Lang = "th" | "en";

// ─── Date ranges ─────────────────────────────────────────────

/** Both ends included, Thai days. */
export type Range = { from: DayKey; to: DayKey; preset: Preset };
export type Preset = "week" | "month" | "term" | "all" | "custom";
export const PRESETS: Preset[] = ["week", "month", "term", "all"];

/** The day the school started using Connext (the "ตั้งแต่เปิดใช้" preset starts here). */
export const LAUNCH_DAY: DayKey = "2026-11-10";

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const isDay = (s: unknown): s is DayKey => typeof s === "string" && DAY_RE.test(s) && !Number.isNaN(Date.parse(`${s}T00:00:00Z`));

/** Days in a range (at least 1). */
export const rangeDays = (r: { from: DayKey; to: DayKey }) =>
  Math.max(1, Math.round((Date.parse(`${r.to}T00:00:00Z`) - Date.parse(`${r.from}T00:00:00Z`)) / 86_400_000) + 1);

/** Weeks in a range, for "per week" numbers (a 3-day range counts as 3/7 of a week). */
export const rangeWeeks = (r: { from: DayKey; to: DayKey }) => rangeDays(r) / 7;

/** Term 1 runs May–October, term 2 November–April (Thai school year). */
export function termStart(today: DayKey): DayKey {
  const y = Number(today.slice(0, 4));
  const m = Number(today.slice(5, 7));
  if (m >= 5 && m <= 10) return `${y}-05-01`;
  if (m >= 11) return `${y}-11-01`;
  return `${y - 1}-11-01`;
}

/** The range from the page's URL (`?preset=` or `?from=&to=`); the current term by default. Never in the future. */
export function resolveRange(params: { preset?: string; from?: string; to?: string }, now: Date = new Date()): Range {
  const today = dayKey(now);
  if (isDay(params.from) && isDay(params.to)) {
    let [from, to] = params.from <= params.to ? [params.from, params.to] : [params.to, params.from];
    if (to > today) to = today;
    if (from > to) from = to;
    if (rangeDays({ from, to }) > 800) from = addDays(to, -799);
    return { from, to, preset: "custom" };
  }
  const preset = (PRESETS as string[]).includes(params.preset ?? "") ? (params.preset as Preset) : "term";
  if (preset === "week") {
    const dow = new Date(`${today}T00:00:00Z`).getUTCDay();
    return { from: addDays(today, dow === 0 ? -6 : 1 - dow), to: today, preset };
  }
  if (preset === "month") return { from: `${today.slice(0, 7)}-01`, to: today, preset };
  if (preset === "all") return { from: LAUNCH_DAY < today ? LAUNCH_DAY : today, to: today, preset };
  return { from: termStart(today), to: today, preset: "term" };
}

/** The same number of days just before `r`, for ▲/▼ comparisons. */
export function previousRange(r: { from: DayKey; to: DayKey }): { from: DayKey; to: DayKey } {
  const n = rangeDays(r);
  return { from: addDays(r.from, -n), to: addDays(r.from, -1) };
}

/** ISO bounds for database queries: start of `from` and end of `to`, Thai time. */
export const rangeIso = (r: { from: DayKey; to: DayKey }) => ({
  start: `${r.from}T00:00:00+07:00`,
  end: `${r.to}T23:59:59.999+07:00`,
});

const MONTHS = {
  th: ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."],
  en: ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"],
};

/** "18 พ.ย. 2569" in Thai (Buddhist Era), "18 Nov 2026" in English. */
export function formatDay(day: DayKey, lang: Lang, withYear = true): string {
  const [y, m, d] = day.split("-").map(Number);
  const year = lang === "th" ? y + 543 : y;
  return `${d} ${MONTHS[lang][m - 1]}${withYear ? ` ${year}` : ""}`;
}

/** Room names are Thai ("ม.5/1"); in English they read "M.5/1". */
export const roomText = (label: string, lang: Lang) => (lang === "en" ? label.replace(/^ม./, "M.") : label);

export const formatRange = (r: { from: DayKey; to: DayKey }, lang: Lang) =>
  r.from === r.to ? formatDay(r.to, lang) : `${formatDay(r.from, lang, r.from.slice(0, 4) !== r.to.slice(0, 4))} – ${formatDay(r.to, lang)}`;

// ─── Stats and metrics ───────────────────────────────────────

/** The numbers one period produces (computeStats in reportAnalysis.ts). null = no data to measure yet. */
export type ReportStats = {
  studentsTotal: number;
  studentsRegistered: number;
  teachersTotal: number;
  teachersRegistered: number;
  accounts: number;
  studentAccounts: number;
  teacherAccounts: number;
  signups: number;
  activeUsers: number;
  activeStudents: number;
  weeklyActivePct: number | null;
  logins: number;
  loginSuccessPct: number | null;
  posts: number;
  postsPerWeek: number;
  teachersPosting: number;
  teachersPostingPct: number | null;
  materials: number;
  files: number;
  driveFiles: number;
  leadTimeDays: number | null;
  studentsWithTarget: number;
  studentsWithTargetPct: number | null;
  studentsWithRoadmap: number;
  studentsWithRoadmapPct: number | null;
  avgRoadmapStage: number | null;
  errors: number;
  errorsPerWeek: number;
  feedback: number;
  driveTeachers: number;
  driveTeachersPct: number | null;
};

export type Unit = "pct" | "count" | "perWeek" | "days" | "stage";

export type Metric = {
  key: string;
  th: string;
  en: string;
  unit: Unit;
  /** Lower is better (errors). */
  lower?: boolean;
  value: (s: ReportStats) => number | null;
};

const pct = (part: number, whole: number) => (whole > 0 ? (part / whole) * 100 : null);

/** Every number a key result can point at. Add one here (and its count in reportData.ts if new). */
export const METRICS: Metric[] = [
  { key: "students_signed_up_pct", th: "นักเรียนลงทะเบียนแล้ว", en: "Students signed up", unit: "pct", value: (s) => pct(s.studentsRegistered, s.studentsTotal) },
  { key: "teachers_signed_up_pct", th: "ครูลงทะเบียนแล้ว", en: "Teachers signed up", unit: "pct", value: (s) => pct(s.teachersRegistered, s.teachersTotal) },
  { key: "weekly_active_pct", th: "ผู้ใช้งานต่อสัปดาห์ (จากบัญชีทั้งหมด)", en: "Weekly active users (of all accounts)", unit: "pct", value: (s) => s.weeklyActivePct },
  { key: "active_users", th: "ผู้ใช้งานในช่วงนี้", en: "Active users in the period", unit: "count", value: (s) => s.activeUsers },
  { key: "teachers_posting_pct", th: "ครูที่โพสต์ในช่วงนี้", en: "Teachers who posted", unit: "pct", value: (s) => s.teachersPostingPct },
  { key: "posts_per_week", th: "โพสต์ต่อสัปดาห์", en: "Posts per week", unit: "perWeek", value: (s) => s.postsPerWeek },
  { key: "lead_time_days", th: "แจ้งงานและสอบล่วงหน้าเฉลี่ย", en: "Average notice before deadlines/exams", unit: "days", value: (s) => s.leadTimeDays },
  { key: "materials_shared", th: "เอกสารและสื่อที่แชร์", en: "Materials shared", unit: "count", value: (s) => s.materials },
  { key: "students_with_target_pct", th: "นักเรียนที่ตั้งเป้าหมาย TCAS", en: "Students with a TCAS target", unit: "pct", value: (s) => s.studentsWithTargetPct },
  { key: "students_with_roadmap_pct", th: "นักเรียนที่มี Roadmap", en: "Students with a Roadmap", unit: "pct", value: (s) => s.studentsWithRoadmapPct },
  { key: "avg_roadmap_stage", th: "ด่าน Roadmap เฉลี่ย", en: "Average Roadmap stage", unit: "stage", value: (s) => s.avgRoadmapStage },
  { key: "login_success_pct", th: "เข้าสู่ระบบสำเร็จ", en: "Log-in success rate", unit: "pct", value: (s) => s.loginSuccessPct },
  { key: "errors_per_week", th: "ข้อผิดพลาดต่อสัปดาห์", en: "Errors per week", unit: "perWeek", lower: true, value: (s) => s.errorsPerWeek },
  { key: "feedback_count", th: "ความคิดเห็นจากผู้ใช้", en: "Feedback messages", unit: "count", value: (s) => s.feedback },
  { key: "drive_teachers_pct", th: "ครูที่เชื่อมต่อ Google Drive", en: "Teachers on Google Drive", unit: "pct", value: (s) => s.driveTeachersPct },
];
export const metricOf = (key: string) => METRICS.find((m) => m.key === key);

/** A metric's value as text: "72%", "1,240", "12.5 / สัปดาห์", "5.2 วัน", "ด่าน 2.4". */
export function formatValue(v: number | null, unit: Unit, lang: Lang): string {
  if (v === null || !Number.isFinite(v)) return "—";
  const one = (n: number) => n.toLocaleString(lang === "th" ? "th-TH" : "en-US", { maximumFractionDigits: 1 });
  switch (unit) {
    case "pct":
      return `${Math.round(v)}%`;
    case "count":
      return Math.round(v).toLocaleString(lang === "th" ? "th-TH" : "en-US");
    case "perWeek":
      return lang === "th" ? `${one(v)} / สัปดาห์` : `${one(v)} / week`;
    case "days":
      return lang === "th" ? `${one(v)} วัน` : `${one(v)} days`;
    case "stage":
      return lang === "th" ? `ด่าน ${one(v)}` : `stage ${one(v)}`;
  }
}

// ─── OKRs ────────────────────────────────────────────────────

export type KeyResult = { metric: string; label: string; labelEn: string; target: number };
export type Okr = { objective: string; objectiveEn: string; keyResults: KeyResult[] };

const kr = (metric: string, target: number): KeyResult => {
  const m = metricOf(metric)!;
  return { metric, label: m.th, labelEn: m.en, target };
};

/** Drafted with the team (2026-11-19); admins edit them in รายงาน → แก้ไข OKR (saved in app_settings.report_okrs). */
export const DEFAULT_OKRS: Okr[] = [
  {
    objective: "ทุกคนในโรงเรียนใช้ Connext ได้จริง",
    objectiveEn: "Everyone at school actually uses Connext",
    keyResults: [kr("students_signed_up_pct", 90), kr("teachers_signed_up_pct", 90), kr("weekly_active_pct", 60)],
  },
  {
    objective: "ครูโพสต์ครั้งเดียว นักเรียนเห็นครบ",
    objectiveEn: "Teachers post once, every student sees it",
    keyResults: [kr("teachers_posting_pct", 80), kr("posts_per_week", 20), kr("lead_time_days", 3)],
  },
  {
    objective: "นักเรียนวางแผนเข้ามหาวิทยาลัยเร็วขึ้น",
    objectiveEn: "Students plan for university earlier",
    keyResults: [kr("students_with_target_pct", 60), kr("students_with_roadmap_pct", 50), kr("avg_roadmap_stage", 2)],
  },
  {
    objective: "ระบบเชื่อถือได้และปลอดภัย",
    objectiveEn: "Reliable and secure",
    keyResults: [kr("login_success_pct", 95), kr("errors_per_week", 5)],
  },
];

const text = (v: unknown, max: number) => (typeof v === "string" ? v.trim().replace(/\s+/g, " ").slice(0, max) : "");

/** Checks OKRs before saving: 1–6 objectives, 1–5 key results each, known metrics, targets 0–100,000. */
export function cleanOkrs(raw: unknown): { okrs: Okr[] } | { error: string } {
  if (!Array.isArray(raw) || raw.length === 0) return { error: "ต้องมีอย่างน้อย 1 วัตถุประสงค์" };
  if (raw.length > 6) return { error: "มีวัตถุประสงค์ได้ไม่เกิน 6 ข้อ" };
  const okrs: Okr[] = [];
  for (const o of raw as Record<string, unknown>[]) {
    const objective = text(o?.objective, 120);
    if (!objective) return { error: "กรอกชื่อวัตถุประสงค์ให้ครบทุกข้อ" };
    const krs = Array.isArray(o.keyResults) ? (o.keyResults as Record<string, unknown>[]) : [];
    if (krs.length === 0 || krs.length > 5) return { error: `“${objective}” ต้องมีผลลัพธ์หลัก 1–5 ข้อ` };
    const keyResults: KeyResult[] = [];
    for (const k of krs) {
      const m = metricOf(String(k?.metric ?? ""));
      if (!m) return { error: "มีผลลัพธ์หลักที่ไม่ได้เลือกตัวชี้วัด" };
      const target = Number(k.target);
      if (!Number.isFinite(target) || target < 0 || target > 100_000) return { error: `เป้าหมายของ “${m.th}” ต้องเป็นตัวเลข 0–100,000` };
      keyResults.push({ metric: m.key, label: text(k.label, 120) || m.th, labelEn: text(k.labelEn, 120) || m.en, target });
    }
    okrs.push({ objective, objectiveEn: text(o.objectiveEn, 120), keyResults });
  }
  return { okrs };
}

/** 0–1. Higher-is-better: actual ÷ target (capped). Lower-is-better: 1 while at or under target. null when unmeasurable. */
export function krProgress(actual: number | null, target: number, lower = false): number | null {
  if (actual === null || !Number.isFinite(actual)) return null;
  if (lower) {
    if (actual <= target) return 1;
    return target <= 0 ? 0 : Math.max(0, Math.min(1, target / actual));
  }
  if (target <= 0) return 1;
  return Math.max(0, Math.min(1, actual / target));
}

export type Status = "on" | "close" | "behind" | "none";
export const statusOf = (p: number | null): Status => (p === null ? "none" : p >= 1 ? "on" : p >= 0.7 ? "close" : "behind");

export type ScoredKr = KeyResult & { actual: number | null; previous: number | null; progress: number | null; status: Status; unit: Unit; lower: boolean };
export type ScoredOkr = Omit<Okr, "keyResults"> & { keyResults: ScoredKr[]; progress: number | null };

/** Every key result with its live value, progress and status (and last period's value for ▲/▼). */
export function scoreOkrs(okrs: Okr[], stats: ReportStats, prev: ReportStats | null): ScoredOkr[] {
  return okrs.map((o) => {
    const keyResults = o.keyResults.map((k): ScoredKr => {
      const m = metricOf(k.metric);
      const actual = m ? m.value(stats) : null;
      const progress = m ? krProgress(actual, k.target, m.lower) : null;
      return {
        ...k,
        actual,
        previous: m && prev ? m.value(prev) : null,
        progress,
        status: statusOf(progress),
        unit: m?.unit ?? "count",
        lower: Boolean(m?.lower),
      };
    });
    const measured = keyResults.map((k) => k.progress).filter((p): p is number => p !== null);
    return { ...o, keyResults, progress: measured.length ? measured.reduce((a, b) => a + b, 0) / measured.length : null };
  });
}

/** 0–100: the average of the objectives' progress. null when nothing can be measured yet. */
export function connextScore(scored: ScoredOkr[]): number | null {
  const p = scored.map((o) => o.progress).filter((v): v is number => v !== null);
  return p.length ? Math.round((p.reduce((a, b) => a + b, 0) / p.length) * 100) : null;
}

/** ▲/▼ as a % change (null when there's nothing to compare with). */
export function change(now: number | null, before: number | null): number | null {
  if (now === null || before === null || !Number.isFinite(now) || !Number.isFinite(before)) return null;
  if (before === 0) return now === 0 ? 0 : null;
  return ((now - before) / Math.abs(before)) * 100;
}

// ─── Impact assumptions (editable, shown under every estimate) ─

export type Assumptions = {
  /** Minutes a teacher spends telling one room about one piece of work without Connext (LINE group, board, announcement). */
  minutesPerRoom: number;
  /** Pages in a typical shared document. */
  pagesPerFile: number;
  /** Baht per printed page (paper + ink). */
  bahtPerPage: number;
  /** Students in a typical room, for the "your school" calculator. */
  classSize: number;
  /** School weeks in a year, for the calculator. */
  schoolWeeks: number;
};

export const DEFAULT_ASSUMPTIONS: Assumptions = { minutesPerRoom: 5, pagesPerFile: 3, bahtPerPage: 0.5, classSize: 40, schoolWeeks: 36 };

const LIMITS: Record<keyof Assumptions, [number, number]> = {
  minutesPerRoom: [0, 60],
  pagesPerFile: [0, 200],
  bahtPerPage: [0, 20],
  classSize: [1, 80],
  schoolWeeks: [1, 52],
};

export function cleanAssumptions(raw: unknown): { assumptions: Assumptions } | { error: string } {
  const r = (raw ?? {}) as Record<string, unknown>;
  const out = { ...DEFAULT_ASSUMPTIONS };
  for (const key of Object.keys(LIMITS) as (keyof Assumptions)[]) {
    const v = Number(r[key]);
    const [min, max] = LIMITS[key];
    if (!Number.isFinite(v) || v < min || v > max) return { error: `ค่าสมมติฐานต้องอยู่ระหว่าง ${min}–${max}` };
    out[key] = v;
  }
  return { assumptions: out };
}

// ─── Words (this page only has English) ───────────────────────

export const T = {
  th: {
    title: "รายงานผลการใช้งาน",
    about:
      "PTN Connext คือเว็บไซต์ที่นักเรียนพัฒนาให้โรงเรียน รวมงาน วันสอบ เอกสารการสอน และข้อมูลการเข้ามหาวิทยาลัยไว้ในที่เดียว ครูโพสต์ครั้งเดียว นักเรียนทุกห้องที่เกี่ยวข้องเห็นทันที และนักเรียนวางแผน TCAS ได้ด้วยตัวเอง",
    generated: "จัดทำเมื่อ",
    period: "ช่วงเวลา",
    presets: { week: "สัปดาห์นี้", month: "เดือนนี้", term: "ภาคเรียนนี้", all: "ตั้งแต่เปิดใช้", custom: "กำหนดเอง" } as Record<Preset, string>,
    score: "Connext Score",
    scoreNote: "คะแนนรวมจากความคืบหน้าของ OKR ทั้งหมด",
    vsPrev: "เทียบกับช่วงก่อนหน้า",
    findings: "ข้อค้นพบสำคัญ",
    okrs: "OKR: วัตถุประสงค์และผลลัพธ์หลัก",
    target: "เป้า",
    status: { on: "ถึงเป้า", close: "ใกล้ถึง", behind: "ยังห่าง", none: "ยังไม่มีข้อมูล" } as Record<Status, string>,
    impact: "ผลกระทบ (ประมาณการ)",
    impactNote: "ตัวเลขประมาณการจากข้อมูลจริงและสมมติฐานด้านล่าง",
    adoption: "การใช้งาน",
    funnel: "เส้นทางผู้ใช้",
    rooms: "อันดับห้องเรียน",
    trends: "แนวโน้มรายสัปดาห์",
    heatmap: "ช่วงเวลาที่เข้าใช้",
    workload: "ภาระงานของนักเรียน",
    teaching: "การสอนและ TCAS",
    voice: "เสียงจากผู้ใช้และสุขภาพระบบ",
    calculator: "โรงเรียนของคุณจะได้อะไร",
    print: "พิมพ์ / บันทึก PDF",
    present: "โหมดนำเสนอ",
    settings: "แก้ไข OKR และสมมติฐาน",
    ideas: "ไอเดียโครงการถัดไป",
  },
  en: {
    title: "Usage Report",
    about:
      "PTN Connext is a school website built by students. It brings assignments, exam dates, teaching materials and university-admission planning into one place: a teacher posts once and every class concerned sees it, and students plan their TCAS journey themselves.",
    generated: "Generated",
    period: "Period",
    presets: { week: "This week", month: "This month", term: "This term", all: "Since launch", custom: "Custom" } as Record<Preset, string>,
    score: "Connext Score",
    scoreNote: "Overall progress across all OKRs",
    vsPrev: "vs previous period",
    findings: "Key findings",
    okrs: "OKRs: objectives and key results",
    target: "Target",
    status: { on: "On track", close: "Close", behind: "Behind", none: "No data yet" } as Record<Status, string>,
    impact: "Impact (estimated)",
    impactNote: "Estimates from real usage and the assumptions below",
    adoption: "Adoption",
    funnel: "User journey",
    rooms: "Classroom ranking",
    trends: "Weekly trends",
    heatmap: "When people use it",
    workload: "Student workload",
    teaching: "Teaching & TCAS",
    voice: "User voice & system health",
    calculator: "What your school would gain",
    print: "Print / Save PDF",
    present: "Presentation mode",
    settings: "Edit OKRs & assumptions",
    ideas: "Next-project ideas",
  },
};
