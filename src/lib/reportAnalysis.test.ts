import assert from "node:assert/strict";
import { test } from "node:test";
import { DEFAULT_ASSUMPTIONS, DEFAULT_OKRS, scoreOkrs } from "./report";
import {
  computeStats,
  funnel,
  heatmap,
  impact,
  measuredRates,
  DEFAULT_RATES,
  insights,
  peakOf,
  projectSchool,
  roomRanking,
  weekBuckets,
  weeksOf,
  workload,
  type ReportRaw,
} from "./reportAnalysis";

const RANGE = { from: "2026-11-09", to: "2026-11-22" }; // two full weeks, Monday to Sunday

function raw(over: Partial<ReportRaw> = {}): ReportRaw {
  return {
    range: RANGE,
    roster: { studentsTotal: 80, studentsRegistered: 40, teachersTotal: 4, teachersRegistered: 4 },
    rooms: [
      { classroomId: "a", label: "ม.4/1", total: 40, registered: 40 },
      { classroomId: "b", label: "ม.4/2", total: 40, registered: 0 },
    ],
    accounts: { students: 40, teachers: 3, admins: 1 },
    signups: [],
    logins: [],
    posts: [],
    dues: [],
    files: 0,
    driveFiles: 0,
    driveTeachers: 0,
    errors: 0,
    feedback: [],
    studentsWithTarget: 10,
    studentsWithRoadmap: 4,
    roadmapStages: { 1: 2, 3: 2 },
    topTargets: [],
    storageBytes: 0,
    ...over,
  };
}

test("weeks start on Monday and buckets use Thai time", () => {
  assert.deepEqual(weeksOf(RANGE), ["2026-11-09", "2026-11-16"]);
  // 16 Nov 00:30 Thai time is 15 Nov 17:30 UTC: it belongs to the second week.
  const b = weekBuckets(["2026-11-15T17:30:00Z", "2026-11-10T03:00:00Z"], RANGE);
  assert.deepEqual(b, [
    { week: "2026-11-09", count: 1 },
    { week: "2026-11-16", count: 1 },
  ]);
});

test("computeStats: active users, success rate, per week, lead time, roadmap stage", () => {
  const r = raw({
    logins: [
      { at: "2026-11-10T03:00:00Z", ok: true, userId: "s1", role: "student", classroomId: "a" },
      { at: "2026-11-17T03:00:00Z", ok: true, userId: "s1", role: "student", classroomId: "a" },
      { at: "2026-11-17T04:00:00Z", ok: true, userId: "t1", role: "teacher", classroomId: null },
      { at: "2026-11-17T05:00:00Z", ok: false, userId: null, role: null, classroomId: null },
    ],
    posts: [
      {
        id: "p1",
        type: "assignment",
        examKind: null,
        subject: "math",
        authorId: "t1",
        createdAt: "2026-11-10T00:00:00Z",
        hasFile: false,
        targets: [{ classroomId: "a", dueAt: "2026-11-14T00:00:00Z" }],
      },
      {
        id: "p2",
        type: "material",
        examKind: null,
        subject: "math",
        authorId: "t1",
        createdAt: "2026-11-11T00:00:00Z",
        hasFile: true,
        targets: [{ classroomId: "a", dueAt: null }],
      },
    ],
    errors: 4,
  });
  const s = computeStats(r);
  assert.equal(s.activeUsers, 2);
  assert.equal(s.activeStudents, 1);
  assert.equal(s.loginSuccessPct, 75);
  assert.equal(s.postsPerWeek, 1);
  assert.equal(s.errorsPerWeek, 2);
  assert.equal(s.leadTimeDays, 4);
  assert.equal(s.teachersPosting, 1);
  assert.equal(s.teachersPostingPct, 25);
  assert.equal(s.materials, 1);
  assert.equal(s.avgRoadmapStage, 2); // (1+1+3+3)/4
  // Week 1: 1 person, week 2: 2 people → average 1.5 of 44 accounts.
  assert.ok(Math.abs(s.weeklyActivePct! - (1.5 / 44) * 100) < 1e-9);
});

test("funnel percentages and room ranking", () => {
  const r = raw({ logins: [{ at: "2026-11-10T03:00:00Z", ok: true, userId: "s1", role: "student", classroomId: "a" }] });
  const f = funnel(computeStats(r));
  assert.deepEqual(
    f.map((x) => x.value),
    [80, 40, 1, 10, 4],
  );
  assert.equal(f[1].ofFirst, 50);
  assert.equal(f[1].fromPrev, 50);
  assert.equal(f[0].fromPrev, null);
  const rooms = roomRanking(r);
  assert.equal(rooms[0].label, "ม.4/1");
  assert.equal(rooms[0].active, 1);
  assert.equal(rooms[1].registeredPct, 0);
});

test("heatmap uses Thai time, Monday first, and finds the busiest two hours", () => {
  // Sunday 15 Nov 13:00 UTC = Sunday 20:00 Thai time.
  const m = heatmap(["2026-11-15T13:00:00Z", "2026-11-15T13:30:00Z", "2026-11-15T14:10:00Z", "2026-11-10T01:00:00Z"]);
  assert.equal(m[6][20], 2);
  assert.equal(m[6][21], 1);
  assert.equal(m[1][8], 1); // Tuesday 08:00
  assert.deepEqual(peakOf(m), { day: 6, hour: 20, count: 3 });
  assert.equal(peakOf(heatmap(["2026-11-10T01:00:00Z"])), null);
});

