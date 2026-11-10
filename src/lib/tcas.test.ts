import { test } from "node:test";
import assert from "node:assert/strict";
import {
  calculate,
  checkRound3,
  cleanScores,
  cleanSearch,
  examInfo,
  pickOption,
  toRound3Option,
  type Round3Option,
} from "./tcas";

// จุฬาฯ วิศวกรรมศาสตร์ (TCAS70 round 3), from the real data
const chula: Round3Option = {
  position: 0,
  projectName: null,
  seats: 250,
  minGpax: 2,
  minTotal: 51,
  weights: { tgat: 20, tpat3: 30, a_lv_61: 20, a_lv_64: 20, a_lv_65: 10 },
  minimums: { gpax: 2 },
  link: null,
  problem: null,
  extraConditions: false,
};

test("weighted total and gap", () => {
  const r = calculate(chula, { tgat: 62, tpat3: 30, a_lv_61: 70, a_lv_64: 40, a_lv_65: 50, gpax: 3 });
  assert.equal(r.total, 48.4);
  assert.equal(r.gap, 2.6);
  assert.equal(r.passesTotal, false);
  assert.deepEqual(r.hint, { code: "tpat3", points: 9 });
});

test("passing total has no gap or hint", () => {
  const r = calculate(chula, { tgat: 62, tpat3: 48, a_lv_61: 70, a_lv_64: 40, a_lv_65: 50, gpax: 3 });
  assert.equal(r.total, 53.8);
  assert.equal(r.gap, 0);
  assert.equal(r.passesTotal, true);
  assert.equal(r.hint, null);
});

test("GPAX counts on a 4-point scale (x25)", () => {
  const o = { ...chula, minTotal: 60, weights: { gpax: 20, a_lv_82: 80 }, minimums: {} };
  const r = calculate(o, { gpax: 3, a_lv_82: 50 });
  assert.equal(r.total, 55);
  assert.deepEqual(r.hint, { code: "a_lv_82", points: 7 });
});

test("a GPA hint is given on the 4-point scale", () => {
  const o = { ...chula, minGpax: null, minTotal: 80, weights: { gpax: 100 }, minimums: {} };
  const r = calculate(o, { gpax: 3 }); // 75 of 100, needs 5 more = 0.2 GPAX
  assert.equal(r.total, 75);
  assert.deepEqual(r.hint, { code: "gpax", points: 0.2 });
});

test("per-exam minimums are reported once each", () => {
  const r = calculate({ ...chula, minimums: { gpax: 2, tpat3: 40 } }, { tpat3: 30, gpax: 1.5 });
  assert.deepEqual([...r.failedMinimums].sort(), ["gpax", "tpat3"]);
});

test("hint skips an exam that can't cover the gap alone", () => {
  const r = calculate({ ...chula, minTotal: 90 }, { tgat: 100, tpat3: 95, a_lv_61: 100, a_lv_64: 0, a_lv_65: 100, gpax: 3 });
  assert.equal(r.total, 78.5);
  assert.equal(r.gap, 11.5);
  assert.deepEqual(r.hint, { code: "a_lv_64", points: 58 }); // tpat3 needs 39 but has 5 left; tgat/a_lv_61 are full
});

test("no minimum total means it passes", () => {
  const r = calculate({ ...chula, minTotal: null }, { tgat: 10 });
  assert.equal(r.gap, 0);
  assert.equal(r.passesTotal, true);
});

test("unsupported formulas are flagged", () => {
  assert.equal(checkRound3({ tgat: 50, a_lv_82: 50 }), null);
  assert.equal(checkRound3({ tgat: 50, gpa22: 50 }), null);
  assert.ok(checkRound3({ tgat: 50, cal_score_sum: 51 }));
  assert.ok(checkRound3({ tgat: 50, tu002: 50 }));
  assert.ok(checkRound3({ tgat: 40, a_lv_82: 50 })); // sums to 90
  assert.ok(checkRound3({})); // no weights
});

test("conditions the calculator can't check don't block it", () => {
  // Real Mahidol data: complete weights, plus a combined-score rule and English-test alternatives.
  assert.equal(checkRound3({ tgat: 100 }), null);
  const row = {
    position: 0, project_name: null, seats: 5, min_gpax: 3, min_total: null,
    weights: { tgat: 100 }, link: null, problem: null,
  };
  assert.equal(toRound3Option({ ...row, conditions: { min_gpax: 3, score_condition: 2, score_minimum: 250 } }).extraConditions, true);
  assert.equal(toRound3Option({ ...row, conditions: { min_vnet_51: 30 } }).extraConditions, true);
  assert.equal(toRound3Option({ ...row, conditions: { min_gpax: 3, min_tgat: 30 } }).extraConditions, false);
  // Unknown conditions never become minimums the calculator checks.
  assert.deepEqual(toRound3Option({ ...row, conditions: { min_gpax: 3, min_ielts: 5 } }).minimums, { gpax: 3 });
});

test("toRound3Option strips min_ prefixes", () => {
  const o = toRound3Option({
    position: 1,
    project_name: "x",
    seats: 5,
    min_gpax: 2,
    min_total: 51,
    weights: { tgat: 100 },
    conditions: { min_gpax: 2, min_tpat3: 40 },
    link: null,
    problem: null,
  });
  assert.deepEqual(o.minimums, { gpax: 2, tpat3: 40 });
  assert.equal(o.position, 1);
  assert.equal(o.minTotal, 51);
  assert.equal(o.projectName, "x");
});

test("cleanScores drops unknown codes and rejects out-of-range values", () => {
  assert.deepEqual(cleanScores(chula, { tgat: 50, hack: 3 }), { tgat: 50 });
  assert.equal(cleanScores(chula, { tgat: 101 }), null);
  assert.equal(cleanScores(chula, { tgat: -1 }), null);
  assert.equal(cleanScores(chula, { gpax: 4.5 }), null);
  assert.equal(cleanScores(chula, { tgat: Number.NaN }), null);
  assert.equal(cleanScores(chula, { tgat: "50" }), null);
  assert.equal(cleanScores(chula, "x"), null);
  assert.equal(cleanScores(chula, null), null);
});

test("pickOption falls back to the first option", () => {
  const second = { ...chula, position: 1 };
  assert.equal(pickOption([chula, second], 1), second);
  assert.equal(pickOption([chula], 3), chula);
  assert.equal(pickOption([], 0), null);
});

test("cleanSearch removes filter-breaking characters", () => {
  assert.equal(cleanSearch(" วิศวะ,(จุฬา)%* "), "วิศวะ จุฬา");
  assert.equal(cleanSearch("a.b\\c"), "a b c");
  assert.equal(cleanSearch("x".repeat(100)).length, 60);
});

test("exam labels and scales", () => {
  assert.equal(examInfo("tpat3")?.max, 100);
  assert.equal(examInfo("gpax")?.max, 4);
  assert.equal(examInfo("gpa28")?.max, 4);
  assert.match(examInfo("a_lv_64")!.label, /ฟิสิกส์/);
  assert.equal(examInfo("tu002"), null);
});
