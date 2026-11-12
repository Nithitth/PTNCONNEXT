// TCAS Roadmap rules. Pure (no I/O), shared by server and browser, unit-tested in roadmap.test.ts.
//
// Each student has one roadmap aimed at one program. They build it from up to 10 "boxes": preset
// components (GPA, quests, goals, countdowns…). Progress inside the boxes earns XP, which levels up
// the game card. XP, levels and badges are worked out here every time; only box data is stored.
import { addDays, dayKey, daysBetween, type DayKey } from "./calendar";
import { calculate, examInfo, isProgramId, pickOption, type Round3Option } from "./tcas";

export const ROADMAP_MAX_BOXES = 10;
/** Most items in one list-type box (quests, activities, study slots, skills). */
export const BOX_MAX_ITEMS = 20;
export const BOX_MAX_LINKS = 10;
export const BOX_MAX_BACKUPS = 3;
export const XP_PER_LEVEL = 50;
/** XP from things students type themselves (own quests, activities, study) is capped at this share. */
export const TYPED_XP_SHARE = 0.4;
/** …but a fresh roadmap always allows this much typed XP, so the first own quests still count. */
export const TYPED_XP_FLOOR = 30;

export const BOX_KINDS = [
  "gpa",
  "scores",
  "quests",
  "portfolio",
  "goal",
  "countdown",
  "activities",
  "notes",
  "motto",
  "study",
  "skills",
  "backup",
  "links",
] as const;
export type BoxKind = (typeof BOX_KINDS)[number];
export const isBoxKind = (k: unknown): k is BoxKind => typeof k === "string" && (BOX_KINDS as readonly string[]).includes(k);

/** The preset menu: Thai name, one-line description and default title. Icons live in the UI. */
export const BOX_PRESETS: Record<BoxKind, { name: string; description: string }> = {
  gpa: { name: "เกรดเฉลี่ย", description: "บันทึก GPAX ทุกเทอม เทียบกับเกรดขั้นต่ำของหลักสูตร" },
  scores: { name: "คะแนนสอบ", description: "ดูคะแนนที่ลองคำนวณไว้ และระดับโอกาสติด 1–5" },
  quests: { name: "ภารกิจ", description: "เช็กลิสต์สิ่งที่ต้องทำ แยกตามเทอม มีภารกิจแนะนำให้" },
  portfolio: { name: "พอร์ตโฟลิโอ", description: "เช็กลิสต์พอร์ตตามเกณฑ์รอบ 1 จริงของหลักสูตร" },
  goal: { name: "เป้าหมาย", description: "ตั้งตัวเลขที่อยากไปให้ถึง พร้อมแถบความคืบหน้า" },
  countdown: { name: "นับถอยหลัง", description: "นับวันถึงวันสอบหรือวันสมัคร" },
  activities: { name: "กิจกรรม/ค่าย/แข่งขัน", description: "เก็บประวัติค่าย การแข่งขัน งานอาสา เกียรติบัตร" },
  notes: { name: "บันทึก", description: "จดอะไรก็ได้ที่อยากจำ" },
  motto: { name: "แรงบันดาลใจ", description: "ประโยคเตือนใจว่าทำไมถึงอยากเข้าที่นี่" },
  study: { name: "ตารางอ่านหนังสือ", description: "แผนอ่านหนังสือรายสัปดาห์ ติ๊กเมื่ออ่านแล้ว" },
  skills: { name: "ทักษะที่ต้องพัฒนา", description: "ให้คะแนนตัวเอง 1–5 แล้วดูว่าพัฒนาขึ้นแค่ไหน" },
  backup: { name: "แผนสำรอง", description: "หลักสูตรสำรองจากเป้าหมายที่บันทึกไว้" },
  links: { name: "คลังลิงก์", description: "เก็บลิงก์คลิปติว ข้อสอบเก่า เว็บที่ใช้บ่อย" },
};

// ─── Terms ───────────────────────────────────────────────────

