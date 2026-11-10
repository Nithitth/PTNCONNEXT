import { test } from "node:test";
import assert from "node:assert/strict";
import { diffPrograms, normalizeProgram, parseRounds, type RawCourse, type RawRound } from "./tcasSource";

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

test("diffPrograms finds added, changed and removed", () => {
  const live = new Map([["A", "1"], ["B", "1"]]);
  const staged = new Map([["B", "2"], ["C", "1"]]);
  assert.deepEqual(diffPrograms(live, staged), { added: ["C"], changed: ["B"], removed: ["A"] });
});
