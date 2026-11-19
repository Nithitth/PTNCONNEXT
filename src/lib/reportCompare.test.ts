import assert from "node:assert/strict";
import { test } from "node:test";
import { CATEGORIES, METRICS, cleanOkrs } from "./report";
import { computeStats, type ReportRaw } from "./reportAnalysis";
import { featureUsage, projection, roomAverage, roomCompare, sliceWeek, subjectCompare, weeklySeries } from "./reportCompare";

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

test("catalogue: unique keys, every goal grouped, described and drawable", () => {
  const keys = METRICS.map((m) => m.key);
  assert.equal(new Set(keys).size, keys.length);
  assert.ok(keys.length >= 50, `only ${keys.length} goals`);
  const cats = new Set(CATEGORIES.map((c) => c.key));
  for (const m of METRICS) {
    assert.ok(cats.has(m.cat), m.key);
    assert.ok(m.desc.length > 5, m.key);
    assert.ok(["flow", "stock", "snapshot"].includes(m.kind), m.key);
    assert.ok(Number.isFinite(m.suggest), m.key);
  }
  // A goal that only exists with the activity log can be saved like any other.
  const r = cleanOkrs([
    {
      objective: "ฟีเจอร์ใหม่ถูกใช้จริง",
      keyResults: [
        { metric: "feature_calendar_pct", target: 60 },
        { metric: "seen_24h_pct", target: 70 },
      ],
    },
  ]);
  assert.ok("okrs" in r && r.okrs[0].keyResults[0].label.includes("ปฏิทิน"));
});

test("new goals: seen %, weekly feature use, notice ≥ 3 days, feedback kinds", () => {
  const s = computeStats(
    raw({
      posts: [
        {
          id: "p1",
          type: "assignment",
          examKind: null,
          subject: "คณิตศาสตร์",
          authorId: "t",
          createdAt: "2026-11-10T03:00:00Z",
          hasFile: true,
          targets: [{ classroomId: "a", dueAt: "2026-11-15T16:59:00Z" }],
        },
        {
          id: "p2",
          type: "assignment",
          examKind: null,
          subject: "คณิตศาสตร์",
          authorId: "t",
          createdAt: "2026-11-10T03:00:00Z",
          hasFile: false,
          targets: [{ classroomId: "a", dueAt: "2026-11-11T03:00:00Z" }],
        },
      ],
      views: [
        {
          postId: "p1",
          classroomId: "a",
          type: "assignment",
          subject: "คณิตศาสตร์",
          createdAt: "2026-11-10T03:00:00Z",
          targeted: 40,
          seen: 30,
          seen24h: 20,
          fileOpeners: 10,
        },
        {
          postId: "p2",
          classroomId: "a",
          type: "assignment",
          subject: "คณิตศาสตร์",
          createdAt: "2026-11-10T03:00:00Z",
          targeted: 40,
          seen: 10,
          seen24h: 0,
          fileOpeners: 0,
        },
      ],
      usage: [
        { feature: "calendar", week: "2026-11-09", role: "student", classroomId: "a", users: 20, visits: 50 },
        { feature: "calendar", week: "2026-11-16", role: "student", classroomId: "a", users: 30, visits: 70 },
        { feature: null, week: "2026-11-09", role: "student", classroomId: "a", users: 22, visits: 60 },
        { feature: null, week: "2026-11-16", role: "student", classroomId: "a", users: 30, visits: 80 },
      ],
      feedback: [
        { id: "f1", at: "2026-11-10T03:00:00Z", message: "x", role: "student", kind: "bug" },
        { id: "f2", at: "2026-11-10T03:00:00Z", message: "y", role: "student", kind: "praise" },
      ],
    }),
  );
  assert.equal(s.seenPct, 50); // 40 of 80
  assert.equal(s.seen24hPct, 25);
  assert.equal(s.featureWeekly.calendar, 62.5); // avg 25 of 40 students
  assert.equal(s.notice3Pct, 50);
  assert.equal(s.postsWithFilePct, 50);
  assert.equal(s.subjectsCovered, 1);
  assert.equal(s.bugReports, 1);
  assert.equal(s.praisePct, 50);
  assert.equal(s.trackingSince, "2026-11-09");
});

