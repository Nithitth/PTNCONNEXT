// TCASter scoring rules. Pure (no I/O), shared by server and browser, unit-tested in tcas.test.ts.
// Data comes from the official TCAS database (course.mytcas.com, ทปอ.).

export const TCAS_YEAR = 2570;

/** The 5 universities in release 1, with their TCAS ids. */
export const TCAS_UNIVERSITIES = [
  { id: "001", name: "จุฬาลงกรณ์มหาวิทยาลัย", short: "จุฬาฯ" },
  { id: "002", name: "มหาวิทยาลัยเกษตรศาสตร์", short: "เกษตรฯ" },
  { id: "005", name: "มหาวิทยาลัยธรรมศาสตร์", short: "ธรรมศาสตร์" },
  { id: "006", name: "มหาวิทยาลัยมหิดล", short: "มหิดล" },
  { id: "009", name: "มหาวิทยาลัยศรีนครินทรวิโรฒ", short: "มศว." },
] as const;

export type ExamInfo = { code: string; label: string; max: number; step: number };

// Exams are compared on a 100-point scale (TCAS turns each score into a percentage before weighting).
// Grades (GPAX and subject-group GPA) use 0–4 and count ×25.
const EXAMS: Record<string, string> = {
  tgat: "TGAT",
  tgat1: "TGAT1 การสื่อสารภาษาอังกฤษ",
  tgat2: "TGAT2 การคิดอย่างมีเหตุผล",
  tgat3: "TGAT3 สมรรถนะการทำงาน",
  tpat1: "TPAT1 วิชาเฉพาะ กสพท",
  tpat2: "TPAT2 ศิลปกรรมศาสตร์",
  tpat21: "TPAT2.1 ทัศนศิลป์",
  tpat22: "TPAT2.2 ดนตรี",
  tpat23: "TPAT2.3 นาฏศิลป์",
  tpat3: "TPAT3 วิทยาศาสตร์ เทคโนโลยี วิศวกรรมศาสตร์",
  tpat4: "TPAT4 สถาปัตยกรรมศาสตร์",
  tpat5: "TPAT5 ครุศาสตร์-ศึกษาศาสตร์",
  a_lv_61: "A-Level คณิตศาสตร์ประยุกต์ 1",
  a_lv_62: "A-Level คณิตศาสตร์ประยุกต์ 2",
  a_lv_63: "A-Level วิทยาศาสตร์ประยุกต์",
  a_lv_64: "A-Level ฟิสิกส์",
  a_lv_65: "A-Level เคมี",
  a_lv_66: "A-Level ชีววิทยา",
  a_lv_70: "A-Level สังคมศึกษา",
  a_lv_81: "A-Level ภาษาไทย",
  a_lv_82: "A-Level ภาษาอังกฤษ",
  a_lv_83: "A-Level ภาษาฝรั่งเศส",
  a_lv_84: "A-Level ภาษาเยอรมัน",
  a_lv_85: "A-Level ภาษาญี่ปุ่น",
  a_lv_86: "A-Level ภาษาเกาหลี",
  a_lv_87: "A-Level ภาษาจีน",
  a_lv_88: "A-Level ภาษาบาลี",
  a_lv_89: "A-Level ภาษาสเปน",
};
const GRADES: Record<string, string> = {
  gpax: "GPAX (เกรดเฉลี่ยสะสม)",
  gpa21: "เกรดเฉลี่ยกลุ่มสาระภาษาไทย",
  gpa22: "เกรดเฉลี่ยกลุ่มสาระคณิตศาสตร์",
  gpa23: "เกรดเฉลี่ยกลุ่มสาระวิทยาศาสตร์",
  gpa24: "เกรดเฉลี่ยกลุ่มสาระสังคมศึกษา",
  gpa25: "เกรดเฉลี่ยกลุ่มสาระสุขศึกษาและพลศึกษา",
  gpa26: "เกรดเฉลี่ยกลุ่มสาระศิลปะ",
  gpa27: "เกรดเฉลี่ยกลุ่มสาระการงานอาชีพ",
  gpa28: "เกรดเฉลี่ยกลุ่มสาระภาษาต่างประเทศ",
};

export function examInfo(code: string): ExamInfo | null {
  if (code in EXAMS) return { code, label: EXAMS[code], max: 100, step: 1 };
  if (code in GRADES) return { code, label: GRADES[code], max: 4, step: 0.01 };
  return null;
}

const isGrade = (code: string) => code in GRADES;
const round2 = (n: number) => Math.round(n * 100) / 100;
const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

export type Round3Option = {
  position: number;
  projectName: string | null;
  seats: number | null;
  minGpax: number | null;
  minTotal: number | null;
  weights: Record<string, number>;
  minimums: Record<string, number>;
  link: string | null;
  /** Why the calculator can't be used for this option (Thai), or null. */
  problem: string | null;
  /** The program has extra conditions the calculator can't check (e.g. combined-score rules, IELTS). */
  extraConditions: boolean;
};

