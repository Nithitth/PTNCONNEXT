// Comparisons for รายงาน & OKR and the war room: each goal week by week (with a projected finish), room vs room,
// subject vs subject, and feature use. Pure (shared with the browser). Tested in reportCompare.test.ts.

import { addDays, dayKey, type DayKey } from "./calendar";
import { FEATURES, type FeatureKey } from "./features";
import { DEFAULT_ASSUMPTIONS, METRICS, metricOf, type Assumptions, type ReportStats } from "./report";
import { computeStats, weeklyUsePct, weeksOf, type ReportRaw } from "./reportAnalysis";
import { SUBJECTS } from "./school";

const pctOf = (part: number, whole: number) => (whole > 0 ? (part / whole) * 100 : null);
const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
const inDays = (iso: string, from: DayKey, to: DayKey) => {
  const d = dayKey(iso);
  return d >= from && d <= to;
};

/** Goals that can't be split by week (no dates per row): drawn as "now" only. */
const NOT_WEEKLY = new Set(["errors_per_week", "lockouts", "returning_pct", "features_per_person"]);

/** The period cut down to one week (Monday start). Sign-up totals are wound back to that week's end. */
export function sliceWeek(raw: ReportRaw, week: DayKey): ReportRaw {
  const from = week < raw.range.from ? raw.range.from : week;
  const end = addDays(week, 6);
  const to = end > raw.range.to ? raw.range.to : end;
  const later = (kind: "student" | "teacher") => (raw.rosterSignups ?? []).filter((s) => s.kind === kind && dayKey(s.at) > to).length;
  const posts = raw.posts.filter((p) => inDays(p.createdAt, from, to));
  return {
    ...raw,
    range: { from, to },
    roster: {
      ...raw.roster,
      studentsRegistered: Math.max(0, raw.roster.studentsRegistered - later("student")),
      teachersRegistered: Math.max(0, raw.roster.teachersRegistered - later("teacher")),
    },
    signups: raw.signups.filter((s) => inDays(s, from, to)),
    logins: raw.logins.filter((l) => inDays(l.at, from, to)),
    posts,
    dues: raw.dues.filter((d) => inDays(d.dueAt, from, to)),
    files: posts.filter((p) => p.hasFile).length,
    feedback: raw.feedback.filter((f) => inDays(f.at, from, to)),
    usage: (raw.usage ?? []).filter((u) => u.week === week),
    views: (raw.views ?? []).filter((v) => inDays(v.createdAt, from, to)),
    people: [],
  };
}

export type Point = { week: DayKey; value: number | null };

/** Each goal's value per week of the period. Snapshot goals only have the last week. */
export function weeklySeries(raw: ReportRaw, keys: string[], a: Assumptions = DEFAULT_ASSUMPTIONS, now?: ReportStats): Record<string, Point[]> {
  const weeks = weeksOf(raw.range);
  const stats = weeks.map((w) => computeStats(sliceWeek(raw, w), a));
  const whole = now ?? computeStats(raw, a);
  const out: Record<string, Point[]> = {};
  for (const key of keys) {
    const m = metricOf(key);
    if (!m) continue;
    const weekly = m.kind !== "snapshot" && !NOT_WEEKLY.has(key);
    out[key] = weeks.map((week, i) => {
      const last = i === weeks.length - 1;
      if (!weekly) return { week, value: last ? m.value(whole) : null };
      const v = m.value(stats[i]);
      // A fresh-data goal before the activity log started has nothing to show.
      return { week, value: v === null || !Number.isFinite(v) ? null : v };
    });
  }
  return out;
}

export type Projection =
  | { state: "reached" }
  /** The period hasn't met the target yet, but the latest week has (set by the report view). */
  | { state: "latest-week" }
  | { state: "on-course"; week: DayKey; weeksLeft: number }
  | { state: "off-course" }
  | { state: "no-data" };

