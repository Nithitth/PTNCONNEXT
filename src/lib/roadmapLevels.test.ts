import { test } from "node:test";
import assert from "node:assert/strict";
import { toRoadmapProgram, portfolioItems, type AnyBox, type RoadmapProgram } from "./roadmap";
import {
  REWARDS,
  STAGES,
  currentStreak,
  isUnlocked,
  nextStreak,
  pickFrame,
  universityTheme,
  stageOf,
  weightedExams,
  type LevelInput,
  type Proof,
} from "./roadmapLevels";
import type { Round3Option } from "./tcas";

const option: Round3Option = {
  position: 0,
  projectName: null,
  seats: 100,
  minGpax: 2.5,
  minTotal: 40,
  weights: { tgat: 50, tpat3: 50 },
  minimums: {},
  link: null,
  problem: null,
  extraConditions: false,
  lastYear: { min: 50, max: 80, seats: 100, applicants: 900 },
};
const program = toRoadmapProgram(
  { programId: "10010121300001A", groupField: "x", round1: [{ projectName: "A", portfolio: "", criteria: "" }], round3: [option] },
  0,
);
const bare: RoadmapProgram = { programId: "X", groupField: "", minGpax: null, weights: {}, hasRound3: false, round1: [] };

const box = (id: string, kind: AnyBox["kind"], data: unknown): AnyBox => ({ id, kind, title: "", sort: 0, data }) as AnyBox;
const proof = (step: string, p: Partial<Proof>): Proof => ({ id: step, step, kind: "file", value: null, url: null, hasFile: false, ...p });

const base = (extra: AnyBox[] = [], proofs: Proof[] = [], prog = program, opt: Round3Option | null = option): LevelInput => ({
  boxes: [box("a", "notes", { text: "" }), box("b", "notes", { text: "" }), box("c", "notes", { text: "" }), ...extra],
  program: prog,
  option: opt,
  proofs,
});

const stage2Boxes = [
  box("g", "goal", { title: "TGAT 70", target: 70, current: 0, deadline: null }),
  box("gp", "gpa", { terms: { m4t1: 3.2 } }),
  box("m", "motto", { text: "สู้" }),
];

test("stage 1 until there are 3 boxes", () => {
  const s = stageOf({ ...base(), boxes: [box("a", "notes", { text: "" })] }, 0);
  assert.equal(s.stage, 1);
  assert.equal(s.gates[1].find((g) => g.key === "boxes")!.progress, "1/3");
  assert.equal(stageOf(base(), 0).stage, 2);
});

test("stage 3 needs GPAX at the minimum and a grade-report file", () => {
  assert.equal(stageOf(base(stage2Boxes), 0).stage, 3);
  assert.equal(stageOf(base(stage2Boxes, [proof("gpax", { hasFile: true })]), 0).stage, 4);
  // GPAX below the 2.5 minimum blocks it even with proof.
  const low = [stage2Boxes[0], box("gp", "gpa", { terms: { m4t1: 2.1 } }), stage2Boxes[2]];
  assert.equal(stageOf(base(low, [proof("gpax", { hasFile: true })]), 0).stage, 3);
});

test("stage 4 needs half the portfolio and 2 activities with proof", () => {
  const items = portfolioItems(program).map((p) => p.key);
  const acts = box("act", "activities", {
    items: [
      { id: "a1", name: "ค่าย", type: "camp", date: null, note: "" },
      { id: "a2", name: "แข่ง", type: "contest", date: null, note: "" },
    ],
  });
  const proofs = [proof("gpax", { hasFile: true }), proof("act:a1", { kind: "link", url: "https://x" })];
  const s4 = stageOf(base([...stage2Boxes, acts, box("p", "portfolio", { done: [items[0]] })], proofs), 0);
  assert.equal(s4.stage, 4);
  assert.equal(s4.gates[4].find((g) => g.key === "activities")!.progress, "1/2");
  const s5 = stageOf(base([...stage2Boxes, acts, box("p", "portfolio", { done: [items[0]] })], [...proofs, proof("act:a2", { hasFile: true })]), 0);
  assert.equal(s5.stage, 5);
});