export const TERMS = ["m4t1", "m4t2", "m5t1", "m5t2", "m6t1", "m6t2"] as const;
export type Term = (typeof TERMS)[number];
export const isTerm = (t: unknown): t is Term => typeof t === "string" && (TERMS as readonly string[]).includes(t);
export const termLabel = (t: Term) => `ม.${t[1]} เทอม ${t[3]}`;
/** Terms that have a GPAX to record (ม.6 เทอม 2 ends after applications close). */
export const GPA_TERMS: Term[] = ["m4t1", "m4t2", "m5t1", "m5t2", "m6t1"];

/**
 * The student's current term in Thai time. Term 1 runs mid-May to October, term 2 November to April
 * (the school year starts in May, as in currentAcademicYear). Null for grades outside ม.4–ม.6.
 */
export function currentTerm(grade: number | null | undefined, now: Date = new Date()): Term | null {
  if (!grade || grade < 4 || grade > 6) return null;
  const month = Number(dayKey(now).slice(5, 7)); // 1–12
  const t = month >= 5 && month <= 10 ? 1 : 2;
  return `m${grade}t${t}` as Term;
}

// ─── Box data shapes ─────────────────────────────────────────

export type QuestItem = { key: string; title: string; term: Term | null; done: boolean; xp: number };
export type ActivityType = "camp" | "contest" | "volunteer" | "cert" | "other";
export const ACTIVITY_TYPES: Record<ActivityType, string> = {
  camp: "ค่าย",
  contest: "แข่งขัน",
  volunteer: "จิตอาสา",
  cert: "เกียรติบัตร",
  other: "อื่น ๆ",
};
export type StudySlot = { id: string; day: number; subject: string; minutes: number; done: boolean };

export type BoxData = {
  gpa: { terms: Partial<Record<Term, number>> };
  scores: Record<string, never>;
  quests: { items: QuestItem[] };
  portfolio: { done: string[] };
  goal: { title: string; target: number; current: number; deadline: DayKey | null };
  countdown: { label: string; date: DayKey | null };
  activities: { items: { id: string; name: string; type: ActivityType; date: DayKey | null; note: string }[] };
  notes: { text: string };
  motto: { text: string };
  /** `week` is the Monday the ticks belong to; ticks from an older week count as not done. */
  study: { week: DayKey | null; slots: StudySlot[] };
  skills: { items: { id: string; name: string; start: number; now: number }[] };
  backup: { programIds: string[] };
  links: { items: { id: string; title: string; url: string }[] };
};

export type Box<K extends BoxKind = BoxKind> = { id: string; kind: K; title: string; sort: number; data: BoxData[K] };
export type AnyBox = { [K in BoxKind]: Box<K> }[BoxKind];

// ─── Validation (browser data is never trusted) ──────────────

const isObj = (v: unknown): v is Record<string, unknown> => Boolean(v) && typeof v === "object" && !Array.isArray(v);
const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const ID = /^[a-z0-9]{1,16}$/;
const QUEST_KEY = /^(exam:[a-z0-9_]{1,20}|register:exams|gpax|apply:r[13]|tpl:\d{1,12}|own:[a-z0-9]{1,16})$/;
const PORTFOLIO_KEY = /^r1:[a-z0-9]{1,12}:(read|make)$/;

/** Trimmed text of at most `max` characters, or null when it isn't text. Control characters are removed. */
function text(v: unknown, max: number): string | null {
  if (typeof v !== "string") return null;
  const s = v.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "").trim();
  return s.length > max ? null : s;
}

