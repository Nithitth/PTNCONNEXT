// The analysis behind รายงาน & OKR. Pure (no server imports), so the browser calculator and the presentation
// can use it too. reportData.ts loads a ReportRaw per period; everything here turns it into numbers, charts
// and plain-language findings. Tested in reportAnalysis.test.ts.

import { addDays, dayKey, type DayKey } from "./calendar";
import { weekStart } from "./roadmap";
import { change, formatDay, formatValue, rangeWeeks, roomText, type Assumptions, type Lang, type ReportStats, type ScoredOkr } from "./report";

// ─── What the server loads for one period ─────────────────────

export type Role = "student" | "teacher" | "admin";
export type PostType = "assignment" | "exam" | "material" | "event";

export type RawLogin = { at: string; ok: boolean; userId: string | null; role: Role | null; classroomId: string | null };
export type RawPost = {
  id: string;
  type: PostType;
  examKind: "quiz" | "major" | null;
  subject: string | null;
  authorId: string;
  createdAt: string;
  hasFile: boolean;
  /** classroomId null = the whole school. */
  targets: { classroomId: string | null; dueAt: string | null }[];
};
/** A deadline or exam that falls inside the period (whenever it was posted). */
export type RawDue = { type: PostType; examKind: "quiz" | "major" | null; subject: string | null; classroomId: string; dueAt: string; createdAt: string };
export type RawRoom = { classroomId: string; label: string; total: number; registered: number };
export type RawFeedback = { id: string; at: string; message: string; role: Role | null };

export type ReportRaw = {
  range: { from: DayKey; to: DayKey };
  roster: { studentsTotal: number; studentsRegistered: number; teachersTotal: number; teachersRegistered: number };
  rooms: RawRoom[];
  accounts: { students: number; teachers: number; admins: number };
  signups: string[];
  logins: RawLogin[];
  posts: RawPost[];
  dues: RawDue[];
  files: number;
  driveFiles: number;
  driveTeachers: number;
  errors: number;
  feedback: RawFeedback[];
  studentsWithTarget: number;
  studentsWithRoadmap: number;
  /** Students at each Roadmap stage (1–6). */
  roadmapStages: Record<number, number>;
  /** Most-chosen faculties (groups of 3+ students only). */
  topTargets: { label: string; students: number }[];
  storageBytes: number;
};

const DAY = 86_400_000;
const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
const pctOf = (part: number, whole: number) => (whole > 0 ? (part / whole) * 100 : null);

// ─── Weeks ───────────────────────────────────────────────────

/** Every Monday from the week of `from` to the week of `to`. */
export function weeksOf(r: { from: DayKey; to: DayKey }): DayKey[] {
  const out: DayKey[] = [];
  for (let w = weekStart(r.from); w <= r.to; w = addDays(w, 7)) out.push(w);
  return out;
}

/** How many dates fall in each week (Thai time). */
export function weekBuckets(isoDates: string[], r: { from: DayKey; to: DayKey }): { week: DayKey; count: number }[] {
  const counts = new Map(weeksOf(r).map((w) => [w, 0]));
  for (const iso of isoDates) {
    const w = weekStart(dayKey(iso));
    if (counts.has(w)) counts.set(w, counts.get(w)! + 1);
  }
  return [...counts].map(([week, count]) => ({ week, count }));
}

/** How many different people (ids) appear in each week. */
export function weekDistinct(rows: { at: string; id: string }[], r: { from: DayKey; to: DayKey }): { week: DayKey; count: number }[] {
  const sets = new Map(weeksOf(r).map((w) => [w, new Set<string>()]));
  for (const row of rows) sets.get(weekStart(dayKey(row.at)))?.add(row.id);
  return [...sets].map(([week, s]) => ({ week, count: s.size }));
}

// ─── The headline numbers ────────────────────────────────────

