import { test } from "node:test";
import assert from "node:assert/strict";
import {
  BOX_KINDS,
  BOX_MAX_ITEMS,
  cleanBoxData,
  cleanBoxTitle,
  currentTerm,
  isDayKey,
  levelOf,
  mergeQuests,
  newBoxData,
  portfolioItems,
  scoreRoadmap,
  suggestedQuests,
  toRoadmapProgram,
  weekStart,
  type AnyBox,
  type RoadmapProgram,
} from "./roadmap";
import type { Round3Option } from "./tcas";

const option: Round3Option = {
  position: 0,
  projectName: null,
  seats: 250,
  minGpax: 2.5,
  minTotal: 51,
  weights: { tgat: 20, tpat3: 30, a_lv_61: 20, a_lv_64: 20, a_lv_65: 10 },
  minimums: { gpax: 2 },
  link: null,
  problem: null,
  extraConditions: false,
  lastYear: { min: 50, max: 80, seats: 250, applicants: 3000 },
};

const engineering = toRoadmapProgram(
  {
    programId: "10010121300001A",
    groupField: "วิศวกรรมศาสตร์",
    round1: [{ projectName: "ช้างเผือก", portfolio: "พอร์ต 10 หน้า", criteria: "GPAX 3.00" }],
    round3: [option],
  },
  0,
);

const bare: RoadmapProgram = { programId: "X", groupField: "", minGpax: null, weights: {}, hasRound3: false, round1: [] };
const today = "2026-11-12";
const box = <K extends AnyBox["kind"]>(id: string, kind: K, data: unknown): AnyBox => ({ id, kind, title: "", sort: 0, data }) as AnyBox;

test("currentTerm: May–Oct is term 1, Nov–Apr term 2, only ม.4–6", () => {
  assert.equal(currentTerm(5, new Date("2026-11-01T00:00:00+07:00")), "m5t2");
  assert.equal(currentTerm(5, new Date("2026-10-31T23:59:00+07:00")), "m5t1");
  assert.equal(currentTerm(4, new Date("2026-05-01T00:00:00+07:00")), "m4t1");
  assert.equal(currentTerm(4, new Date("2027-03-10T12:00:00+07:00")), "m4t2");
  assert.equal(currentTerm(3, new Date()), null);
  assert.equal(currentTerm(null, new Date()), null);
});

test("weekStart is the Monday", () => {
  assert.equal(weekStart("2026-11-12"), "2026-11-09"); // Thursday
  assert.equal(weekStart("2026-11-15"), "2026-11-09"); // Sunday
  assert.equal(weekStart("2026-11-09"), "2026-11-09");
});

test("isDayKey rejects impossible dates", () => {
  assert.ok(isDayKey("2026-02-28"));
  assert.ok(!isDayKey("2026-02-30"));
  assert.ok(!isDayKey("12/11/2026"));
});

test("toRoadmapProgram takes the min GPAX and weights of the chosen option", () => {
  assert.equal(engineering.minGpax, 2.5);
  assert.equal(engineering.weights.tpat3, 30);
  assert.ok(engineering.hasRound3);
});

test("suggested quests: biggest exam first, register, apply, gpax; templates by field group", () => {
  const q = suggestedQuests(engineering, [
    { id: 7, groupField: "วิศวกรรมศาสตร์", term: "m5t1", title: "เข้าค่ายวิศวะ", xp: 30 },
    { id: 8, groupField: "แพทยศาสตร์", term: "m5t1", title: "ค่ายหมอ", xp: 20 },
  ]);
  const keys = q.map((x) => x.key);
  assert.equal(keys[0], "gpax");
  assert.equal(keys[1], "exam:tpat3");
  assert.ok(keys.includes("register:exams") && keys.includes("apply:r1") && keys.includes("apply:r3"));
  assert.ok(keys.includes("tpl:7") && !keys.includes("tpl:8"));
  assert.equal(q.find((x) => x.key === "tpl:7")!.xp, 30);
  assert.equal(q.find((x) => x.key === "apply:r3")!.xp, 20);
});

