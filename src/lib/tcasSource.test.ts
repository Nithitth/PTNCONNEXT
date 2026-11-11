import { test } from "node:test";
import assert from "node:assert/strict";
import {
  diffPrograms,
  groupLastYear,
  matchLastYear,
  parseMinMaxRows,
  type LastYearRow,
  mapLimit, normalizeProgram, parseRounds, roundsFromResponse, uniqueCourses, type RawCourse, type RawRound } from "./tcasSource";

const course: RawCourse = {
  program_id: "10010121300001A",
  university_id: "001",
  university_name_th: "จุฬาลงกรณ์มหาวิทยาลัย",
  campus_name_th: "วิทยาเขตหลัก",
  faculty_name_th: "คณะวิศวกรรมศาสตร์",
  group_field_th: "วิศวกรรมศาสตร์",
  field_name_th: "วิศวกรรมทั่วไป",
  program_name_th: "หลักสูตรวิศวกรรมศาสตรบัณฑิต สาขาวิชาวิศวกรรมศาสตร์",
  program_name_en: "Bachelor of Engineering Program",
  program_type_name_th: "ภาษาไทย ปกติ",
  cost: "ภาคการศึกษาละ 25,500 บาท",
  updated_at: "2026-10-15T19:09:10.634Z",
};

const rounds: RawRound[] = [
  {
    type: "1_2570",
    project_name_th: "โครงการคณิตศาสตร์และวิทยาศาสตร์",
    receive_student_number: 200,
    folio: { folio_q2: "ข้อสอง", folio_q1: "ข้อหนึ่ง", folio_q1_type: "C", folio_q2_type: "C" },
    criteria: "เกณฑ์",
    link: "https://admission.chula.ac.th",
  },
  { type: "1_2570", project_name_th: "โครงการกีฬา", receive_student_number: 2 },
  { type: "2_2570", project_name_th: "โควตา", receive_student_number: 28 },
  {
    type: "3_2570",
    receive_student_number: 250,
    min_gpax: 2,
    min_total_score: 51,
    scores: { tgat: 20, tpat3: 30, a_lv_61: 20, a_lv_64: 20, a_lv_65: 10 },
    score_conditions: { min_gpax: 2 },
    link: "https://admission.chula.ac.th",
  },
  { type: "3_2570", project_name_th: "แบบพิเศษ", receive_student_number: 5, scores: { tgat: 50, cal_score_sum: 51 } },
  { type: "3_2569", receive_student_number: 999, scores: { tgat: 100 } },
];

test("parseRounds returns [] for anything that isn't a JSON array", () => {
  assert.deepEqual(parseRounds('<?xml version="1.0"?><Error><Code>AccessDenied</Code></Error>'), []);
  assert.deepEqual(parseRounds('{"a":1}'), []);
  assert.deepEqual(parseRounds(""), []);
  assert.deepEqual(parseRounds('[{"type":"3_2570"}]'), [{ type: "3_2570" }]);
});

test("roundsFromResponse: missing file means no rounds, a throttled or broken server stops the pull", () => {
  assert.deepEqual(roundsFromResponse(200, '[{"type":"3_2570"}]'), [{ type: "3_2570" }]);
  assert.deepEqual(roundsFromResponse(403, "<Error/>"), []);
  assert.deepEqual(roundsFromResponse(404, "<Error/>"), []);
  assert.throws(() => roundsFromResponse(429, ""), /429/);
  assert.throws(() => roundsFromResponse(500, ""), /500/);
  assert.throws(() => roundsFromResponse(503, "<Error><Code>SlowDown</Code></Error>"), /503/);
});

test("normalizeProgram keeps round 1 and round 3 of the TCAS year only", () => {
  const n = normalizeProgram(course, rounds);
  assert.equal(n.round1.length, 2);
  assert.equal(n.round3.length, 2);
  assert.equal(n.program.round1_seats, 202);
  assert.equal(n.program.round3_seats, 255);
  assert.equal(n.program.tcas_year, 2570);
  assert.equal(n.program.name_th, course.program_name_th);
  assert.equal(n.program.group_field, "วิศวกรรมศาสตร์");
});

test("portfolio questions are joined in order", () => {
  const n = normalizeProgram(course, rounds);
  assert.equal(n.round1[0].portfolio, "ข้อหนึ่ง\n\nข้อสอง");
  assert.equal(n.round1[0].criteria, "เกณฑ์");
  assert.equal(n.round1[1].portfolio, "");
});

test("criteria are read from inside folio too (real TCAS shape)", () => {
  const n = normalizeProgram(course, [
    { type: "1_2570", folio: { folio_q1: "ข้อหนึ่ง", closed_date: "2026-11-12T00:00:00.000Z", criteria: "เกณฑ์ใน folio" } },
  ]);
  assert.equal(n.round1[0].criteria, "เกณฑ์ใน folio");
  assert.equal(n.round1[0].portfolio, "ข้อหนึ่ง");
});

test("round 3 options keep their order, numbers and problems", () => {
  const [a, b] = normalizeProgram(course, rounds).round3;
  assert.equal(a.position, 0);
  assert.equal(b.position, 1);
  assert.equal(a.min_total, 51);
  assert.equal(a.min_gpax, 2);
  assert.deepEqual(a.weights, { tgat: 20, tpat3: 30, a_lv_61: 20, a_lv_64: 20, a_lv_65: 10 });
  assert.deepEqual(a.conditions, { min_gpax: 2 });
  assert.equal(a.problem, null);
  assert.equal(b.project_name, "แบบพิเศษ");
  assert.ok(b.problem);
  assert.equal(b.min_total, null);
});

test("no rounds at all still gives a program", () => {
  const n = normalizeProgram(course, []);
  assert.equal(n.program.round1_seats, null);
  assert.equal(n.program.round3_seats, null);
  assert.deepEqual(n.round3, []);
});

