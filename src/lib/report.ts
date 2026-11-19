// รายงาน & OKR (Developer Console → /admin/report). Pure: the metrics, the OKRs and how progress is
// scored, date ranges, the impact assumptions and the page's Thai/English words. Tested in report.test.ts.
// The numbers come from reportData.ts (server) via computeStats() in reportAnalysis.ts.

import { addDays, dayKey, type DayKey } from "./calendar";
import { FEATURES } from "./features";

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
  signupsPerWeek: number;
  roomsFull: number;
  activeUsers: number;
  activeStudents: number;
  activeStudentsPct: number | null;
  activeTeachers: number;
  activeTeachersPct: number | null;
  weeklyActivePct: number | null;
  logins: number;
  loginSuccessPct: number | null;
  failedLoginPct: number | null;
  lockouts: number;
  posts: number;
  postsPerWeek: number;
  teachersPosting: number;
  teachersPostingPct: number | null;
  materials: number;
  files: number;
  driveFiles: number;
  postsWithFilePct: number | null;
  subjectsCovered: number;
  roomsPerPost: number | null;
  leadTimeDays: number | null;
  notice3Pct: number | null;
  clashDays: number;
  heaviestWeekItems: number;
  studentsWithTarget: number;
  studentsWithTargetPct: number | null;
  studentsWithRoadmap: number;
  studentsWithRoadmapPct: number | null;
  avgRoadmapStage: number | null;
  roadmapStage3Pct: number | null;
  errors: number;
  errorsPerWeek: number;
  feedback: number;
  bugReports: number;
  praisePct: number | null;
  driveTeachers: number;
  driveTeachersPct: number | null;
  storageUsePct: number | null;
  hoursSaved: number;
  pagesSaved: number;
  bahtSaved: number;
  // From the activity log (migration 0020); null until it has data.
  usageWeeklyPct: number | null;
  seenPct: number | null;
  seen24hPct: number | null;
  fileOpensPerStudent: number | null;
  returningPct: number | null;
  featuresPerPerson: number | null;
  /** Weekly users % of each feature (features.ts), against its audience. */
  featureWeekly: Record<string, number | null>;
  /** The first day the activity log has data, or null. */
  trackingSince: string | null;
};

export type Unit = "pct" | "count" | "perWeek" | "days" | "stage" | "hours" | "baht";

/** The groups the goal picker shows. */
export type MetricCategory = "adoption" | "reach" | "teaching" | "workload" | "tcas" | "features" | "reliability" | "voice" | "impact";
export const CATEGORIES: { key: MetricCategory; th: string; en: string }[] = [
  { key: "adoption", th: "การใช้งาน", en: "Adoption" },
  { key: "reach", th: "นักเรียนเห็นงาน", en: "Students see the work" },
  { key: "teaching", th: "การสอน", en: "Teaching" },
  { key: "workload", th: "ภาระนักเรียน", en: "Student workload" },
  { key: "tcas", th: "TCAS & Roadmap", en: "TCAS & Roadmap" },
  { key: "features", th: "ฟีเจอร์", en: "Features" },
  { key: "reliability", th: "ความน่าเชื่อถือ & ปลอดภัย", en: "Reliability & security" },
  { key: "voice", th: "เสียงผู้ใช้", en: "User voice" },
  { key: "impact", th: "ผลกระทบ (ประมาณการ)", en: "Impact (estimates)" },
];

/**
 * How a goal is drawn week by week: flow = counted inside each week; stock = a running total up to each week's
 * end (sign-ups); snapshot = only "now" is known (TCAS targets, Roadmaps, storage).
 */
export type MetricKind = "flow" | "stock" | "snapshot";

export type Metric = {
  key: string;
  th: string;
  en: string;
  /** One line for the goal picker: what is measured and how. */
  desc: string;
  cat: MetricCategory;
  unit: Unit;
  kind: MetricKind;
  /** A sensible starting target. */
  suggest: number;
  /** Lower is better (errors). */
  lower?: boolean;
  /** Needs the activity log (migration 0020). */
  fresh?: boolean;
  value: (s: ReportStats) => number | null;
};

const pct = (part: number, whole: number) => (whole > 0 ? (part / whole) * 100 : null);

const M = (
  key: string,
  cat: MetricCategory,
  th: string,
  en: string,
  desc: string,
  unit: Unit,
  kind: MetricKind,
  suggest: number,
  value: Metric["value"],
  opts: { lower?: boolean; fresh?: boolean } = {},
): Metric => ({ key, cat, th, en, desc, unit, kind, suggest, value, ...opts });