test("weeklySeries: flow goals per week, sign-ups wound back to each week's end, snapshots only now", () => {
  const r = raw({
    roster: { studentsTotal: 80, studentsRegistered: 40, teachersTotal: 4, teachersRegistered: 4 },
    // 10 students signed up in the second week (Bangkok time: 2026-11-16 00:30 is still Sunday 15th in UTC).
    rosterSignups: [...Array(10)].map(() => ({ kind: "student" as const, at: "2026-11-15T17:30:00Z" })),
    posts: [
      {
        id: "p",
        type: "material",
        examKind: null,
        subject: null,
        authorId: "t",
        createdAt: "2026-11-17T03:00:00Z",
        hasFile: false,
        targets: [{ classroomId: "a", dueAt: null }],
      },
    ],
  });
  const s = weeklySeries(r, ["students_signed_up_pct", "posts_per_week", "students_with_target_pct"]);
  assert.deepEqual(
    s.students_signed_up_pct.map((p) => p.value),
    [37.5, 50],
  );
  assert.deepEqual(
    s.posts_per_week.map((p) => p.value),
    [0, 1],
  );
  assert.equal(s.students_with_target_pct[0].value, null);
  assert.equal(s.students_with_target_pct[1].value, 25);
  assert.equal(sliceWeek(r, "2026-11-16").posts.length, 1);
});

test("projection: reached, on course with a date, off course, no data", () => {
  const pts = (ys: (number | null)[]) => ys.map((value, i) => ({ week: ["2026-11-02", "2026-11-09", "2026-11-16", "2026-11-23"][i], value }));
  assert.deepEqual(projection(pts([50, 60, 70, 90]), 80), { state: "reached" });
  const on = projection(pts([10, 20, 30, 40]), 60);
  assert.equal(on.state, "on-course");
  assert.ok(on.state === "on-course" && on.weeksLeft === 2 && on.week === "2026-12-07");
  assert.deepEqual(projection(pts([40, 30, 20, 10]), 60), { state: "off-course" });
  assert.deepEqual(projection(pts([null, null]), 60), { state: "no-data" });
  // Lower is better: falling errors reach a ceiling of 2.
  assert.equal(projection(pts([10, 8, 6, 4]), 2, true).state, "on-course");
});

test("roomCompare hides TCAS/Roadmap groups under 3 and averages rooms with data", () => {
  const rows = roomCompare(
    raw({
      logins: [{ at: "2026-11-10T03:00:00Z", ok: true, userId: "s1", role: "student", classroomId: "a" }],
      roomTargets: { a: 8, b: null },
      roomRoadmaps: { a: null, b: null },
    }),
  );
  assert.equal(rows[0].values.signedUp, 100);
  assert.equal(rows[0].values.active, 2.5);
  assert.equal(rows[0].values.target, 20);
  assert.equal(rows[0].values.roadmap, null);
  assert.equal(rows[1].values.target, null);
  const a = roomAverage(rows);
  assert.equal(a.signedUp, 50);
  assert.equal(a.target, 20);
});

test("subjectCompare: posts, lead time, exams on clash days, seen %", () => {
  const exam = (subject: string, kind: "quiz" | "major") => ({
    type: "exam" as const,
    examKind: kind,
    subject,
    classroomId: "a",
    dueAt: "2026-11-12T02:00:00Z",
    createdAt: "2026-11-09T02:00:00Z",
  });
  const rows = subjectCompare(
    raw({
      dues: [exam("คณิตศาสตร์", "major"), exam("ภาษาไทย", "major"), exam("PAT", "quiz")],
      views: [
        {
          postId: "p",
          classroomId: "a",
          type: "exam",
          subject: "คณิตศาสตร์",
          createdAt: "2026-11-09T02:00:00Z",
          targeted: 40,
          seen: 40,
          seen24h: 30,
          fileOpeners: 0,
        },
      ],
    }),
  );
  const math = rows.find((r) => r.subject === "คณิตศาสตร์")!;
  assert.equal(math.clashExams, 1);
  assert.equal(math.seenPct, 100);
  assert.equal(rows.find((r) => r.subject === "PAT")!.clashExams, 1); // same clash day
  assert.equal(rows.find((r) => r.subject === "สังคมศึกษา")!.clashExams, 0);
});

test("featureUsage: most used first, unused features last", () => {
  const rows = featureUsage(
    raw({
      usage: [
        { feature: "roadmap", week: "2026-11-09", role: "student", classroomId: "a", users: 4, visits: 9 },
        { feature: "calendar", week: "2026-11-09", role: "student", classroomId: "a", users: 20, visits: 40 },
        { feature: "calendar", week: "2026-11-16", role: "student", classroomId: "a", users: 30, visits: 60 },
      ],
    }),
  );
  assert.equal(rows[0].key, "calendar");
  assert.equal(rows[0].pct, 62.5);
  assert.equal(rows[0].visits, 100);
  assert.ok(rows[0].trend! > 0);
  assert.equal(rows[1].key, "roadmap");
  assert.equal(rows.at(-1)!.pct, 0); // the log has data, nobody used it
});