test("fingerprint is stable and notices changes", () => {
  const a = normalizeProgram(course, rounds).fingerprint;
  const reordered = rounds.map((r) => Object.fromEntries(Object.entries(r).reverse()) as RawRound);
  assert.equal(normalizeProgram(course, reordered).fingerprint, a);
  assert.equal(normalizeProgram({ ...course, updated_at: "2027-01-01T00:00:00Z" }, rounds).fingerprint, a);
  const changed = rounds.map((r) => (r.type === "3_2570" && r.min_total_score ? { ...r, min_total_score: 55 } : r));
  assert.notEqual(normalizeProgram(course, changed).fingerprint, a);
});

test("mapLimit keeps order and never runs more than the limit at once", async () => {
  let running = 0;
  let peak = 0;
  const out = await mapLimit([5, 1, 4, 2, 3, 0], 2, async (n) => {
    running++;
    peak = Math.max(peak, running);
    await new Promise((r) => setTimeout(r, n));
    running--;
    return n * 10;
  });
  assert.deepEqual(out, [50, 10, 40, 20, 30, 0]);
  assert.equal(peak, 2);
});

test("mapLimit stops with the first error", async () => {
  await assert.rejects(
    mapLimit([1, 2, 3], 2, async (n) => {
      if (n === 2) throw new Error("boom");
      return n;
    }),
    /boom/,
  );
});

test("uniqueCourses keeps the first entry of a program listed twice", () => {
  const twice = [course, { ...course, field_name_th: "ซ้ำ" }, { ...course, program_id: "X1" }];
  const out = uniqueCourses(twice);
  assert.deepEqual(out.map((c) => c.program_id), [course.program_id, "X1"]);
  assert.equal(out[0].field_name_th, course.field_name_th);
});

// The real TCAS69 min/max sheet header (first 15 columns + a DS column).
const HEADER = ["สถาบัน", "วิทยาเขต", "รหัสหลักสูตร", "รหัสสาขา", "รหัสโครงการ", "คณะ", "หลักสูตร", "รายละเอียด", "สาขา/วิชาเอก", "รหัสรับร่วม", "รับ", "สมัคร", "ผ่าน", "คะแนนสูงสุด", "คะแนนต่ำสุด", "คะแนนต่ำสุด DS"];
const chulaRow = ["จุฬาฯ", "วิทยาเขตหลัก", "10010121300001A", null, null, "วิศวะ", "หลักสูตร", null, null, null, 305, 857, 305, 80.2664, 54.6525, 54.1697];

test("parseMinMaxRows finds columns by header text and skips rows without scores", () => {
  const rows = parseMinMaxRows([["รายงาน TCAS69"], HEADER, chulaRow, ["x", "y", "123", null, null, "f", "p", null, null, null, 5, 9, 0, null, null, null]]);
  assert.deepEqual(rows, [{ programId: "10010121300001A", majorId: null, projectId: null, seats: 305, applicants: 857, max: 80.2664, min: 54.6525 }]);
});

test("parseMinMaxRows skips rows with a 0 score (nobody admitted in that project)", () => {
  const empty = [...chulaRow];
  empty[13] = 0;
  empty[14] = 0;
  assert.deepEqual(parseMinMaxRows([HEADER, empty]), []);
});

test("parseMinMaxRows works when the columns are reordered", () => {
  const order = [14, 13, 2, 11, 10, 3, 4];
  const rows = parseMinMaxRows([order.map((i) => HEADER[i]), order.map((i) => chulaRow[i])]);
  assert.equal(rows[0].min, 54.6525);
  assert.equal(rows[0].applicants, 857);
});

test("parseMinMaxRows returns [] without the program-code header", () => {
  assert.deepEqual(parseMinMaxRows([["a", "b"], [1, 2]]), []);
});

const ly = (over: Partial<LastYearRow>): LastYearRow => ({
  programId: "P1", majorId: null, projectId: null, seats: 10, applicants: 50, max: 80, min: 60, ...over,
});

test("matchLastYear: single row, exact project/major, aggregate, none", () => {
  const map = groupLastYear([ly({}), ly({ programId: "P2", projectId: "A", min: 50, max: 70 }), ly({ programId: "P2", projectId: "B", min: 40, max: 90, seats: 5, applicants: 20 })]);
  assert.deepEqual(matchLastYear("P1", { project_id: null, major_id: null }, map), { min: 60, max: 80, seats: 10, applicants: 50 });
  assert.deepEqual(matchLastYear("P2", { project_id: "B", major_id: null }, map), { min: 40, max: 90, seats: 5, applicants: 20 });
  assert.deepEqual(matchLastYear("P2", { project_id: "Z", major_id: null }, map), { min: 40, max: 90, seats: 15, applicants: 70 });
  assert.equal(matchLastYear("NOPE", { project_id: null, major_id: null }, map), null);
});

test("normalizeProgram adds last year's scores to options and the program", () => {
  const map = groupLastYear([ly({ programId: course.program_id, min: 54.65, max: 80.27, seats: 305, applicants: 857 })]);
  const n = normalizeProgram(course, rounds, 2570, map);
  assert.equal(n.round3[0].last_min, 54.65);
  assert.equal(n.round3[0].last_applicants, 857);
  assert.equal(n.program.last_max, 80.27);
  assert.equal(normalizeProgram(course, rounds).program.last_min, null);
});

test("diffPrograms finds added, changed and removed", () => {
  const live = new Map([["A", "1"], ["B", "1"]]);
  const staged = new Map([["B", "2"], ["C", "1"]]);
  assert.deepEqual(diffPrograms(live, staged), { added: ["C"], changed: ["B"], removed: ["A"] });
});