const AUDIENCE = { student: "นักเรียนที่มีบัญชี", staff: "บัญชีครูและผู้ดูแล", all: "บัญชีทั้งหมด" } as const;

/** Every number a key result can point at. Add one here (and its count in computeStats/reportData.ts if new). */
export const METRICS: Metric[] = [
  // การใช้งาน
  M("students_signed_up_pct", "adoption", "นักเรียนลงทะเบียนแล้ว", "Students signed up", "นักเรียนที่ลงทะเบียนแล้ว จากรายชื่อทั้งหมด", "pct", "stock", 90, (s) =>
    pct(s.studentsRegistered, s.studentsTotal),
  ),
  M("teachers_signed_up_pct", "adoption", "ครูลงทะเบียนแล้ว", "Teachers signed up", "ครูที่ลงทะเบียนแล้ว จากรายชื่อทั้งหมด", "pct", "stock", 90, (s) =>
    pct(s.teachersRegistered, s.teachersTotal),
  ),
  M(
    "weekly_active_pct",
    "adoption",
    "ผู้ใช้งานต่อสัปดาห์ (จากบัญชีทั้งหมด)",
    "Weekly active users (of all accounts)",
    "เฉลี่ยต่อสัปดาห์ คนที่เข้าสู่ระบบ ÷ บัญชีทั้งหมด",
    "pct",
    "flow",
    60,
    (s) => s.weeklyActivePct,
  ),
  M(
    "active_users",
    "adoption",
    "ผู้ใช้งานในช่วงนี้",
    "Active users in the period",
    "จำนวนคนที่เข้าสู่ระบบอย่างน้อย 1 ครั้งในช่วงที่เลือก",
    "count",
    "flow",
    300,
    (s) => s.activeUsers,
  ),
  M(
    "active_students_pct",
    "adoption",
    "นักเรียนที่เข้าใช้ในช่วงนี้",
    "Students active in the period",
    "นักเรียนที่เข้าสู่ระบบในช่วงนี้ ÷ นักเรียนที่มีบัญชี",
    "pct",
    "flow",
    80,
    (s) => s.activeStudentsPct,
  ),
  M(
    "active_teachers_pct",
    "adoption",
    "ครูที่เข้าใช้ในช่วงนี้",
    "Teachers active in the period",
    "ครูและผู้ดูแลที่เข้าสู่ระบบในช่วงนี้ ÷ บัญชีครูทั้งหมด",
    "pct",
    "flow",
    90,
    (s) => s.activeTeachersPct,
  ),
  M("returning_pct", "adoption", "ผู้ใช้ที่กลับมาใช้ซ้ำ", "Returning users", "คนที่ใช้งาน 2 สัปดาห์ขึ้นไป ÷ คนที่ใช้งานทั้งหมดในช่วงนี้", "pct", "flow", 70, (s) => s.returningPct, {
    fresh: true,
  }),
  M("signups_per_week", "adoption", "ลงทะเบียนใหม่ต่อสัปดาห์", "Sign-ups per week", "บัญชีที่ลงทะเบียนใหม่ เฉลี่ยต่อสัปดาห์", "perWeek", "flow", 50, (s) => s.signupsPerWeek),
  M("rooms_full", "adoption", "ห้องที่ลงทะเบียนครบ", "Rooms fully signed up", "จำนวนห้องที่นักเรียนลงทะเบียนครบทุกคน", "count", "snapshot", 8, (s) => s.roomsFull),
  // นักเรียนเห็นงาน
  M("seen_pct", "reach", "นักเรียนเปิดดูโพสต์", "Students who opened posts", "ทุกโพสต์ในช่วงนี้: นักเรียนที่เปิดดู ÷ นักเรียนที่ได้รับ", "pct", "flow", 80, (s) => s.seenPct, {
    fresh: true,
  }),
  M(
    "seen_24h_pct",
    "reach",
    "เปิดดูภายใน 24 ชั่วโมง",
    "Opened within 24 hours",
    "นักเรียนที่เปิดดูภายใน 1 วันหลังครูโพสต์ ÷ นักเรียนที่ได้รับ",
    "pct",
    "flow",
    60,
    (s) => s.seen24hPct,
    { fresh: true },
  ),
  M(
    "file_opens_per_student",
    "reach",
    "ไฟล์ที่เปิดต่อนักเรียน",
    "Files opened per student",
    "โพสต์ที่นักเรียนเปิดไฟล์ ÷ นักเรียนที่มีบัญชี",
    "count",
    "flow",
    5,
    (s) => s.fileOpensPerStudent,
    { fresh: true },
  ),
  M(
    "calendar_weekly_pct",
    "reach",
    "นักเรียนเปิดปฏิทินทุกสัปดาห์",
    "Students opening the calendar weekly",
    "เฉลี่ยต่อสัปดาห์ นักเรียนที่เปิดปฏิทิน ÷ นักเรียนที่มีบัญชี",
    "pct",
    "flow",
    70,
    (s) => s.featureWeekly.calendar ?? null,
    { fresh: true },
  ),
  // การสอน
  M(
    "teachers_posting_pct",
    "teaching",
    "ครูที่โพสต์ในช่วงนี้",
    "Teachers who posted",
    "ครูที่โพสต์อย่างน้อย 1 ครั้ง ÷ บัญชีครูทั้งหมด",
    "pct",
    "flow",
    80,
    (s) => s.teachersPostingPct,
  ),
  M("posts_per_week", "teaching", "โพสต์ต่อสัปดาห์", "Posts per week", "งาน สอบ เอกสาร และกิจกรรมที่โพสต์ เฉลี่ยต่อสัปดาห์", "perWeek", "flow", 20, (s) => s.postsPerWeek),
  M(
    "lead_time_days",
    "teaching",
    "แจ้งงานและสอบล่วงหน้าเฉลี่ย",
    "Average notice before deadlines/exams",
    "จากวันที่โพสต์ถึงวันส่งงานหรือวันสอบ เฉลี่ย",
    "days",
    "flow",
    3,
    (s) => s.leadTimeDays,
  ),
  M(
    "notice_3days_pct",
    "teaching",
    "แจ้งล่วงหน้า 3 วันขึ้นไป",
    "Notice of 3+ days",
    "งานและสอบที่แจ้งล่วงหน้าอย่างน้อย 3 วัน ÷ ทั้งหมด",
    "pct",
    "flow",
    80,
    (s) => s.notice3Pct,
  ),
  M("materials_shared", "teaching", "เอกสารและสื่อที่แชร์", "Materials shared", "จำนวนโพสต์ประเภทเอกสารในช่วงนี้", "count", "flow", 30, (s) => s.materials),
  M(
    "posts_with_file_pct",
    "teaching",
    "โพสต์ที่แนบไฟล์",
    "Posts with a file",
    "โพสต์ที่มี PDF หรือไฟล์ใน Drive ÷ โพสต์ทั้งหมด",
    "pct",
    "flow",
    50,
    (s) => s.postsWithFilePct,
  ),
  M("subjects_covered", "teaching", "วิชาที่ใช้ Connext", "Subjects using Connext", "จำนวนวิชา (จาก 6) ที่มีโพสต์ในช่วงนี้", "count", "flow", 6, (s) => s.subjectsCovered),
  M("rooms_per_post", "teaching", "ห้องต่อโพสต์", "Rooms per post", "โพสต์หนึ่งครั้งถึงกี่ห้องโดยเฉลี่ย (ครูไม่ต้องบอกซ้ำทีละห้อง)", "count", "flow", 2, (s) => s.roomsPerPost),
  M(
    "drive_teachers_pct",
    "teaching",
    "ครูที่เชื่อมต่อ Google Drive",
    "Teachers on Google Drive",
    "ครูที่เชื่อม Drive ของตัวเอง ÷ บัญชีครูทั้งหมด",
    "pct",
    "snapshot",
    50,
    (s) => s.driveTeachersPct,
  ),
  // ภาระนักเรียน
  M(
    "clash_days",
    "workload",
    "วันที่สอบชนกัน",
    "Exam-clash days",
    "วันที่ห้องเดียวมีสอบ 3 วิชาขึ้นไป หรือสอบกลางภาค/ปลายภาค 2 วิชาขึ้นไป",
    "count",
    "flow",
    0,
    (s) => s.clashDays,
    { lower: true },
  ),
  M(
    "heaviest_week_items",
    "workload",
    "งานและสอบในสัปดาห์ที่หนักที่สุด",
    "Items in the heaviest week",
    "งานและสอบของห้องที่หนักที่สุดในสัปดาห์เดียว",
    "count",
    "flow",
    8,
    (s) => s.heaviestWeekItems,
    { lower: true },
  ),
  // TCAS & Roadmap
  M(
    "students_with_target_pct",
    "tcas",
    "นักเรียนที่ตั้งเป้าหมาย TCAS",
    "Students with a TCAS target",
    "นักเรียนที่บันทึกหลักสูตรเป้าหมาย ÷ นักเรียนที่มีบัญชี",
    "pct",
    "snapshot",
    60,
    (s) => s.studentsWithTargetPct,
  ),
  M(
    "students_with_roadmap_pct",
    "tcas",
    "นักเรียนที่มี Roadmap",
    "Students with a Roadmap",
    "นักเรียนที่สร้าง Roadmap ÷ นักเรียนที่มีบัญชี",
    "pct",
    "snapshot",
    50,
    (s) => s.studentsWithRoadmapPct,
  ),
  M(
    "avg_roadmap_stage",
    "tcas",
    "ด่าน Roadmap เฉลี่ย",
    "Average Roadmap stage",
    "ด่านเฉลี่ยของนักเรียนที่มี Roadmap (1–6)",
    "stage",
    "snapshot",
    2,
    (s) => s.avgRoadmapStage,
  ),
  M(
    "roadmap_stage3_pct",
    "tcas",
    "นักเรียนถึงด่าน 3 ขึ้นไป",
    "Students at Roadmap stage 3+",
    "นักเรียนที่ Roadmap ถึงด่าน “ปูพื้น” ขึ้นไป ÷ นักเรียนที่มีบัญชี",
    "pct",
    "snapshot",
    30,
    (s) => s.roadmapStage3Pct,
  ),
  M(
    "tcas_weekly_pct",
    "tcas",
    "นักเรียนใช้ TCAS ทุกสัปดาห์",
    "Students using TCAS weekly",
    "เฉลี่ยต่อสัปดาห์ นักเรียนที่เปิดค้นหาหลักสูตร ÷ นักเรียนที่มีบัญชี",
    "pct",
    "flow",
    40,
    (s) => s.featureWeekly.tcas ?? null,
    { fresh: true },
  ),
  M(
    "roadmap_weekly_pct",
    "tcas",
    "นักเรียนเปิด Roadmap ทุกสัปดาห์",
    "Students opening Roadmap weekly",
    "เฉลี่ยต่อสัปดาห์ นักเรียนที่เปิด Roadmap ÷ นักเรียนที่มีบัญชี",
    "pct",
    "flow",
    30,
    (s) => s.featureWeekly.roadmap ?? null,
    { fresh: true },
  ),
  // ฟีเจอร์ (one goal per feature is added at the end)
  M(
    "usage_weekly_pct",
    "features",
    "ใช้ Connext ทุกสัปดาห์ (ทุกส่วน)",
    "Weekly users of any part",
    "เฉลี่ยต่อสัปดาห์ คนที่เปิดส่วนใดก็ได้ของระบบ ÷ บัญชีทั้งหมด",
    "pct",
    "flow",
    60,
    (s) => s.usageWeeklyPct,
    { fresh: true },
  ),
  M(
    "features_per_person",
    "features",
    "ฟีเจอร์ที่ใช้ต่อคน",
    "Features used per person",
    "เฉลี่ยแต่ละคนใช้กี่ส่วนของระบบในช่วงนี้",
    "count",
    "flow",
    3,
    (s) => s.featuresPerPerson,
    { fresh: true },
  ),
  // ความน่าเชื่อถือ & ปลอดภัย
  M("login_success_pct", "reliability", "เข้าสู่ระบบสำเร็จ", "Log-in success rate", "การเข้าสู่ระบบที่สำเร็จ ÷ ทุกครั้งที่ลอง", "pct", "flow", 95, (s) => s.loginSuccessPct),
  M("failed_login_pct", "reliability", "เข้าสู่ระบบไม่สำเร็จ", "Failed log-ins", "การเข้าสู่ระบบที่ไม่สำเร็จ ÷ ทุกครั้งที่ลอง", "pct", "flow", 5, (s) => s.failedLoginPct, {
    lower: true,
  }),
  M("lockouts", "reliability", "บัญชีถูกล็อกชั่วคราว", "Temporary lock-outs", "ครั้งที่ระบบล็อกเพราะใส่รหัสผิดหลายครั้ง", "count", "flow", 0, (s) => s.lockouts, {
    lower: true,
  }),
  M(
    "errors_per_week",
    "reliability",
    "ข้อผิดพลาดต่อสัปดาห์",
    "Errors per week",
    "ข้อผิดพลาดของระบบที่บันทึกไว้ เฉลี่ยต่อสัปดาห์",
    "perWeek",
    "flow",
    5,
    (s) => s.errorsPerWeek,
    { lower: true },
  ),
  M("storage_use_pct", "reliability", "พื้นที่เก็บไฟล์ที่ใช้", "Storage used", "ไฟล์ PDF ที่เก็บใน Connext ÷ พื้นที่ฟรี 1 GB", "pct", "snapshot", 70, (s) => s.storageUsePct, {
    lower: true,
  }),
  // เสียงผู้ใช้
  M("feedback_count", "voice", "ความคิดเห็นจากผู้ใช้", "Feedback messages", "ข้อความที่ส่งผ่านกล่องความคิดเห็นในช่วงนี้", "count", "flow", 20, (s) => s.feedback),
  M("bug_reports", "voice", "แจ้งปัญหา/บั๊ก", "Bug reports", "ความคิดเห็นที่จัดเป็น “ปัญหา/บั๊ก” (แก้หมวดได้ในหน้าไอเดีย)", "count", "flow", 3, (s) => s.bugReports, {
    lower: true,
  }),
  M("praise_pct", "voice", "คำชมจากผู้ใช้", "Praise share", "ความคิดเห็นที่เป็นคำชม ÷ ความคิดเห็นทั้งหมด", "pct", "flow", 30, (s) => s.praisePct),
  // ผลกระทบ
  M(
    "hours_saved",
    "impact",
    "เวลาครูที่ประหยัดได้",
    "Teacher hours saved",
    "ห้องที่โพสต์ถึง × นาทีที่ครูต้องบอกเองต่อห้อง (แก้สมมติฐานได้)",
    "hours",
    "flow",
    20,
    (s) => s.hoursSaved,
  ),
  M("pages_saved", "impact", "กระดาษที่ไม่ต้องพิมพ์", "Pages not printed", "นักเรียนที่ได้รับไฟล์ × หน้าต่อไฟล์ (แก้สมมติฐานได้)", "count", "flow", 2000, (s) => s.pagesSaved),
  M("baht_saved", "impact", "ค่ากระดาษที่ประหยัดได้", "Printing cost saved", "หน้าที่ไม่ต้องพิมพ์ × บาทต่อหน้า (แก้สมมติฐานได้)", "baht", "flow", 1000, (s) => s.bahtSaved),
  // Every feature's weekly users (features.ts).
  ...FEATURES.map((f) =>
    M(
      `feature_${f.key}_pct`,
      "features",
      `ใช้ “${f.th}” ทุกสัปดาห์`,
      `Weekly users of “${f.en}”`,
      `เฉลี่ยต่อสัปดาห์ คนที่เปิด${f.th} ÷ ${AUDIENCE[f.audience]}`,
      "pct",
      "flow",
      f.audience === "staff" ? 70 : 40,
      (s) => s.featureWeekly[f.key] ?? null,
      { fresh: true },
    ),
  ),
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
    case "hours":
      return lang === "th" ? `${one(v)} ชม.` : `${one(v)} h`;
    case "baht":
      return lang === "th" ? `${Math.round(v).toLocaleString("th-TH")} บาท` : `฿${Math.round(v).toLocaleString("en-US")}`;
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

/** Ready-made objectives the editor adds with one tap (targets are each goal's suggestion). */
export const OKR_TEMPLATES: Okr[] = [
  {
    objective: "นักเรียนเห็นงานทุกชิ้นทันเวลา",
    objectiveEn: "Students see every piece of work in time",
    keyResults: [kr("seen_pct", 80), kr("seen_24h_pct", 60), kr("notice_3days_pct", 80)],
  },
  {
    objective: "ฟีเจอร์ใหม่ถูกใช้จริง",
    objectiveEn: "New features are really used",
    keyResults: [kr("feature_calendar_pct", 60), kr("tcas_weekly_pct", 40), kr("roadmap_weekly_pct", 30), kr("features_per_person", 3)],
  },
  {
    objective: "ลดภาระสอบชนกัน",
    objectiveEn: "Fewer exam clashes",
    keyResults: [kr("clash_days", 0), kr("heaviest_week_items", 8), kr("lead_time_days", 5)],
  },
  {
    objective: "ครูทุกวิชาใช้ Connext",
    objectiveEn: "Every subject's teachers use Connext",
    keyResults: [kr("teachers_signed_up_pct", 100), kr("teachers_posting_pct", 80), kr("subjects_covered", 6), kr("posts_with_file_pct", 50)],
  },
  {
    objective: "ผู้ใช้กลับมาใช้ทุกสัปดาห์",
    objectiveEn: "People come back every week",
    keyResults: [kr("usage_weekly_pct", 60), kr("returning_pct", 70), kr("active_students_pct", 80)],
  },
  {
    objective: "ประหยัดเวลาและกระดาษให้โรงเรียน",
    objectiveEn: "Save the school time and paper",
    keyResults: [kr("hours_saved", 20), kr("pages_saved", 2000), kr("baht_saved", 1000)],
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