/** A straight line through the last 6 weekly points: when will the target be met (if ever, within a year)? */
export function projection(points: Point[], target: number, lower = false): Projection {
  const pts = points.map((p, i) => ({ x: i, y: p.value, week: p.week })).filter((p): p is { x: number; y: number; week: DayKey } => p.y !== null);
  if (!pts.length) return { state: "no-data" };
  const last = pts[pts.length - 1];
  if (lower ? last.y <= target : last.y >= target) return { state: "reached" };
  const tail = pts.slice(-6);
  if (tail.length < 2) return { state: "no-data" };
  const mx = avg(tail.map((p) => p.x))!;
  const my = avg(tail.map((p) => p.y))!;
  const den = tail.reduce((n, p) => n + (p.x - mx) ** 2, 0);
  const slope = den ? tail.reduce((n, p) => n + (p.x - mx) * (p.y - my), 0) / den : 0;
  const towards = lower ? -slope : slope;
  if (towards <= 0) return { state: "off-course" };
  const weeksLeft = Math.ceil(Math.abs(target - last.y) / Math.abs(slope));
  if (weeksLeft > 52) return { state: "off-course" };
  return { state: "on-course", week: addDays(last.week, weeksLeft * 7), weeksLeft };
}

// ─── Room vs room ────────────────────────────────────────────

export const ROOM_COLUMNS = [
  { key: "signedUp", th: "ลงทะเบียน", en: "Signed up" },
  { key: "active", th: "เข้าใช้", en: "Active" },
  { key: "weekly", th: "ใช้ทุกสัปดาห์", en: "Weekly use" },
  { key: "seen", th: "เปิดดูโพสต์", en: "Opened posts" },
  { key: "target", th: "ตั้งเป้า TCAS", en: "TCAS target" },
  { key: "roadmap", th: "มี Roadmap", en: "Roadmap" },
] as const;
export type RoomColumn = (typeof ROOM_COLUMNS)[number]["key"];
export type RoomRow = { classroomId: string; label: string; students: number; values: Record<RoomColumn, number | null> };

/** The rooms side by side, every value a % (null = no data, or a TCAS/Roadmap group under 3). */
export function roomCompare(raw: ReportRaw): RoomRow[] {
  const active = new Map<string, Set<string>>();
  for (const l of raw.logins) {
    if (!l.ok || l.role !== "student" || !l.classroomId || !l.userId) continue;
    if (!active.has(l.classroomId)) active.set(l.classroomId, new Set());
    active.get(l.classroomId)!.add(l.userId);
  }
  const views = raw.views ?? [];
  return raw.rooms.map((r) => {
    const mine = views.filter((v) => v.classroomId === r.classroomId);
    const targeted = mine.reduce((n, v) => n + v.targeted, 0);
    const t = raw.roomTargets?.[r.classroomId];
    const rm = raw.roomRoadmaps?.[r.classroomId];
    return {
      classroomId: r.classroomId,
      label: r.label,
      students: r.registered,
      values: {
        signedUp: pctOf(r.registered, r.total),
        active: pctOf(active.get(r.classroomId)?.size ?? 0, r.registered),
        weekly: weeklyUsePct(raw.usage ?? [], null, "student", r.registered, r.classroomId),
        seen: targeted
          ? pctOf(
              mine.reduce((n, v) => n + v.seen, 0),
              targeted,
            )
          : null,
        target: t === null || t === undefined ? null : pctOf(t, r.registered),
        roadmap: rm === null || rm === undefined ? null : pctOf(rm, r.registered),
      },
    };
  });
}

/** The school's average of each room column (rooms with data only). */
export function roomAverage(rows: RoomRow[]): Record<RoomColumn, number | null> {
  const out = {} as Record<RoomColumn, number | null>;
  for (const c of ROOM_COLUMNS) out[c.key] = avg(rows.map((r) => r.values[c.key]).filter((v): v is number => v !== null));
  return out;
}

// ─── Subject vs subject ──────────────────────────────────────

