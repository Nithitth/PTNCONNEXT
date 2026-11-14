// Roadmap stages: the 6 real readiness stages, their gates, XP sub-levels, weekly streaks and rewards.
// Pure (no I/O), shared by server and browser, tested in roadmapLevels.test.ts.
// Design: docs/specs/2026-11-13-roadmap-levels-design.md
import { addDays, type DayKey } from "./calendar";
import {
  latestGpax,
  portfolioItems,
  weekStart,
  type AnyBox,
  type BoxData,
  type RoadmapProgram,
} from "./roadmap";
import { TCAS_UNIVERSITIES, calculate, examInfo, type Round3Option } from "./tcas";

// ─── Proof ───────────────────────────────────────────────────

/**
 * Evidence a student attaches to a gate step. `step` says which one:
 * "gpax" (grade report) · "act:<activityId>" · "score:<examCode>" · "portfolio-link".
 */
export type Proof = {
  id: string;
  step: string;
  kind: "file" | "link" | "number";
  value: number | null;
  url: string | null;
  hasFile: boolean;
};

export const PROOF_STEP = /^(gpax|portfolio-link|act:[a-z0-9]{1,16}|score:[a-z0-9_]{1,20})$/;
/** Private storage bucket for proof photos/PDFs, under <uid>/… */
export const PROOF_BUCKET = "roadmap-proofs";
export const PROOF_MAX_BYTES = 5 * 1024 * 1024;
/** Largest proof a student may pick: the browser shrinks it to PROOF_MAX_BYTES or less (compressFile.ts). */
export const PROOF_MAX_PICK_BYTES = 20 * 1024 * 1024;
export const PROOF_TYPES = ["application/pdf", "image/jpeg", "image/png", "image/webp"];

// ─── Stages ──────────────────────────────────────────────────

export type StageId = 1 | 2 | 3 | 4 | 5 | 6;

export const STAGES: { id: StageId; name: string; goal: string; xp: number }[] = [
  { id: 1, name: "สำรวจ", goal: "เลือกเป้าหมายและเริ่มสร้างแผน", xp: 100 },
  { id: 2, name: "ตั้งเป้า", goal: "ตั้งเป้าหมาย บันทึกเกรด และเขียนแรงบันดาลใจ", xp: 150 },
  { id: 3, name: "ปูพื้น", goal: "เกรดเฉลี่ยถึงเกณฑ์ พร้อมหลักฐานใบเกรด", xp: 200 },
  { id: 4, name: "สะสมผลงาน", goal: "ทำพอร์ตครึ่งหนึ่ง และมีกิจกรรมพร้อมหลักฐาน", xp: 250 },
  { id: 5, name: "พร้อมสอบ", goal: "เตรียมสอบครบ และคะแนนจริงมีโอกาสติดระดับ 3+", xp: 300 },
  { id: 6, name: "พร้อมสมัคร", goal: "พอร์ตครบ ภารกิจสมัครครบ และมีลิงก์พอร์ตฉบับจริง", xp: 350 },
];

export const SUBLEVELS = 5;

export type GateStep = {
  key: string;
  label: string;
  done: boolean;
  /** Doesn't apply to this program (e.g. no Round 1): counts as done, shown as "ไม่ต้องทำ". */
  na?: boolean;
  /** Progress text such as "1/2". */
  progress?: string;
  /** Proof this step asks for, if any. */
  proof?: { step: string; kinds: Proof["kind"][]; label: string };
};

export type LevelInput = {
  boxes: AnyBox[];
  program: RoadmapProgram;
  /** The roadmap's Round 3 option (for the exam-ready gate), or null when the program has none. */
  option: Round3Option | null;
  proofs: Proof[];
};

const boxesOf = <K extends AnyBox["kind"]>(boxes: AnyBox[], kind: K) =>
  boxes.filter((b) => b.kind === kind).map((b) => b.data as BoxData[K]);

/** The exams a program weighs (0–100 tests only; grades are entered as GPAX). */
export const weightedExams = (program: RoadmapProgram) =>
  Object.keys(program.weights).filter((c) => examInfo(c)?.max === 100);