export function computeStats(raw: ReportRaw): ReportStats {
  const weeks = rangeWeeks(raw.range);
  const ok = raw.logins.filter((l) => l.ok && l.userId);
  const activeUsers = new Set(ok.map((l) => l.userId!)).size;
  const activeStudents = new Set(ok.filter((l) => l.role === "student").map((l) => l.userId!)).size;
  const accounts = raw.accounts.students + raw.accounts.teachers + raw.accounts.admins;
  const staff = raw.accounts.teachers + raw.accounts.admins;
  const perWeek = weekDistinct(
    ok.map((l) => ({ at: l.at, id: l.userId! })),
    raw.range,
  ).map((w) => w.count);
  const weeklyActive = avg(perWeek);
  const lead = raw.posts.flatMap((p) =>
    p.type === "assignment" || p.type === "exam"
      ? p.targets.filter((t) => t.dueAt).map((t) => Math.max(0, (Date.parse(t.dueAt!) - Date.parse(p.createdAt)) / DAY))
      : [],
  );
  const stages = Object.entries(raw.roadmapStages).flatMap(([stage, n]) => Array<number>(n).fill(Number(stage)));
  const teachersPosting = new Set(raw.posts.map((p) => p.authorId)).size;
  return {
    studentsTotal: raw.roster.studentsTotal,
    studentsRegistered: raw.roster.studentsRegistered,
    teachersTotal: raw.roster.teachersTotal,
    teachersRegistered: raw.roster.teachersRegistered,
    accounts,
    studentAccounts: raw.accounts.students,
    teacherAccounts: staff,
    signups: raw.signups.length,
    activeUsers,
    activeStudents,
    weeklyActivePct: weeklyActive === null ? null : pctOf(weeklyActive, accounts),
    logins: raw.logins.length,
    loginSuccessPct: pctOf(raw.logins.filter((l) => l.ok).length, raw.logins.length),
    posts: raw.posts.length,
    postsPerWeek: raw.posts.length / weeks,
    teachersPosting,
    teachersPostingPct: pctOf(teachersPosting, staff),
    materials: raw.posts.filter((p) => p.type === "material").length,
    files: raw.files,
    driveFiles: raw.driveFiles,
    leadTimeDays: avg(lead),
    studentsWithTarget: raw.studentsWithTarget,
    studentsWithTargetPct: pctOf(raw.studentsWithTarget, raw.accounts.students),
    studentsWithRoadmap: raw.studentsWithRoadmap,
    studentsWithRoadmapPct: pctOf(raw.studentsWithRoadmap, raw.accounts.students),
    avgRoadmapStage: avg(stages),
    errors: raw.errors,
    errorsPerWeek: raw.errors / weeks,
    feedback: raw.feedback.length,
    driveTeachers: raw.driveTeachers,
    driveTeachersPct: pctOf(raw.driveTeachers, staff),
  };
}

// ─── Adoption funnel and room ranking ────────────────────────

export type FunnelStep = { key: string; th: string; en: string; value: number; ofFirst: number | null; fromPrev: number | null };

/** Roster → signed up → active → TCAS target → Roadmap, with % of the first step and of the step before. */
export function funnel(s: ReportStats): FunnelStep[] {
  const steps = [
    { key: "roster", th: "มีชื่อในทะเบียน", en: "On the roster", value: s.studentsTotal },
    { key: "signed", th: "ลงทะเบียนแล้ว", en: "Signed up", value: s.studentsRegistered },
    { key: "active", th: "เข้าใช้ในช่วงนี้", en: "Active in the period", value: s.activeStudents },
    { key: "target", th: "ตั้งเป้าหมาย TCAS", en: "Set a TCAS target", value: s.studentsWithTarget },
    { key: "roadmap", th: "สร้าง Roadmap", en: "Built a Roadmap", value: s.studentsWithRoadmap },
  ];
  return steps.map((st, i) => ({ ...st, ofFirst: pctOf(st.value, steps[0].value), fromPrev: i === 0 ? null : pctOf(st.value, steps[i - 1].value) }));
}

export type RoomRank = {
  classroomId: string;
  label: string;
  total: number;
  registered: number;
  registeredPct: number | null;
  active: number;
  activePct: number | null;
};