/** One Round 3 option as stored in the database (tcas_round3) and in the staging payload. */
export type Round3Row = {
  position: number;
  project_name: string | null;
  seats: number | null;
  min_gpax: number | null;
  min_total: number | null;
  weights: Record<string, number>;
  conditions: Record<string, number>;
  link: string | null;
  problem: string | null;
};

/** A condition the calculator understands: min_gpax or min_<known exam/grade code>. */
const knownCondition = (key: string) => key.startsWith("min_") && examInfo(key.slice(4)) !== null;

/**
 * Returns a short Thai reason when this Round 3 total can't be calculated here, or null.
 * Only the weights decide this; other conditions are shown as "extra conditions" instead.
 */
export function checkRound3(weights: Record<string, unknown>): string | null {
  const entries = Object.entries(weights);
  if (entries.length === 0) return "ไม่มีสัดส่วนคะแนน";
  if (entries.some(([code]) => !examInfo(code))) return "ใช้วิชาหรือสูตรคะแนนเฉพาะของมหาวิทยาลัย";
  if (entries.some(([, v]) => !isNum(v) || v <= 0)) return "สัดส่วนคะแนนไม่ถูกต้อง";
  const sum = round2(entries.reduce((s, [, v]) => s + (v as number), 0));
  if (sum !== 100) return `สัดส่วนคะแนนรวม ${sum}% ไม่ใช่ 100%`;
  return null;
}

export function toRound3Option(row: Round3Row): Round3Option {
  const minimums: Record<string, number> = {};
  for (const [key, v] of Object.entries(row.conditions ?? {})) {
    if (knownCondition(key) && isNum(v)) minimums[key.slice(4)] = v;
  }
  const extraConditions = Object.keys(row.conditions ?? {}).some((key) => !knownCondition(key));
  return {
    position: row.position,
    projectName: row.project_name,
    seats: row.seats,
    minGpax: row.min_gpax,
    minTotal: row.min_total,
    weights: row.weights ?? {},
    minimums,
    link: row.link,
    problem: row.problem,
    extraConditions,
  };
}

export type CalcResult = {
  total: number;
  minTotal: number | null;
  gap: number;
  passesTotal: boolean;
  failedMinimums: string[];
  hint: { code: string; points: number } | null;
};

/** On the 100-point scale used for weighting. */
const toHundred = (code: string, score: number) => (isGrade(code) ? score * 25 : score);

export function calculate(option: Round3Option, scores: Record<string, number>): CalcResult {
  const score = (code: string) => scores[code] ?? 0;
  const weights = Object.entries(option.weights);
  const total = round2(weights.reduce((s, [code, w]) => s + (toHundred(code, score(code)) * w) / 100, 0));
  const gap = option.minTotal === null ? 0 : Math.max(0, round2(option.minTotal - total));

  const mins: Record<string, number> = { ...option.minimums };
  const gpaxMin = option.minGpax ?? option.minimums.gpax;
  if (gpaxMin !== undefined && gpaxMin !== null) mins.gpax = gpaxMin;
  const failedMinimums = Object.entries(mins)
    .filter(([code, min]) => score(code) < min)
    .map(([code]) => code);

  let hint: CalcResult["hint"] = null;
  if (gap > 0) {
    // Biggest weight first; on a tie, keep the order the program lists them.
    const byWeight = weights.map((e, i) => [e, i] as const).sort((a, b) => b[0][1] - a[0][1] || a[1] - b[1]);
    for (const [[code, w]] of byWeight) {
      const info = examInfo(code)!;
      const needHundred = Math.ceil(round2((gap * 100) / w));
      const need = isGrade(code) ? Math.ceil(round2(needHundred / 25) * 100) / 100 : needHundred;
      if (need <= info.max - score(code)) {
        hint = { code, points: need };
        break;
      }
    }
  }
  return { total, minTotal: option.minTotal, gap, passesTotal: gap === 0, failedMinimums, hint };
}

/** Validates scores sent from the browser. Unknown codes are dropped; any bad value rejects the lot. */
export function cleanScores(option: Round3Option, raw: unknown): Record<string, number> | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const allowed = new Set([...Object.keys(option.weights), ...Object.keys(option.minimums), "gpax"]);
  const out: Record<string, number> = {};
  for (const [code, v] of Object.entries(raw as Record<string, unknown>)) {
    if (!allowed.has(code)) continue;
    const info = examInfo(code);
    if (!info || !isNum(v) || v < 0 || v > info.max) return null;
    out[code] = v;
  }
  return out;
}

/** The option a saved target points at, or the first one if it no longer exists. */
export function pickOption(options: Round3Option[], position: number): Round3Option | null {
  return options.find((o) => o.position === position) ?? options[0] ?? null;
}

/** Search text that is safe inside a PostgREST `or(...ilike...)` filter. */
export function cleanSearch(q: string): string {
  return q
    .replace(/[,()%*.\\]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 60);
}
