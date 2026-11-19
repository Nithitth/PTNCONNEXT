import { MORE_STATS } from "./testStats";
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  DEFAULT_ASSUMPTIONS,
  DEFAULT_OKRS,
  METRICS,
  change,
  cleanAssumptions,
  cleanOkrs,
  connextScore,
  formatDay,
  formatValue,
  krProgress,
  previousRange,
  rangeDays,
  resolveRange,
  scoreOkrs,
  statusOf,
  termStart,
  type ReportStats,
} from "./report";

const NOW = new Date("2026-11-19T05:00:00Z"); // Thursday 19 Nov 2026, 12:00 Thai time

test("resolveRange presets, custom ranges and the default", () => {
  assert.deepEqual(resolveRange({ preset: "week" }, NOW), { from: "2026-11-16", to: "2026-11-19", preset: "week" });
  assert.deepEqual(resolveRange({ preset: "month" }, NOW), { from: "2026-11-01", to: "2026-11-19", preset: "month" });
  assert.deepEqual(resolveRange({}, NOW), { from: "2026-11-01", to: "2026-11-19", preset: "term" });
  assert.equal(resolveRange({ preset: "all" }, NOW).from, "2026-11-10");
  // Swapped and future dates are fixed.
  assert.deepEqual(resolveRange({ from: "2026-12-30", to: "2026-11-02" }, NOW), { from: "2026-11-02", to: "2026-11-19", preset: "custom" });
  assert.equal(resolveRange({ from: "garbage", to: "2026-11-02" }, NOW).preset, "term");
});

test("termStart follows the Thai school year", () => {
  assert.equal(termStart("2026-06-15"), "2026-05-01");
  assert.equal(termStart("2026-11-19"), "2026-11-01");
  assert.equal(termStart("2027-02-03"), "2026-11-01");
});

test("previousRange is the same length just before", () => {
  const r = { from: "2026-11-16", to: "2026-11-19" };
  assert.deepEqual(previousRange(r), { from: "2026-11-12", to: "2026-11-15" });
  assert.equal(rangeDays(previousRange(r)), rangeDays(r));
});

test("krProgress for higher- and lower-is-better", () => {
  assert.equal(krProgress(45, 90), 0.5);
  assert.equal(krProgress(120, 90), 1);
  assert.equal(krProgress(null, 90), null);
  assert.equal(krProgress(3, 5, true), 1);
  assert.equal(krProgress(10, 5, true), 0.5);
  assert.equal(krProgress(4, 0, true), 0);
  assert.equal(statusOf(1), "on");
  assert.equal(statusOf(0.75), "close");
  assert.equal(statusOf(0.2), "behind");
  assert.equal(statusOf(null), "none");
});

const STATS: ReportStats = {
  ...MORE_STATS,
  studentsTotal: 100,
  studentsRegistered: 90,
  teachersTotal: 10,
  teachersRegistered: 9,
  accounts: 100,
  studentAccounts: 90,
  teacherAccounts: 10,
  signups: 5,
  activeUsers: 60,
  activeStudents: 55,
  weeklyActivePct: 30,
  logins: 100,
  loginSuccessPct: 97,
  posts: 40,
  postsPerWeek: 10,
  teachersPosting: 8,
  teachersPostingPct: 80,
  materials: 10,
  files: 6,
  driveFiles: 2,
  leadTimeDays: null,
  studentsWithTarget: 45,
  studentsWithTargetPct: 50,
  studentsWithRoadmap: 9,
  studentsWithRoadmapPct: 10,
  avgRoadmapStage: 1,
  errors: 2,
  errorsPerWeek: 1,
  feedback: 3,
  driveTeachers: 2,
  driveTeachersPct: 20,
};

test("scoreOkrs and the Connext Score skip what can't be measured", () => {
  const scored = scoreOkrs(DEFAULT_OKRS, STATS, null);
  const o2 = scored[1];
  assert.equal(o2.keyResults[2].status, "none"); // lead time: no data
  assert.equal(o2.progress, (1 + 0.5) / 2); // 80/80 and 10/20
  const o4 = scored[3];
  assert.equal(o4.progress, 1);
  const score = connextScore(scored)!;
  assert.ok(score > 0 && score <= 100);
  assert.equal(connextScore([]), null);
});

test("change gives ▲/▼ percentages", () => {
  assert.equal(change(150, 100), 50);
  assert.equal(change(50, 100), -50);
  assert.equal(change(5, 0), null);
  assert.equal(change(0, 0), 0);
  assert.equal(change(null, 3), null);
});

test("cleanOkrs keeps good input and refuses bad input", () => {
  const ok = cleanOkrs(DEFAULT_OKRS);
  assert.ok("okrs" in ok && ok.okrs.length === 4);
  assert.ok("error" in cleanOkrs([]));
  assert.ok("error" in cleanOkrs([{ objective: "x", keyResults: [{ metric: "nope", target: 1 }] }]));
  assert.ok("error" in cleanOkrs([{ objective: "x", keyResults: [{ metric: "posts_per_week", target: -1 }] }]));
  assert.ok("error" in cleanOkrs([{ objective: "", keyResults: [{ metric: "posts_per_week", target: 1 }] }]));
  const filled = cleanOkrs([{ objective: "  เป้า  ", keyResults: [{ metric: "posts_per_week", target: "12" }] }]);
  assert.ok("okrs" in filled);
  if ("okrs" in filled) {
    assert.equal(filled.okrs[0].objective, "เป้า");
    assert.equal(filled.okrs[0].keyResults[0].label, "โพสต์ต่อสัปดาห์"); // label falls back to the metric's
    assert.equal(filled.okrs[0].keyResults[0].target, 12);
  }
});

test("every default key result uses a known metric", () => {
  const keys = new Set(METRICS.map((m) => m.key));
  for (const o of DEFAULT_OKRS) for (const k of o.keyResults) assert.ok(keys.has(k.metric), k.metric);
});

test("cleanAssumptions checks ranges", () => {
  assert.deepEqual(cleanAssumptions(DEFAULT_ASSUMPTIONS), { assumptions: DEFAULT_ASSUMPTIONS });
  assert.ok("error" in cleanAssumptions({ ...DEFAULT_ASSUMPTIONS, bahtPerPage: 99 }));
  assert.ok("error" in cleanAssumptions({ ...DEFAULT_ASSUMPTIONS, classSize: "x" }));
});

test("formatting in Thai (พ.ศ.) and English", () => {
  assert.equal(formatDay("2026-11-19", "th"), "19 พ.ย. 2569");
  assert.equal(formatDay("2026-11-19", "en"), "19 Nov 2026");
  assert.equal(formatValue(72.4, "pct", "th"), "72%");
  assert.equal(formatValue(5.25, "days", "en"), "5.3 days");
  assert.equal(formatValue(null, "count", "th"), "—");
});