test("a program with no Round 1 and no Round 3 still builds every box", () => {
  assert.deepEqual(suggestedQuests(bare), []);
  assert.deepEqual(portfolioItems(bare), []);
  for (const kind of BOX_KINDS) {
    const d = newBoxData(kind, bare, { today });
    assert.notEqual(cleanBoxData(kind, d), null, `${kind} starting data must be valid`);
  }
});

test("every box's starting data for a real program passes validation", () => {
  for (const kind of BOX_KINDS) {
    const d = newBoxData(kind, engineering, { today, mytcasUrl: "https://course.mytcas.com/programs/10010121300001A" });
    assert.notEqual(cleanBoxData(kind, d), null, kind);
  }
});

test("quest and portfolio keys are stable when the target changes", () => {
  const other = toRoadmapProgram(
    { programId: "B", groupField: "", round1: [{ projectName: "ช้างเผือก", portfolio: "", criteria: "" }], round3: [option] },
    0,
  );
  assert.deepEqual(
    portfolioItems(engineering).map((p) => p.key),
    portfolioItems(other).map((p) => p.key),
  );
  const ticked = suggestedQuests(engineering).map((q) => (q.key === "exam:tpat3" ? { ...q, done: true } : q));
  const merged = mergeQuests(ticked, suggestedQuests(other));
  assert.equal(merged.filter((q) => q.key === "exam:tpat3").length, 1);
  assert.ok(merged.find((q) => q.key === "exam:tpat3")!.done);
});

test("mergeQuests keeps own items and never goes past the item limit", () => {
  const own = Array.from({ length: BOX_MAX_ITEMS }, (_, i) => ({ key: `own:a${i}`, title: "x", term: null, done: false, xp: 10 }));
  assert.equal(mergeQuests(own, suggestedQuests(engineering)).length, BOX_MAX_ITEMS);
});

test("cleanBoxData rejects bad data", () => {
  assert.equal(cleanBoxData("gpa", { terms: { m4t1: 4.5 } }), null);
  assert.equal(cleanBoxData("gpa", { terms: { m4t1: Number.NaN } }), null);
  assert.equal(cleanBoxData("gpa", { terms: { m6t2: 3 } }), null);
  assert.equal(cleanBoxData("gpa", { terms: { m4t1: "3" } }), null);
  assert.deepEqual(cleanBoxData("gpa", { terms: { m4t1: 3.456 } }), { terms: { m4t1: 3.46 } });
  assert.equal(cleanBoxData("notes", { text: "ก".repeat(2001) }), null);
  assert.equal(cleanBoxData("notes", "hello"), null);
  assert.equal(cleanBoxData("links", { items: [{ id: "a", title: "x", url: "javascript:alert(1)" }] }), null);
  assert.equal(cleanBoxData("links", { items: [{ id: "a", title: "x", url: "ftp://x.com" }] }), null);
  assert.ok(cleanBoxData("links", { items: [{ id: "a", title: "x", url: "https://youtube.com" }] }));
  assert.equal(cleanBoxData("quests", { items: [{ key: "hack:1", title: "x", done: true }] }), null);
  assert.equal(
    cleanBoxData("quests", { items: Array.from({ length: 21 }, (_, i) => ({ key: `own:a${i}`, title: "x", done: false })) }),
    null,
  );
  assert.equal(
    cleanBoxData("quests", {
      items: [
        { key: "own:a", title: "x", done: false },
        { key: "own:a", title: "y", done: false },
      ],
    }),
    null,
  );
  assert.equal(cleanBoxData("goal", { title: "x", target: -1, current: 0, deadline: null }), null);
  assert.equal(cleanBoxData("goal", { title: "x", target: 10, current: 0, deadline: "2026-13-01" }), null);
  assert.equal(cleanBoxData("study", { week: null, slots: [{ id: "a", day: 7, subject: "x", minutes: 30, done: false }] }), null);
  assert.equal(cleanBoxData("skills", { items: [{ id: "a", name: "x", start: 0, now: 3 }] }), null);
  assert.equal(cleanBoxData("backup", { programIds: ["A1234567890", "B1234567890", "C1234567890", "D1234567890"] }), null);
  assert.equal(cleanBoxData("activities", { items: [{ id: "a", name: "x", type: "party", date: null, note: "" }] }), null);
});