/** A real calendar date "YYYY-MM-DD", or null. */
export function isDayKey(v: unknown): v is DayKey {
  if (typeof v !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  return addDays(v, 0) === v;
}

const optionalDay = (v: unknown): DayKey | null | undefined => (v === null || v === "" || v === undefined ? null : isDayKey(v) ? v : undefined);

function isHttpUrl(v: string): boolean {
  try {
    const u = new URL(v);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

/** XP of one quest: template quests carry their own (10/20/30); applying is 20; everything else 10. */
export function questXp(key: string, xp?: unknown): number {
  if (key.startsWith("tpl:")) return xp === 20 || xp === 30 ? xp : 10;
  if (key.startsWith("apply:")) return 20;
  return 10;
}

function list<T>(raw: unknown, max: number, item: (v: unknown) => T | null): T[] | null {
  if (!Array.isArray(raw) || raw.length > max) return null;
  const out: T[] = [];
  for (const v of raw) {
    const x = item(v);
    if (x === null) return null;
    out.push(x);
  }
  return out;
}

const uniqueBy = <T>(items: T[], key: (x: T) => string) => items.length === new Set(items.map(key)).size;

/**
 * Checks one box's data as sent from the browser. Returns clean data, or null if anything is wrong
 * (wrong type, too long, too many items, bad dates or links). Unknown fields are dropped.
 */
export function cleanBoxData<K extends BoxKind>(kind: K, raw: unknown): BoxData[K] | null {
  if (!isObj(raw)) return null;
  const r = raw;
  const out = ((): BoxData[BoxKind] | null => {
    switch (kind) {
      case "gpa": {
        if (!isObj(r.terms)) return null;
        const terms: Partial<Record<Term, number>> = {};
        for (const [t, v] of Object.entries(r.terms)) {
          if (!GPA_TERMS.includes(t as Term)) return null;
          if (v === null) continue;
          if (!isNum(v) || v < 1 || v > 4) return null;
          terms[t as Term] = Math.round(v * 100) / 100;
        }
        return { terms };
      }
      case "scores":
        return {};
      case "quests": {
        const items = list(r.items, BOX_MAX_ITEMS, (v): QuestItem | null => {
          if (!isObj(v) || typeof v.key !== "string" || !QUEST_KEY.test(v.key)) return null;
          const title = text(v.title, 100);
          if (!title || typeof v.done !== "boolean") return null;
          if (v.term !== null && v.term !== undefined && !isTerm(v.term)) return null;
          return { key: v.key, title, term: (v.term as Term | undefined) ?? null, done: v.done, xp: questXp(v.key, v.xp) };
        });
        return items && uniqueBy(items, (x) => x.key) ? { items } : null;
      }
      case "portfolio": {
        const done = list(r.done, 60, (v) => (typeof v === "string" && PORTFOLIO_KEY.test(v) ? v : null));
        return done ? { done: [...new Set(done)] } : null;
      }
      case "goal": {
        const title = text(r.title, 80);
        const deadline = optionalDay(r.deadline);
        if (title === null || deadline === undefined) return null;
        if (!isNum(r.target) || !isNum(r.current) || r.target < 0 || r.current < 0 || r.target > 100000 || r.current > 100000)
          return null;
        return { title, target: r.target, current: r.current, deadline };
      }
      case "countdown": {
        const label = text(r.label, 60);
        const date = optionalDay(r.date);
        return label === null || date === undefined ? null : { label, date };
      }
      case "activities": {
        const items = list(r.items, BOX_MAX_ITEMS, (v) => {
          if (!isObj(v) || typeof v.id !== "string" || !ID.test(v.id)) return null;
          const name = text(v.name, 100);
          const note = text(v.note ?? "", 300);
          const date = optionalDay(v.date);
          if (!name || note === null || date === undefined) return null;
          if (typeof v.type !== "string" || !(v.type in ACTIVITY_TYPES)) return null;
          return { id: v.id, name, type: v.type as ActivityType, date, note };
        });
        return items && uniqueBy(items, (x) => x.id) ? { items } : null;
      }
      case "notes": {
        const t = text(r.text, 2000);
        return t === null ? null : { text: t };
      }
      case "motto": {
        const t = text(r.text, 120);
        return t === null ? null : { text: t };
      }
      case "study": {
        const week = optionalDay(r.week);
        const slots = list(r.slots, BOX_MAX_ITEMS, (v) => {
          if (!isObj(v) || typeof v.id !== "string" || !ID.test(v.id)) return null;
          const subject = text(v.subject, 60);
          if (!subject || typeof v.done !== "boolean") return null;
          if (!Number.isInteger(v.day) || (v.day as number) < 0 || (v.day as number) > 6) return null;
          if (!Number.isInteger(v.minutes) || (v.minutes as number) < 5 || (v.minutes as number) > 600) return null;
          return { id: v.id, day: v.day as number, subject, minutes: v.minutes as number, done: v.done };
        });
        return week === undefined || !slots || !uniqueBy(slots, (x) => x.id) ? null : { week, slots };
      }
      case "skills": {
        const items = list(r.items, BOX_MAX_ITEMS, (v) => {
          if (!isObj(v) || typeof v.id !== "string" || !ID.test(v.id)) return null;
          const name = text(v.name, 60);
          const ok = (n: unknown): n is number => Number.isInteger(n) && (n as number) >= 1 && (n as number) <= 5;
          if (!name || !ok(v.start) || !ok(v.now)) return null;
          return { id: v.id, name, start: v.start, now: v.now };
        });
        return items && uniqueBy(items, (x) => x.id) ? { items } : null;
      }
      case "backup": {
        const ids = list(r.programIds, BOX_MAX_BACKUPS, (v) => (typeof v === "string" && isProgramId(v) ? v : null));
        return ids ? { programIds: [...new Set(ids)] } : null;
      }
      case "links": {
        const items = list(r.items, BOX_MAX_LINKS, (v) => {
          if (!isObj(v) || typeof v.id !== "string" || !ID.test(v.id)) return null;
          const title = text(v.title, 80);
          const url = text(v.url, 500);
          if (!title || !url || !isHttpUrl(url)) return null;
          return { id: v.id, title, url };
        });
        return items && uniqueBy(items, (x) => x.id) ? { items } : null;
      }
    }
  })();
  return out as BoxData[K] | null;
}

/** A box title: trimmed, at most 60 characters, falling back to the preset name. */
export function cleanBoxTitle(kind: BoxKind, raw: unknown): string | null {
  if (raw === undefined || raw === null || raw === "") return BOX_PRESETS[kind].name;
  const t = text(raw, 60);
  return t === null ? null : t || BOX_PRESETS[kind].name;
}

/** A short random id for list items ("k3x9…"). */
export const newItemId = () => Math.random().toString(36).slice(2, 12) || "x";

// ─── The target program, as the roadmap sees it ──────────────

export type RoadmapProgram = {
  programId: string;
  groupField: string;
  minGpax: number | null;
  weights: Record<string, number>;
  hasRound3: boolean;
  round1: { projectName: string | null; portfolio: string; criteria: string }[];
};

/** Picks what the roadmap needs from a program's detail and the roadmap's Round 3 option. */
export function toRoadmapProgram(
  p: {
    programId: string;
    groupField: string;
    round1: { projectName: string | null; portfolio: string; criteria: string }[];
    round3: Round3Option[];
  },
  position: number,
): RoadmapProgram {
  const option = pickOption(
    p.round3.filter((o) => !o.problem),
    position,
  );
  const any = option ?? p.round3[0] ?? null;
  return {
    programId: p.programId,
    groupField: p.groupField,
    minGpax: any?.minGpax ?? any?.minimums.gpax ?? null,
    weights: option?.weights ?? {},
    hasRound3: p.round3.length > 0,
    round1: p.round1.map((r) => ({ projectName: r.projectName, portfolio: r.portfolio, criteria: r.criteria })),
  };
}

/** The 1–5 chance level from a saved target's calculator scores, or null (no target, no calculator, no data). */
export function targetChance(
  round3: Round3Option[],
  target: { position: number; sliderScores: Record<string, number> } | null,
): number | null {
  if (!target) return null;
  const option = pickOption(
    round3.filter((o) => !o.problem),
    target.position,
  );
  if (!option) return null;
  return calculate(option, target.sliderScores).chance?.level ?? null;
}

/** A short, stable id for a text (djb2, base 36). Used to key portfolio items by project name. */
export function shortHash(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
  return h.toString(36);
}

export type PortfolioItem = { key: string; title: string; detail: string };

/** Two checklist items per Round 1 project: read its criteria, then make the portfolio. */
export function portfolioItems(program: RoadmapProgram): PortfolioItem[] {
  return program.round1.flatMap((r, i) => {
    const name = r.projectName?.trim() || `โครงการที่ ${i + 1}`;
    const h = shortHash(name);
    const detail = [r.portfolio, r.criteria].filter(Boolean).join("\n\n");
    return [
      { key: `r1:${h}:read`, title: `อ่านเกณฑ์พอร์ต: ${name}`, detail },
      { key: `r1:${h}:make`, title: `ทำพอร์ตตามเกณฑ์: ${name}`, detail: "" },
    ];
  });
}

export type RoadmapTemplate = { id: number; groupField: string; term: Term; title: string; xp: number };

/**
 * Suggested quests for the program: exam prep per weighted exam, registering for exams, the GPAX
 * minimum, applying in rounds 1/3, then approved team templates for the program's field group.
 */
export function suggestedQuests(program: RoadmapProgram, templates: RoadmapTemplate[] = []): QuestItem[] {
  const out: QuestItem[] = [];
  const add = (key: string, title: string, term: Term | null, xp?: number) =>
    out.push({ key, title: title.slice(0, 100), term, done: false, xp: questXp(key, xp) });
  if (program.minGpax) add("gpax", `รักษาเกรดเฉลี่ยสะสม (GPAX) ให้ถึง ${program.minGpax.toFixed(2)}`, null);
  const exams = Object.entries(program.weights)
    .filter(([code]) => examInfo(code) && examInfo(code)!.max === 100)
    .sort((a, b) => b[1] - a[1]);
  for (const [code, w] of exams) add(`exam:${code}`, `เตรียมสอบ ${examInfo(code)!.label} (${w}%)`, "m5t2");
  if (exams.length) add("register:exams", "สมัครสอบ TGAT/TPAT/A-Level ที่ mytcas", "m6t1");
  if (program.round1.length) add("apply:r1", "สมัครรอบ 1 Portfolio", "m6t1");
  if (program.hasRound3) add("apply:r3", "สมัครรอบ 3 Admission", "m6t2");
  for (const t of templates.filter((t) => t.groupField === program.groupField)) add(`tpl:${t.id}`, t.title, t.term, t.xp);
  return out.slice(0, BOX_MAX_ITEMS);
}

/** Adds suggestions that aren't in the list yet, keeping the student's own items and ticks. */
export function mergeQuests(items: QuestItem[], suggestions: QuestItem[]): QuestItem[] {
  const have = new Set(items.map((x) => x.key));
  return [...items, ...suggestions.filter((s) => !have.has(s.key))].slice(0, BOX_MAX_ITEMS);
}

/** Skills implied by a program's exams (English, maths, science…), for the skills box. */
export function suggestedSkills(program: RoadmapProgram): string[] {
  const skills = new Set<string>();
  for (const code of Object.keys(program.weights)) {
    if (code === "tgat" || code === "tgat1" || code === "a_lv_82") skills.add("ภาษาอังกฤษ");
    if (code === "tgat" || code === "tgat2") skills.add("การคิดอย่างมีเหตุผล");
    if (code === "a_lv_61" || code === "a_lv_62") skills.add("คณิตศาสตร์");
    if (["a_lv_63", "a_lv_64", "a_lv_65", "a_lv_66", "tpat3"].includes(code)) skills.add("วิทยาศาสตร์");
    if (code === "tpat3") skills.add("ความถนัดวิศวกรรม");
    if (code === "tpat1") skills.add("ความถนัดแพทย์ (กสพท)");
    if (code.startsWith("tpat2")) skills.add("ศิลปะ/ดนตรี/การแสดง");
    if (code === "tpat4") skills.add("ความถนัดสถาปัตย์");
    if (code === "tpat5") skills.add("ความเป็นครู");
    if (code === "a_lv_81") skills.add("ภาษาไทย");
    if (code === "a_lv_70") skills.add("สังคมศึกษา");
  }
  return [...skills];
}

/** Monday of the week containing `day` (Thai time). */
export function weekStart(day: DayKey): DayKey {
  const dow = new Date(`${day}T00:00:00Z`).getUTCDay(); // 0 = Sunday
  return addDays(day, dow === 0 ? -6 : 1 - dow);
}

export type KeyDate = { label: string; date: DayKey };

/** Starting data for a new box, filled in from the target program where that helps. */
export function newBoxData<K extends BoxKind>(
  kind: K,
  program: RoadmapProgram,
  extra: { templates?: RoadmapTemplate[]; keyDates?: KeyDate[]; today?: DayKey; mytcasUrl?: string } = {},
): BoxData[K] {
  const today = extra.today ?? dayKey(new Date());
  const d = ((): BoxData[BoxKind] => {
    switch (kind) {
      case "gpa":
        return { terms: {} };
      case "scores":
        return {};
      case "quests":
        return { items: suggestedQuests(program, extra.templates) };
      case "portfolio":
        return { done: [] };
      case "goal":
        return program.minGpax
          ? { title: `GPAX ให้ถึง ${program.minGpax.toFixed(2)}`, target: program.minGpax, current: 0, deadline: null }
          : { title: "", target: 100, current: 0, deadline: null };
      case "countdown": {
        const next = (extra.keyDates ?? []).filter((k) => k.date >= today).sort((a, b) => a.date.localeCompare(b.date))[0];
        return next ? { label: next.label.slice(0, 60), date: next.date } : { label: "วันสอบ", date: null };
      }
      case "activities":
        return { items: [] };
      case "notes":
      case "motto":
        return { text: "" };
      case "study":
        return { week: weekStart(today), slots: [] };
      case "skills":
        return { items: suggestedSkills(program).map((name, i) => ({ id: `s${i}`, name, start: 2, now: 2 })) };
      case "backup":
        return { programIds: [] };
      case "links":
        return { items: extra.mytcasUrl ? [{ id: "mytcas", title: "หลักสูตรนี้ที่ mytcas", url: extra.mytcasUrl }] : [] };
    }
  })();
  return d as BoxData[K];
}

// ─── Scoring: XP, level, badges ──────────────────────────────

export type ScoreContext = {
  program: RoadmapProgram;
  /** The 1–5 chance level from the student's saved calculator scores for this program, if any. */
  chance: number | null;
  today: DayKey;
};

export type Badge = { key: string; label: string; hint: string; earned: boolean };

export type RoadmapScore = {
  xp: number;
  level: number;
  /** XP where the current level started and where the next one begins. */
  levelStart: number;
  nextLevelXp: number;
  /** XP from typed entries that didn't count because of the 40% cap. */
  cappedXp: number;
  boxXp: Record<string, number>;
  badges: Badge[];
};

/** True when a goal box has a target and the current number has reached it. */
export const goalReached = (g: BoxData["goal"]) => g.target > 0 && g.current >= g.target;

/** Days from today to a countdown's date (negative once it has passed), or null without a date. */
export const daysLeft = (date: DayKey | null, today: DayKey) => (date ? daysBetween(today, date) : null);

/** Study ticks only count in the week they were made. */
export const studyDone = (s: BoxData["study"], today: DayKey) => s.week === weekStart(today);

/** The latest GPAX entered (later terms win), or null. */
export function latestGpax(g: BoxData["gpa"]): number | null {
  for (let i = GPA_TERMS.length - 1; i >= 0; i--) {
    const v = g.terms[GPA_TERMS[i]];
    if (v !== undefined) return v;
  }
  return null;
}

export const levelOf = (xp: number) => 1 + Math.floor(Math.max(0, xp) / XP_PER_LEVEL);

/**
 * XP per box, the total, the level and the badges.
 * - Program-driven progress (GPA, scores, suggested and template quests, portfolio, goals) always counts.
 * - Typed entries (own quests, activities, study slots, skill steps) count up to 40% of the total,
 *   with a floor of 30 XP so a new roadmap still rewards the first entries.
 */
export function scoreRoadmap(boxes: AnyBox[], ctx: ScoreContext): RoadmapScore {
  const pItems = portfolioItems(ctx.program);
  const pKeys = new Set(pItems.map((p) => p.key));
  const portfolioDone = new Set<string>();
  let earned = 0;
  let typed = 0;
  const raw: Record<string, { earned: number; typed: number }> = {};
  let goals = 0;
  let goalsDone = 0;
  let activities = 0;
  let backups = 0;
  let hasScores = false;

  for (const b of boxes) {
    let e = 0;
    let t = 0;
    switch (b.kind) {
      case "gpa": {
        e += Object.keys(b.data.terms).length * 10;
        const last = latestGpax(b.data);
        if (last !== null && ctx.program.minGpax !== null && last >= ctx.program.minGpax) e += 20;
        break;
      }
      case "scores":
        hasScores = true;
        if (ctx.chance !== null && ctx.chance >= 3) e += 20;
        break;
      case "quests":
        for (const q of b.data.items) {
          if (!q.done) continue;
          if (q.key.startsWith("own:")) t += q.xp;
          else e += q.xp;
        }
        break;
      case "portfolio":
        for (const k of b.data.done) if (pKeys.has(k)) portfolioDone.add(k);
        e += b.data.done.filter((k) => pKeys.has(k)).length * 20;
        break;
      case "goal":
        goals++;
        if (goalReached(b.data)) {
          goalsDone++;
          e += 30;
        }
        break;
      case "activities":
        activities += b.data.items.length;
        t += b.data.items.length * 15;
        break;
      case "motto":
        if (b.data.text) e += 10;
        break;
      case "study":
        if (studyDone(b.data, ctx.today)) t += b.data.slots.filter((s) => s.done).length * 5;
        break;
      case "skills":
        t += b.data.items.reduce((s, x) => s + Math.max(0, x.now - x.start) * 5, 0);
        break;
      case "backup":
        backups += b.data.programIds.length;
        if (b.data.programIds.length) e += 10;
        break;
      default:
        break;
    }
    raw[b.id] = { earned: e, typed: t };
    earned += e;
    typed += t;
  }

  // typed ≤ 40% of (earned + typed)  ⇔  typed ≤ earned × 2/3
  const allowedTyped = Math.min(typed, Math.max(TYPED_XP_FLOOR, Math.floor((earned * TYPED_XP_SHARE) / (1 - TYPED_XP_SHARE))));
  const ratio = typed === 0 ? 1 : allowedTyped / typed;
  const boxXp: Record<string, number> = {};
  for (const [id, r] of Object.entries(raw)) boxXp[id] = r.earned + Math.floor(r.typed * ratio);
  const xp = earned + allowedTyped;
  const level = levelOf(xp);

  const badges: Badge[] = [
    { key: "first", label: "ก้าวแรก", hint: "เพิ่มกล่องแรก", earned: boxes.length > 0 },
    { key: "goal", label: "ตั้งเป้า", hint: "เพิ่มกล่องเป้าหมาย", earned: goals > 0 },
    { key: "goal-done", label: "เป้าสำเร็จ", hint: "ทำเป้าหมายให้สำเร็จ", earned: goalsDone > 0 },
    { key: "exam", label: "สายสอบ", hint: "คะแนนที่คำนวณไว้มีโอกาสติดระดับ 3 ขึ้นไป", earned: hasScores && (ctx.chance ?? 0) >= 3 },
    {
      key: "portfolio",
      label: "พอร์ตพร้อม",
      hint: "ติ๊กพอร์ตครบทุกข้อ",
      earned: pItems.length > 0 && portfolioDone.size === pItems.length,
    },
    { key: "activities", label: "นักกิจกรรม", hint: "บันทึกกิจกรรม 5 รายการ", earned: activities >= 5 },
    { key: "backup", label: "มีแผนสำรอง", hint: "เพิ่มหลักสูตรสำรอง", earned: backups > 0 },
    { key: "full", label: "ครบ 10 กล่อง", hint: "ใช้กล่องครบ 10 กล่อง", earned: boxes.length >= ROADMAP_MAX_BOXES },
    { key: "lv5", label: "Lv 5", hint: "ไปให้ถึงเลเวล 5", earned: level >= 5 },
    { key: "lv10", label: "Lv 10", hint: "ไปให้ถึงเลเวล 10", earned: level >= 10 },
  ];

  return {
    xp,
    level,
    levelStart: (level - 1) * XP_PER_LEVEL,
    nextLevelXp: level * XP_PER_LEVEL,
    cappedXp: typed - allowedTyped,
    boxXp,
    badges,
  };
}