test("workload: clash days, heaviest week, lead times", () => {
  const exam = (day: string, kind: "quiz" | "major" = "quiz") => ({
    type: "exam" as const,
    examKind: kind,
    subject: "x",
    classroomId: "a",
    dueAt: `${day}T02:00:00Z`,
    createdAt: "2026-11-01T02:00:00Z",
  });
  const w = workload([
    exam("2026-11-17"),
    exam("2026-11-17"),
    exam("2026-11-17"),
    exam("2026-11-19", "major"),
    exam("2026-11-19", "major"),
    { type: "assignment", examKind: null, subject: "y", classroomId: "b", dueAt: "2026-11-12T02:00:00Z", createdAt: "2026-11-10T02:00:00Z" },
  ]);
  assert.deepEqual(
    w.clashes.map((c) => [c.day, c.exams, c.majors]),
    [
      ["2026-11-17", 3, 0],
      ["2026-11-19", 2, 2],
    ],
  );
  assert.equal(w.heaviest[0].exams, 5);
  assert.equal(w.leadAssignments, 2);
  assert.ok(w.leadExams! > 15);
  assert.deepEqual(workload([]).clashes, []);
});

test("impact: reach, hours and pages from the assumptions", () => {
  const r = raw({
    posts: [
      {
        id: "p1",
        type: "material",
        examKind: null,
        subject: null,
        authorId: "t1",
        createdAt: "2026-11-10T00:00:00Z",
        hasFile: true,
        targets: [{ classroomId: "a", dueAt: null }],
      },
      {
        id: "p2",
        type: "event",
        examKind: null,
        subject: null,
        authorId: "t1",
        createdAt: "2026-11-10T00:00:00Z",
        hasFile: false,
        targets: [{ classroomId: null, dueAt: null }],
      },
    ],
  });
  const i = impact(r, DEFAULT_ASSUMPTIONS);
  assert.equal(i.reach, 40 + 40); // room a, then the whole school (40 signed up)
  assert.equal(i.roomsReached, 3);
  assert.equal(i.hoursSaved, (3 * 5) / 60);
  assert.equal(i.pagesSaved, 40 * 3);
  assert.equal(i.bahtSaved, 120 * 0.5);
  assert.equal(i.avgReachPerPost, 40);
});

test("projectSchool scales with size and gives a verdict", () => {
  const rates = { postsPerTeacherWeek: 2, roomsPerPost: 2, fileShare: 0.3, avgFileMB: 2, measured: true };
  const small = projectSchool(300, 15, rates, DEFAULT_ASSUMPTIONS);
  const big = projectSchool(3000, 150, rates, DEFAULT_ASSUMPTIONS);
  assert.ok(big.hoursYear > small.hoursYear * 9);
  assert.equal(small.verdict, "free");
  assert.equal(big.verdict, "drive");
  assert.equal(projectSchool(60_000, 10, rates, DEFAULT_ASSUMPTIONS).verdict, "upgrade");
});

test("insights speak only when the data supports them", () => {
  const r = raw();
  const s = computeStats(r);
  const base = {
    stats: s,
    prev: null,
    okrs: scoreOkrs(DEFAULT_OKRS, s, null),
    rooms: roomRanking(r),
    peak: null,
    work: workload([]),
    roomLabel: (id: string) => id,
    impact: impact(r, DEFAULT_ASSUMPTIONS),
    topTargets: [],
  };
  const keys = insights(base).map((f) => f.key);
  assert.ok(keys.includes("okrs"));
  assert.ok(keys.includes("full-rooms")); // ม.4/1 is 40/40
  assert.ok(!keys.includes("active-change")); // no previous period
  assert.ok(!keys.includes("clashes"));
  const grown = insights({ ...base, stats: { ...s, activeUsers: 150 }, prev: { ...s, activeUsers: 100 } });
  assert.equal(grown[0].key, "active-change");
  assert.match(grown[0].th, /เพิ่มขึ้น 50%/);
  assert.ok(insights(base, 2).length <= 2);
});

test("measuredRates falls back to defaults until there are enough posts", () => {
  const few = raw();
  assert.deepEqual(measuredRates(few, computeStats(few), null), DEFAULT_RATES);
  const posts = Array.from({ length: 24 }, (_, i) => ({
    id: String(i),
    type: "material" as const,
    examKind: null,
    subject: null,
    authorId: "t1",
    createdAt: "2026-11-10T00:00:00Z",
    hasFile: i % 2 === 0,
    targets: [
      { classroomId: "a", dueAt: null },
      { classroomId: "b", dueAt: null },
    ],
  }));
  const many = raw({ posts });
  const r = measuredRates(many, computeStats(many), 4 * 1024 * 1024);
  assert.equal(r.measured, true);
  assert.equal(r.roomsPerPost, 2);
  assert.equal(r.fileShare, 0.5);
  assert.equal(r.avgFileMB, 4);
  assert.equal(r.postsPerTeacherWeek, 24 / 4 / 2); // 4 staff accounts, 2 weeks
});