test("quest XP can't be inflated from the browser", () => {
  const d = cleanBoxData("quests", { items: [{ key: "own:a", title: "x", done: true, xp: 999 }, { key: "tpl:3", title: "y", done: true, xp: 50 }] });
  assert.deepEqual(
    d!.items.map((x) => x.xp),
    [10, 10],
  );
});

test("cleanBoxTitle falls back to the preset name", () => {
  assert.equal(cleanBoxTitle("goal", ""), "เป้าหมาย");
  assert.equal(cleanBoxTitle("goal", "  เป้า TGAT  "), "เป้า TGAT");
  assert.equal(cleanBoxTitle("goal", "x".repeat(61)), null);
});

test("levels every 50 XP", () => {
  assert.equal(levelOf(0), 1);
  assert.equal(levelOf(49), 1);
  assert.equal(levelOf(50), 2);
  assert.equal(levelOf(250), 6);
});

test("XP: GPA, portfolio, goal, scores and badges", () => {
  const p = portfolioItems(engineering).map((x) => x.key);
  const s = scoreRoadmap(
    [
      box("g", "gpa", { terms: { m4t1: 3.2, m4t2: 3.4 } }), // 20 + 20 (≥ 2.5)
      box("p", "portfolio", { done: p }), // 2 × 20
      box("goal", "goal", { title: "x", target: 3, current: 3.1, deadline: null }), // 30
      box("sc", "scores", {}), // chance 4 → 20
    ],
    { program: engineering, chance: 4, today },
  );
  assert.equal(s.xp, 40 + 40 + 30 + 20);
  assert.equal(s.level, 3);
  const earned = new Set(s.badges.filter((b) => b.earned).map((b) => b.key));
  for (const k of ["first", "goal", "goal-done", "exam", "portfolio"]) assert.ok(earned.has(k), k);
  assert.ok(!earned.has("activities") && !earned.has("full"));
});

test("typed XP is capped at 40% of the total (with a 30 XP floor)", () => {
  const ownQuests = Array.from({ length: 20 }, (_, i) => ({ key: `own:a${i}`, title: "x", term: null, done: true, xp: 10 }));
  // Only typed XP: floor of 30 counts.
  const alone = scoreRoadmap([box("q", "quests", { items: ownQuests })], { program: bare, chance: null, today });
  assert.equal(alone.xp, 30);
  assert.equal(alone.cappedXp, 170);
  // With 150 program-driven XP, typed may add up to 100 (100 / 250 = 40%).
  const p = portfolioItems(engineering).map((x) => x.key);
  const mixed = scoreRoadmap(
    [
      box("q", "quests", { items: ownQuests }),
      box("p", "portfolio", { done: p }), // 40
      box("g", "gpa", { terms: { m4t1: 3, m4t2: 3, m5t1: 3, m5t2: 3, m6t1: 3 } }), // 50 + 20
      box("goal", "goal", { title: "x", target: 1, current: 1, deadline: null }), // 30
      box("m", "motto", { text: "สู้ ๆ" }), // 10
    ],
    { program: engineering, chance: null, today },
  );
  assert.equal(mixed.xp, 150 + 100);
  assert.ok(mixed.xp * 0.4 >= mixed.xp - 150);
});

test("study ticks from an older week don't count", () => {
  const slots = [{ id: "a", day: 1, subject: "TGAT", minutes: 60, done: true }];
  const thisWeek = scoreRoadmap([box("s", "study", { week: "2026-11-09", slots })], { program: bare, chance: null, today });
  const lastWeek = scoreRoadmap([box("s", "study", { week: "2026-11-02", slots })], { program: bare, chance: null, today });
  assert.equal(thisWeek.xp, 5);
  assert.equal(lastWeek.xp, 0);
});

test("portfolio ticks for another program's projects give no XP", () => {
  const s = scoreRoadmap([box("p", "portfolio", { done: ["r1:zzz:read"] })], { program: engineering, chance: null, today });
  assert.equal(s.xp, 0);
});