/** Rooms by sign-up %, then by how many of their signed-up students used Connext in the period. */
export function roomRanking(raw: ReportRaw): RoomRank[] {
  const active = new Map<string, Set<string>>();
  for (const l of raw.logins) {
    if (!l.ok || l.role !== "student" || !l.classroomId || !l.userId) continue;
    if (!active.has(l.classroomId)) active.set(l.classroomId, new Set());
    active.get(l.classroomId)!.add(l.userId);
  }
  return raw.rooms
    .map((r) => {
      const a = active.get(r.classroomId)?.size ?? 0;
      return { ...r, registeredPct: pctOf(r.registered, r.total), active: a, activePct: pctOf(a, r.registered) };
    })
    .sort((a, b) => (b.registeredPct ?? -1) - (a.registeredPct ?? -1) || (b.activePct ?? -1) - (a.activePct ?? -1) || a.label.localeCompare(b.label));
}

// ─── When people use it ──────────────────────────────────────

export const DAYS_SHORT = { th: ["จ.", "อ.", "พ.", "พฤ.", "ศ.", "ส.", "อา."], en: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] };

export const DAYS = {
  th: ["จันทร์", "อังคาร", "พุธ", "พฤหัสบดี", "ศุกร์", "เสาร์", "อาทิตย์"],
  en: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"],
};

/** Successful log-ins by weekday (Monday = 0) × hour, Thai time. */
export function heatmap(times: string[]): number[][] {
  const m = Array.from({ length: 7 }, () => Array<number>(24).fill(0));
  for (const iso of times) {
    const t = new Date(Date.parse(iso) + 7 * 3_600_000);
    const day = (t.getUTCDay() + 6) % 7;
    m[day][t.getUTCHours()]++;
  }
  return m;
}

/** The busiest two-hour window of the week, or null with too few log-ins to say. */
export function peakOf(m: number[][], min = 3): { day: number; hour: number; count: number } | null {
  let best: { day: number; hour: number; count: number } | null = null;
  for (let d = 0; d < 7; d++)
    for (let h = 0; h < 23; h++) {
      const c = m[d][h] + m[d][h + 1];
      if (!best || c > best.count) best = { day: d, hour: h, count: c };
    }
  return best && best.count >= min ? best : null;
}

export const peakText = (p: { day: number; hour: number }, lang: Lang) =>
  `${lang === "th" ? "วัน" : ""}${DAYS[lang][p.day]} ${String(p.hour).padStart(2, "0")}:00–${String(p.hour + 2).padStart(2, "0")}:00`;

// ─── Student workload ────────────────────────────────────────

export type Workload = {
  /** Per room per week: deadlines and exams. */
  weeks: { classroomId: string; week: DayKey; assignments: number; exams: number }[];
  /** The heaviest room-weeks (most exams, then most work). */
  heaviest: { classroomId: string; week: DayKey; assignments: number; exams: number }[];
  /** One room, one day: 3+ exams, or 2+ midterm/final exams. */
  clashes: { classroomId: string; day: DayKey; exams: number; majors: number }[];
  leadAssignments: number | null;
  leadExams: number | null;
};

export function workload(dues: RawDue[]): Workload {
  const weeks = new Map<string, { classroomId: string; week: DayKey; assignments: number; exams: number }>();
  const days = new Map<string, { classroomId: string; day: DayKey; exams: number; majors: number }>();
  const leadA: number[] = [];
  const leadE: number[] = [];
  for (const d of dues) {
    if (d.type !== "assignment" && d.type !== "exam") continue;
    const day = dayKey(d.dueAt);
    const wk = `${d.classroomId}|${weekStart(day)}`;
    const w = weeks.get(wk) ?? { classroomId: d.classroomId, week: weekStart(day), assignments: 0, exams: 0 };
    const lead = Math.max(0, (Date.parse(d.dueAt) - Date.parse(d.createdAt)) / DAY);
    if (d.type === "assignment") {
      w.assignments++;
      leadA.push(lead);
    } else {
      w.exams++;
      leadE.push(lead);
      const dk = `${d.classroomId}|${day}`;
      const c = days.get(dk) ?? { classroomId: d.classroomId, day, exams: 0, majors: 0 };
      c.exams++;
      if (d.examKind === "major") c.majors++;
      days.set(dk, c);
    }
    weeks.set(wk, w);
  }
  const all = [...weeks.values()];
  return {
    weeks: all.sort((a, b) => a.week.localeCompare(b.week)),
    heaviest: [...all].sort((a, b) => b.exams - a.exams || b.assignments - a.assignments).slice(0, 3),
    clashes: [...days.values()].filter((c) => c.exams >= 3 || c.majors >= 2).sort((a, b) => a.day.localeCompare(b.day)),
    leadAssignments: avg(leadA),
    leadExams: avg(leadE),
  };
}