export type SubjectRow = {
  subject: string;
  color: string;
  posts: number;
  files: number;
  leadDays: number | null;
  /** Exams of this subject that fall on a clash day (3+ exams, or 2+ midterm/final, in one room). */
  clashExams: number;
  seenPct: number | null;
  seen24hPct: number | null;
};

export function subjectCompare(raw: ReportRaw): SubjectRow[] {
  const dayCount = new Map<string, { exams: number; majors: number }>();
  for (const d of raw.dues) {
    if (d.type !== "exam") continue;
    const k = `${d.classroomId}|${dayKey(d.dueAt)}`;
    const c = dayCount.get(k) ?? { exams: 0, majors: 0 };
    c.exams++;
    if (d.examKind === "major") c.majors++;
    dayCount.set(k, c);
  }
  const clash = (k: string) => {
    const c = dayCount.get(k);
    return Boolean(c && (c.exams >= 3 || c.majors >= 2));
  };
  const views = raw.views ?? [];
  return SUBJECTS.map((s) => {
    const posts = raw.posts.filter((p) => p.subject === s.name);
    const lead = posts.flatMap((p) =>
      p.type === "assignment" || p.type === "exam"
        ? p.targets.filter((t) => t.dueAt).map((t) => Math.max(0, (Date.parse(t.dueAt!) - Date.parse(p.createdAt)) / 86_400_000))
        : [],
    );
    const v = views.filter((x) => x.subject === s.name);
    const targeted = v.reduce((n, x) => n + x.targeted, 0);
    return {
      subject: s.name,
      color: s.color,
      posts: posts.length,
      files: posts.filter((p) => p.hasFile).length,
      leadDays: avg(lead),
      clashExams: raw.dues.filter((d) => d.type === "exam" && d.subject === s.name && clash(`${d.classroomId}|${dayKey(d.dueAt)}`)).length,
      seenPct: targeted
        ? pctOf(
            v.reduce((n, x) => n + x.seen, 0),
            targeted,
          )
        : null,
      seen24hPct: targeted
        ? pctOf(
            v.reduce((n, x) => n + x.seen24h, 0),
            targeted,
          )
        : null,
    };
  });
}

// ─── Feature use ─────────────────────────────────────────────

export type FeatureRow = { key: FeatureKey; th: string; en: string; pct: number | null; visits: number; series: Point[]; trend: number | null };

/** Every feature's weekly users %, visits and weekly line, most used first (no data → last). */
export function featureUsage(raw: ReportRaw): FeatureRow[] {
  const usage = raw.usage ?? [];
  const staff = raw.accounts.teachers + raw.accounts.admins;
  const size = { student: raw.accounts.students, staff, all: raw.accounts.students + staff };
  const weeks = weeksOf(raw.range);
  return FEATURES.map((f) => {
    const rows = usage.filter((u) => u.feature === f.key && (f.audience === "all" || (f.audience === "student" ? u.role === "student" : u.role !== "student")));
    const series = weeks.map((week) => {
      const n = rows.filter((u) => u.week === week).reduce((s, u) => s + u.users, 0);
      return { week, value: usage.some((u) => u.week === week) ? pctOf(n, size[f.audience]) : null };
    });
    const known = series.map((p) => p.value).filter((v): v is number => v !== null);
    const half = Math.floor(known.length / 2);
    const trend = known.length >= 2 ? avg(known.slice(half))! - avg(known.slice(0, half || 1))! : null;
    return {
      key: f.key,
      th: f.th,
      en: f.en,
      pct: weeklyUsePct(usage, f.key, f.audience, size[f.audience]),
      visits: rows.reduce((s, u) => s + u.visits, 0),
      series,
      trend,
    };
  }).sort((a, b) => (b.pct ?? -1) - (a.pct ?? -1));
}

/** Goals in METRICS order, grouped for the goal picker. */
export const metricKeys = () => METRICS.map((m) => m.key);