test("stage 5 needs exam quests, real scores and chance ≥ 3; stage 6 then needs apply quests and a link", () => {
  const items = portfolioItems(program).map((p) => p.key);
  const acts = box("act", "activities", { items: [{ id: "a1", name: "x", type: "camp", date: null, note: "" }, { id: "a2", name: "y", type: "camp", date: null, note: "" }] });
  const quests = (done: boolean) =>
    box("q", "quests", {
      items: ["exam:tgat", "exam:tpat3", "apply:r1", "apply:r3"].map((key) => ({ key, title: key, term: null, done, xp: 10 })),
    });
  const proofs = [proof("gpax", { hasFile: true }), proof("act:a1", { hasFile: true }), proof("act:a2", { hasFile: true })];
  const boxes = [...stage2Boxes, acts, box("p", "portfolio", { done: items })];
  assert.deepEqual(weightedExams(program), ["tgat", "tpat3"]);
  // Scores too low: total 45 → below last year's lowest (50) → not chance 3.
  const low = [...proofs, proof("score:tgat", { kind: "number", value: 45 }), proof("score:tpat3", { kind: "number", value: 45 })];
  assert.equal(stageOf(base([...boxes, quests(true)], low), 0).stage, 5);
  const good = [...proofs, proof("score:tgat", { kind: "number", value: 70 }), proof("score:tpat3", { kind: "number", value: 70 })];
  assert.equal(stageOf(base([...boxes, quests(false)], good), 0).stage, 5);
  const s6 = stageOf(base([...boxes, quests(true)], good), 0);
  assert.equal(s6.stage, 6);
  assert.equal(s6.finished, false);
  const done = stageOf(base([...boxes, quests(true)], [...good, proof("portfolio-link", { kind: "link", url: "https://drive" })]), 0);
  assert.ok(done.finished);
});

test("steps that don't apply (no Round 1 / no Round 3) count as done", () => {
  const s = stageOf(base(stage2Boxes, [proof("gpax", { hasFile: true })], bare, null), 0);
  assert.ok(s.gates[4].find((g) => g.key === "portfolio-half")!.na);
  assert.ok(s.gates[5].every((g) => g.done));
});

test("XP sub-levels and the gate wait", () => {
  const s = stageOf(base(), 0); // stage 2, needs 100 XP of stage 1 before it
  assert.equal(s.stage, 2);
  assert.equal(s.subLevel, 1);
  const mid = stageOf(base(), 100 + 75); // 75 of 150 in stage 2 → sub-level 3
  assert.equal(mid.subLevel, 3);
  const full = stageOf(base(), 100 + 400);
  assert.equal(full.subLevel, 5);
  assert.ok(full.gateWaiting);
  assert.equal(full.xpInStage, STAGES[1].xp);
});

test("weekly streak", () => {
  assert.deepEqual(nextStreak(null, 0, "2026-11-12"), { lastWeek: "2026-11-09", streak: 1 });
  assert.deepEqual(nextStreak("2026-11-09", 1, "2026-11-13"), { lastWeek: "2026-11-09", streak: 1 });
  assert.deepEqual(nextStreak("2026-11-09", 3, "2026-11-17"), { lastWeek: "2026-11-16", streak: 4 });
  assert.deepEqual(nextStreak("2026-11-02", 5, "2026-11-17"), { lastWeek: "2026-11-16", streak: 1 });
  assert.equal(currentStreak("2026-11-09", 3, "2026-11-20"), 3); // last week still counts this week
  assert.equal(currentStreak("2026-11-02", 3, "2026-11-20"), 0);
});

test("rewards unlock by highest stage and best streak, and stay", () => {
  const gold = REWARDS.find((r) => r.id === "gold")!;
  assert.ok(!isUnlocked(gold, 3, 0));
  assert.ok(isUnlocked(gold, 4, 0));
  assert.equal(pickFrame("gold", 3, 0), "glass");
  assert.equal(pickFrame("flame4", 1, 4), "flame4");
  assert.equal(pickFrame("nope", 6, 20), "glass");
});

test("the card face always follows the target university", () => {
  assert.equal(universityTheme("005"), "uni-005");
  assert.equal(universityTheme("999"), "classic");
});