// ─── Impact (estimates) ──────────────────────────────────────

export type Impact = { reach: number; avgReachPerPost: number | null; roomsReached: number; hoursSaved: number; pagesSaved: number; bahtSaved: number };

/** How far posts reached and what that saved, from the period's posts and the editable assumptions. */
export function impact(raw: ReportRaw, a: Assumptions): Impact {
  const inRoom = new Map(raw.rooms.map((r) => [r.classroomId, r.registered]));
  const school = raw.rooms.reduce((n, r) => n + r.registered, 0);
  let reach = 0;
  let roomsReached = 0;
  let pages = 0;
  for (const p of raw.posts) {
    let postReach = 0;
    for (const t of p.targets) {
      if (t.classroomId === null) {
        postReach += school;
        roomsReached += raw.rooms.length;
      } else {
        postReach += inRoom.get(t.classroomId) ?? 0;
        roomsReached++;
      }
    }
    reach += postReach;
    if (p.hasFile) pages += postReach * a.pagesPerFile;
  }
  return {
    reach,
    avgReachPerPost: raw.posts.length ? reach / raw.posts.length : null,
    roomsReached,
    hoursSaved: (roomsReached * a.minutesPerRoom) / 60,
    pagesSaved: pages,
    bahtSaved: pages * a.bahtPerPage,
  };
}

// ─── "Your school" calculator ────────────────────────────────

/** Rates measured at our school, used to project another school. Fallbacks when there's no data yet. */
export type Rates = { postsPerTeacherWeek: number; roomsPerPost: number; fileShare: number; avgFileMB: number; measured: boolean };

/** Below this many posts our own rates are too noisy to project another school from. */
export const MIN_POSTS_FOR_RATES = 20;
export const DEFAULT_RATES: Rates = { postsPerTeacherWeek: 2, roomsPerPost: 2, fileShare: 0.3, avgFileMB: 2, measured: false };

export function measuredRates(raw: ReportRaw, s: ReportStats, avgFileBytes: number | null): Rates {
  if (raw.posts.length < MIN_POSTS_FOR_RATES || !s.teacherAccounts) return DEFAULT_RATES;
  const weeks = rangeWeeks(raw.range);
  const targets = raw.posts.reduce((n, p) => n + p.targets.length, 0);
  return {
    postsPerTeacherWeek: raw.posts.length / s.teacherAccounts / weeks,
    roomsPerPost: targets / raw.posts.length,
    fileShare: raw.posts.filter((p) => p.hasFile).length / raw.posts.length,
    avgFileMB: avgFileBytes ? avgFileBytes / (1024 * 1024) : DEFAULT_RATES.avgFileMB,
    measured: true,
  };
}

export type Projection = {
  postsYear: number;
  reachYear: number;
  hoursYear: number;
  pagesYear: number;
  bahtYear: number;
  downloadsGBMonth: number;
  storageGB: number;
  accounts: number;
  verdict: "free" | "drive" | "upgrade";
};