/** The steps of each stage's gate (the checklist to move up from that stage). */
export function gates(input: LevelInput): Record<StageId, GateStep[]> {
  const { boxes, program, option, proofs } = input;
  const proof = (step: string) => proofs.find((p) => p.step === step) ?? null;
  const quests = boxesOf(boxes, "quests").flatMap((q) => q.items);
  const questDone = (key: string) => quests.some((q) => q.key === key && q.done);
  const portfolio = portfolioItems(program);
  const ticked = new Set(boxesOf(boxes, "portfolio").flatMap((p) => p.done));
  const portfolioDone = portfolio.filter((p) => ticked.has(p.key)).length;
  const gpaBoxes = boxesOf(boxes, "gpa");
  const gpax = gpaBoxes.map(latestGpax).find((v) => v !== null) ?? null;
  const activities = boxesOf(boxes, "activities").flatMap((a) => a.items);
  const provenActivities = activities.filter((a) => {
    const p = proof(`act:${a.id}`);
    return p && (p.hasFile || p.url);
  }).length;
  const exams = weightedExams(program);
  const scores: Record<string, number> = {};
  for (const code of exams) {
    const p = proof(`score:${code}`);
    if (p && p.value !== null) scores[code] = p.value;
  }
  if (gpax !== null) scores.gpax = gpax;
  const allScored = exams.length > 0 && exams.every((c) => c in scores);
  let chanceOk = false;
  let chanceText = "";
  if (option && allScored) {
    const r = calculate(option, scores);
    if (r.chance) {
      chanceOk = r.chance.level >= 3;
      chanceText = `ระดับ ${r.chance.level}`;
    } else {
      // No last-year data: passing the published minimum is the bar.
      chanceOk = r.status === "pass" || r.status === "noMinimum";
      chanceText = chanceOk ? "ผ่านเกณฑ์ขั้นต่ำ" : "ยังไม่ผ่านเกณฑ์ขั้นต่ำ";
    }
  }
  const hasRound1 = program.round1.length > 0;

  return {
    1: [
      { key: "target", label: "เลือกหลักสูตรเป้าหมาย", done: Boolean(program.programId) },
      { key: "boxes", label: "มีกล่องอย่างน้อย 3 กล่อง", done: boxes.length >= 3, progress: `${Math.min(boxes.length, 3)}/3` },
    ],
    2: [
      { key: "goal", label: "ตั้งตัวเลขเป้าหมายในกล่องเป้าหมาย", done: boxesOf(boxes, "goal").some((g) => g.target > 0 && g.title.trim() !== "") },
      { key: "gpa", label: "บันทึก GPAX อย่างน้อย 1 เทอม", done: gpax !== null },
      { key: "motto", label: "เขียนประโยคแรงบันดาลใจ", done: boxesOf(boxes, "motto").some((m) => m.text.trim() !== "") },
    ],
    3: [
      {
        key: "gpax-min",
        label: program.minGpax ? `GPAX ล่าสุดถึง ${program.minGpax.toFixed(2)}` : "มี GPAX ล่าสุด",
        done: gpax !== null && gpax >= (program.minGpax ?? 0),
        progress: gpax !== null ? `ตอนนี้ ${gpax.toFixed(2)}` : undefined,
      },
      {
        key: "gpax-proof",
        label: "แนบรูปหรือ PDF ใบเกรด",
        done: Boolean(proof("gpax")?.hasFile),
        proof: { step: "gpax", kinds: ["file"], label: "ใบเกรด" },
      },
    ],
    4: [
      hasRound1
        ? {
            key: "portfolio-half",
            label: "ติ๊กพอร์ตอย่างน้อยครึ่งหนึ่ง",
            done: portfolioDone * 2 >= portfolio.length,
            progress: `${portfolioDone}/${portfolio.length}`,
          }
        : { key: "portfolio-half", label: "ทำพอร์ต (หลักสูตรนี้ไม่มีรอบ 1)", done: true, na: true },
      {
        key: "activities",
        label: "กิจกรรมที่มีหลักฐาน (รูป/PDF หรือลิงก์) อย่างน้อย 2 รายการ",
        done: provenActivities >= 2,
        progress: `${Math.min(provenActivities, 2)}/2`,
      },
    ],
    5: option
      ? [
          {
            key: "exam-quests",
            label: "ติ๊กภารกิจเตรียมสอบครบทุกวิชา",
            done: exams.every((c) => questDone(`exam:${c}`)),
            progress: `${exams.filter((c) => questDone(`exam:${c}`)).length}/${exams.length}`,
          },
          ...exams.map((code) => ({
            key: `score:${code}`,
            label: `คะแนนจริง/ม็อก ${examInfo(code)!.label}`,
            done: code in scores,
            progress: code in scores ? String(scores[code]) : undefined,
            proof: { step: `score:${code}`, kinds: ["number" as const], label: examInfo(code)!.label },
          })),
          {
            key: "chance",
            label: "คะแนนรวมมีโอกาสติดระดับ 3 ขึ้นไป",
            done: chanceOk,
            progress: allScored ? chanceText : "ใส่คะแนนให้ครบก่อน",
          },
        ]
      : [{ key: "exam", label: "เตรียมสอบ (หลักสูตรนี้ไม่มีรอบ 3)", done: true, na: true }],
    6: [
      hasRound1
        ? { key: "portfolio-all", label: "ติ๊กพอร์ตครบทุกข้อ", done: portfolio.length > 0 && portfolioDone === portfolio.length, progress: `${portfolioDone}/${portfolio.length}` }
        : { key: "portfolio-all", label: "พอร์ต (หลักสูตรนี้ไม่มีรอบ 1)", done: true, na: true },
      ...(hasRound1 ? [{ key: "apply-r1", label: "ติ๊กภารกิจ “สมัครรอบ 1”", done: questDone("apply:r1") }] : []),
      ...(program.hasRound3 ? [{ key: "apply-r3", label: "ติ๊กภารกิจ “สมัครรอบ 3”", done: questDone("apply:r3") }] : []),
      hasRound1
        ? {
            key: "portfolio-link",
            label: "แนบลิงก์พอร์ตฉบับจริง",
            done: Boolean(proof("portfolio-link")?.url),
            proof: { step: "portfolio-link", kinds: ["link"], label: "ลิงก์พอร์ต" },
          }
        : { key: "portfolio-link", label: "ลิงก์พอร์ต (หลักสูตรนี้ไม่มีรอบ 1)", done: true, na: true },
    ],
  };
}