/** What a school of this size could expect in a year, and whether the free plans would hold. */
export function projectSchool(students: number, teachers: number, r: Rates, a: Assumptions): Projection {
  const s = Math.max(0, Math.round(students));
  const t = Math.max(0, Math.round(teachers));
  const postsYear = t * r.postsPerTeacherWeek * a.schoolWeeks;
  const roomTargets = postsYear * r.roomsPerPost;
  const perRoom = Math.min(a.classSize, s || a.classSize);
  const filesYear = postsYear * r.fileShare;
  const pagesYear = filesYear * r.roomsPerPost * perRoom * a.pagesPerFile;
  // Without Google Drive every open of a PDF is a Supabase download; assume 60% of students open each file.
  const downloadsGBMonth = ((filesYear / 12) * r.roomsPerPost * perRoom * 0.6 * r.avgFileMB) / 1024;
  // Files are kept 180 days, so about half a year's files are stored at once.
  const storageGB = ((filesYear / 2) * r.avgFileMB) / 1024;
  const accounts = s + t;
  const verdict = accounts > 50_000 ? "upgrade" : downloadsGBMonth > 4 || storageGB > 0.8 ? "drive" : "free";
  return {
    postsYear,
    reachYear: roomTargets * perRoom,
    hoursYear: (roomTargets * a.minutesPerRoom) / 60,
    pagesYear,
    bahtYear: pagesYear * a.bahtPerPage,
    downloadsGBMonth,
    storageGB,
    accounts,
    verdict,
  };
}

// ─── Findings, written for people ────────────────────────────

export type Finding = { key: string; score: number; tone: "good" | "watch" | "info"; th: string; en: string };

type FindingContext = {
  stats: ReportStats;
  prev: ReportStats | null;
  okrs: ScoredOkr[];
  rooms: RoomRank[];
  peak: { day: number; hour: number; count: number } | null;
  work: Workload;
  roomLabel: (id: string) => string;
  impact: Impact;
  topTargets: { label: string; students: number }[];
};

const n0 = (v: number, lang: Lang) => Math.round(v).toLocaleString(lang === "th" ? "th-TH" : "en-US");
const n1 = (v: number, lang: Lang) => v.toLocaleString(lang === "th" ? "th-TH" : "en-US", { maximumFractionDigits: 1 });