export type LevelState = {
  stage: StageId;
  /** True when all 6 gates are complete. */
  finished: boolean;
  gates: Record<StageId, GateStep[]>;
  /** XP into the current stage, its size, and the sub-level (1–5). */
  xpInStage: number;
  stageSize: number;
  subLevel: number;
  /** The XP bar is full but the gate isn't done yet. */
  gateWaiting: boolean;
};

/** Where the student stands: the first stage whose gate isn't complete. */
export function stageOf(input: LevelInput, xp: number): LevelState {
  const g = gates(input);
  let stage: StageId = 1;
  while (stage < 6 && g[stage].every((s) => s.done)) stage = (stage + 1) as StageId;
  const finished = stage === 6 && g[6].every((s) => s.done);
  const before = STAGES.filter((s) => s.id < stage).reduce((n, s) => n + s.xp, 0);
  const size = STAGES[stage - 1].xp;
  const xpInStage = Math.max(0, xp - before);
  const subLevel = Math.min(SUBLEVELS, 1 + Math.floor(Math.min(xpInStage, size - 1) / (size / SUBLEVELS)));
  return { stage, finished, gates: g, xpInStage: Math.min(xpInStage, size), stageSize: size, subLevel, gateWaiting: xpInStage >= size && !finished };
}

// ─── Weekly streak ───────────────────────────────────────────

/** The streak after progress made in the week of `today` (weeks start Monday, Thai time). */
export function nextStreak(lastWeek: DayKey | null, streak: number, today: DayKey): { lastWeek: DayKey; streak: number } {
  const week = weekStart(today);
  if (lastWeek === week) return { lastWeek: week, streak: Math.max(1, streak) };
  if (lastWeek === addDays(week, -7)) return { lastWeek: week, streak: streak + 1 };
  return { lastWeek: week, streak: 1 };
}

/** The streak as shown today: it lapses once a whole week passes with no progress. */
export function currentStreak(lastWeek: DayKey | null, streak: number, today: DayKey): number {
  if (!lastWeek) return 0;
  const week = weekStart(today);
  return lastWeek === week || lastWeek === addDays(week, -7) ? streak : 0;
}

// ─── Rewards ─────────────────────────────────────────────────

export type Reward = { id: string; name: string; need: { stage?: StageId; streak?: number } };

/**
 * Card frames, the only card reward. Add one here plus its look in globals.css
 * (.roadmap-card[data-frame=…]). The card's colours are not a reward: see universityTheme().
 */
export const REWARDS: Reward[] = [
  { id: "glass", name: "กระจกใส", need: {} },
  { id: "bronze", name: "ทองแดง", need: { stage: 2 } },
  { id: "silver", name: "เงิน", need: { stage: 3 } },
  { id: "gold", name: "ทอง", need: { stage: 4 } },
  { id: "holo", name: "โฮโลแกรม", need: { stage: 5 } },
  { id: "rainbow", name: "สายรุ้ง", need: { stage: 6 } },
  { id: "flame4", name: "เปลวไฟ", need: { streak: 4 } },
  { id: "flame8", name: "ไฟฟ้า", need: { streak: 8 } },
  { id: "flame16", name: "ดาวตก", need: { streak: 16 } },
];

/**
 * The card face always follows the target university (its colours and emblem, globals.css
 * .roadmap-face[data-theme="uni-<id>"]); students can't change it. Unknown ids get the red→purple face.
 */
export const universityTheme = (universityId: string) =>
  TCAS_UNIVERSITIES.some((u) => u.id === universityId) ? `uni-${universityId}` : "classic";

/** Rewards stay once earned: they follow the highest stage ever reached and the best streak. */
export const isUnlocked = (r: Reward, maxStage: number, bestStreak: number) =>
  (r.need.stage === undefined || maxStage >= r.need.stage) && (r.need.streak === undefined || bestStreak >= r.need.streak);

export const needText = (r: Reward) =>
  r.need.stage ? `ถึงด่าน ${r.need.stage}: ${STAGES[r.need.stage - 1].name}` : r.need.streak ? `ทำต่อเนื่อง ${r.need.streak} สัปดาห์` : "มีให้ตั้งแต่เริ่ม";

/** A chosen frame only if it's a known, unlocked one; otherwise the default glass frame. */
export function pickFrame(id: string | null, maxStage: number, bestStreak: number): string {
  const r = REWARDS.find((x) => x.id === id);
  return r && isUnlocked(r, maxStage, bestStreak) ? r.id : "glass";
}