/** Up to `max` findings, the most important first. Each rule only speaks when the data supports it. */
export function insights(c: FindingContext, max = 6): Finding[] {
  const out: Finding[] = [];
  const s = c.stats;

  const act = change(s.activeUsers, c.prev?.activeUsers ?? null);
  if (act !== null && Math.abs(act) >= 10 && (c.prev?.activeUsers ?? 0) > 0) {
    const up = act > 0;
    out.push({
      key: "active-change",
      score: 90,
      tone: up ? "good" : "watch",
      th: `ผู้ใช้งาน${up ? "เพิ่มขึ้น" : "ลดลง"} ${Math.round(Math.abs(act))}% จากช่วงก่อน (${n0(c.prev!.activeUsers, "th")} → ${n0(s.activeUsers, "th")} คน)`,
      en: `Active users ${up ? "rose" : "fell"} ${Math.round(Math.abs(act))}% from the previous period (${n0(c.prev!.activeUsers, "en")} → ${n0(s.activeUsers, "en")})`,
    });
  }

  if (c.work.clashes.length) {
    const first = c.work.clashes[0];
    out.push({
      key: "clashes",
      score: 88,
      tone: "watch",
      th: `พบ ${c.work.clashes.length} วันที่นักเรียนห้องเดียวกันมีสอบหนักในวันเดียว เช่น ${c.roomLabel(first.classroomId)} วันที่ ${formatDay(first.day, "th", false)} มีสอบ ${first.exams} วิชา`,
      en: `${c.work.clashes.length} day(s) where one class faces a heavy exam load, e.g. ${roomText(c.roomLabel(first.classroomId), "en")} on ${formatDay(first.day, "en", false)} with ${first.exams} exams`,
    });
  }

  const measured = c.okrs.flatMap((o) => o.keyResults).filter((k) => k.status !== "none");
  if (measured.length) {
    const on = measured.filter((k) => k.status === "on").length;
    out.push({
      key: "okrs",
      score: 85,
      tone: on * 2 >= measured.length ? "good" : "info",
      th: `บรรลุ ${on} จาก ${measured.length} ผลลัพธ์หลักที่วัดได้`,
      en: `${on} of ${measured.length} measurable key results are on track`,
    });
  }

  const full = c.rooms.filter((r) => r.total > 0 && r.registered >= r.total);
  if (full.length) {
    out.push({
      key: "full-rooms",
      score: 80,
      tone: "good",
      th: full.length === 1 ? `${full[0].label} ลงทะเบียนครบ 100% แล้ว` : `${full.length} ห้องลงทะเบียนครบ 100%: ${full.map((r) => r.label).join(", ")}`,
      en:
        full.length === 1
          ? `${roomText(full[0].label, "en")} is 100% signed up`
          : `${full.length} classes are 100% signed up: ${full.map((r) => roomText(r.label, "en")).join(", ")}`,
    });
  }

  if (c.impact.hoursSaved >= 1) {
    out.push({
      key: "impact",
      score: 75,
      tone: "good",
      th: `Connext ช่วยครูประหยัดเวลาประมาณ ${n1(c.impact.hoursSaved, "th")} ชั่วโมง${c.impact.pagesSaved >= 1 ? ` และกระดาษราว ${n0(c.impact.pagesSaved, "th")} แผ่น` : ""} (ประมาณการ)`,
      en: `Connext saved teachers about ${n1(c.impact.hoursSaved, "en")} hours${c.impact.pagesSaved >= 1 ? ` and roughly ${n0(c.impact.pagesSaved, "en")} printed pages` : ""} (estimate)`,
    });
  }

  if (c.peak) {
    out.push({
      key: "peak",
      score: 70,
      tone: "info",
      th: `ช่วงที่มีคนเข้าใช้มากที่สุดคือ${peakText(c.peak, "th")}`,
      en: `The busiest time is ${peakText(c.peak, "en")}`,
    });
  }

  const heavy = c.work.heaviest[0];
  if (heavy && heavy.exams >= 3) {
    out.push({
      key: "heavy-week",
      score: 65,
      tone: "watch",
      th: `สัปดาห์ที่หนักที่สุด: ${c.roomLabel(heavy.classroomId)} สัปดาห์ของ ${formatDay(heavy.week, "th", false)} มีสอบ ${heavy.exams} และงาน ${heavy.assignments} ชิ้น`,
      en: `Heaviest week: ${roomText(c.roomLabel(heavy.classroomId), "en")}, week of ${formatDay(heavy.week, "en", false)}: ${heavy.exams} exams and ${heavy.assignments} assignments`,
    });
  }

  if (c.work.leadAssignments !== null || c.work.leadExams !== null) {
    const parts = (lang: Lang) =>
      [
        c.work.leadAssignments !== null
          ? lang === "th"
            ? `แจ้งงานล่วงหน้าเฉลี่ย ${formatValue(c.work.leadAssignments, "days", lang)}`
            : `assignments ${formatValue(c.work.leadAssignments, "days", lang)} ahead`
          : null,
        c.work.leadExams !== null
          ? lang === "th"
            ? `แจ้งสอบล่วงหน้าเฉลี่ย ${formatValue(c.work.leadExams, "days", lang)}`
            : `exams ${formatValue(c.work.leadExams, "days", lang)} ahead`
          : null,
      ].filter(Boolean);
    out.push({ key: "lead", score: 60, tone: "info", th: `ครู${parts("th").join(" และ")}`, en: `On average teachers announce ${parts("en").join(" and ")}` });
  }

  if (c.topTargets.length) {
    out.push({
      key: "top-target",
      score: 55,
      tone: "info",
      th: `เป้าหมายที่นักเรียนเลือกมากที่สุด: ${c.topTargets[0].label} (${n0(c.topTargets[0].students, "th")} คน)`,
      en: `Most-chosen target: ${c.topTargets[0].label} (${n0(c.topTargets[0].students, "en")} students)`,
    });
  }

  const posts = change(s.posts, c.prev?.posts ?? null);
  if (posts !== null && Math.abs(posts) >= 20 && (c.prev?.posts ?? 0) > 0) {
    out.push({
      key: "posts-change",
      score: 50,
      tone: posts > 0 ? "good" : "watch",
      th: `ครูโพสต์${posts > 0 ? "มากขึ้น" : "น้อยลง"} ${Math.round(Math.abs(posts))}% จากช่วงก่อน`,
      en: `Teachers posted ${Math.round(Math.abs(posts))}% ${posts > 0 ? "more" : "less"} than in the previous period`,
    });
  }

  return out.sort((a, b) => b.score - a.score).slice(0, max);
}
