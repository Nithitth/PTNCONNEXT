// ไอเดียโครงการถัดไป (team page under รายงาน & OKR). Pure: sorts feedback into themes with Thai keyword
// rules and turns feedback + usage patterns into idea cards for the team's next projects.
// Team-only: the printed report and the presentation use topThemes() and never show message text.
// Tested in reportIdeas.test.ts.

import { formatDay, formatValue, roomText, type Lang, type ReportStats } from "./report";
import { DAYS, type FunnelStep, type RawFeedback, type Role, type RoomRank, type Workload } from "./reportAnalysis";

// ─── Feedback themes ─────────────────────────────────────────

export type FeedbackKind = "bug" | "request" | "question" | "praise" | "other";
export type FeedbackTopic = "calendar" | "files" | "tcas" | "roadmap" | "login" | "speed" | "mobile" | "notify" | "design" | "other";

export const KINDS: Record<FeedbackKind, { th: string; en: string; words: string[] }> = {
  bug: {
    th: "ปัญหา/บั๊ก",
    en: "Problem / bug",
    words: ["ปัญหา", "บั๊ก", "บัค", "bug", "error", "เออเร่อ", "ไม่ได้", "ไม่ขึ้น", "ไม่แสดง", "ค้าง", "พัง", "เด้ง", "ผิดพลาด", "หาย", "ใช้ไม่ได้", "กดไม่ได้"],
  },
  request: {
    th: "อยากให้มี",
    en: "Feature request",
    // Not a bare "ขอ": it's inside "ขอบคุณ".
    words: ["อยากให้", "อยากได้", "ขอให้", "ขอเพิ่ม", "ควรมี", "น่าจะมี", "ถ้ามี", "เพิ่ม", "ช่วยทำ", "อยากมี", "feature"],
  },
  question: { th: "คำถาม", en: "Question", words: ["ไหม", "มั้ย", "ยังไง", "อย่างไร", "ทำไม", "หรือเปล่า", "?", "ได้หรือ"] },
  praise: { th: "คำชม", en: "Praise", words: ["ดีมาก", "ชอบ", "สะดวก", "ขอบคุณ", "เยี่ยม", "เจ๋ง", "ปัง", "สุดยอด", "ง่ายดี", "ดีจัง", "ดีครับ", "ดีค่ะ", "love", "great"] },
  other: { th: "อื่น ๆ", en: "Other", words: [] },
};

export const TOPICS: Record<FeedbackTopic, { th: string; en: string; words: string[] }> = {
  // Whole words only where a short one hides inside common words ("งาน" is in "ใช้งาน", "สี" in "เสีย", "line" in "deadline").
  calendar: { th: "ปฏิทิน/งาน", en: "Calendar & work", words: ["ปฏิทิน", "การบ้าน", "ส่งงาน", "ชิ้นงาน", "มอบหมาย", "กำหนดส่ง", "วันสอบ", "สอบ", "deadline"] },
  files: { th: "ไฟล์/เอกสาร", en: "Files & materials", words: ["ไฟล์", "pdf", "เอกสาร", "ดาวน์โหลด", "สไลด์", "drive", "ไดรฟ์", "ชีท"] },
  tcas: { th: "TCAS", en: "TCAS", words: ["tcas", "มหาลัย", "มหาวิทยาลัย", "คณะ", "คะแนน", "สมัคร", "รอบ", "หลักสูตร"] },
  roadmap: { th: "Roadmap", en: "Roadmap", words: ["roadmap", "โรดแมป", "ภารกิจ", "xp", "ด่าน", "การ์ด", "รางวัล"] },
  login: { th: "เข้าสู่ระบบ/บัญชี", en: "Log-in & account", words: ["เข้าสู่ระบบ", "ล็อกอิน", "login", "รหัสผ่าน", "ลงทะเบียน", "บัญชี", "otp", "ยืนยัน", "สองขั้นตอน"] },
  speed: { th: "ช้า", en: "Speed", words: ["ช้า", "โหลดนาน", "หน่วง", "กระตุก", "lag", "รอนาน"] },
  mobile: { th: "มือถือ", en: "Mobile", words: ["มือถือ", "โทรศัพท์", "iphone", "android", "ไอโฟน", "จอเล็ก", "แอป"] },
  notify: { th: "การแจ้งเตือน", en: "Notifications", words: ["แจ้งเตือน", "เตือน", "notification", "noti", "ไลน์"] },
  design: { th: "หน้าตา/ตัวอักษร", en: "Look & text", words: ["สีสัน", "โทนสี", "ตัวหนังสือ", "ตัวอักษร", "ฟอนต์", "หน้าตา", "ดีไซน์", "ตัวเล็ก", "อ่านยาก"] },
  other: { th: "อื่น ๆ", en: "Other", words: [] },
};

const has = (text: string, words: string[]) => words.some((w) => text.includes(w));

/** One kind (problems first, then requests, questions, praise) and every topic the message mentions. */
export function classifyFeedback(message: string): { kind: FeedbackKind; topics: FeedbackTopic[] } {
  const t = message.toLowerCase();
  const kind = (["bug", "request", "question", "praise"] as FeedbackKind[]).find((k) => has(t, KINDS[k].words)) ?? "other";
  const topics = (Object.keys(TOPICS) as FeedbackTopic[]).filter((k) => k !== "other" && has(t, TOPICS[k].words));
  return { kind, topics: topics.length ? topics : ["other"] };
}

export type Tag = { kind: FeedbackKind; topics: FeedbackTopic[] };
export type Tags = Record<string, Tag>;
export type TaggedFeedback = RawFeedback & Tag & { manual: boolean };

/** Auto themes, with the team's hand-made tags (app_settings.feedback_tags) taking priority. */
export function withTags(messages: RawFeedback[], tags: Tags): TaggedFeedback[] {
  return messages.map((m) => (tags[m.id] ? { ...m, ...tags[m.id], manual: true } : { ...m, ...classifyFeedback(m.message), manual: false }));
}

/** Checks the hand-made tags before saving (known kinds/topics, valid ids, at most 5000). */
export function cleanTags(raw: unknown): { tags: Tags } | { error: string } {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { error: "ข้อมูลไม่ถูกต้อง" };
  const out: Tags = {};
  for (const [id, v] of Object.entries(raw as Record<string, unknown>).slice(0, 5000)) {
    if (!/^[0-9a-f-]{36}$/i.test(id)) return { error: "ข้อมูลไม่ถูกต้อง" };
    const t = v as { kind?: unknown; topics?: unknown };
    if (typeof t?.kind !== "string" || !(t.kind in KINDS)) return { error: "ประเภทไม่ถูกต้อง" };
    const topics = Array.isArray(t.topics) ? [...new Set(t.topics.filter((x): x is FeedbackTopic => typeof x === "string" && x in TOPICS))] : [];
    out[id] = { kind: t.kind as FeedbackKind, topics: topics.length ? topics.slice(0, 5) : ["other"] };
  }
  return { tags: out };
}

export type ThemeCount<K> = { key: K; th: string; en: string; count: number; previous: number; students: number; staff: number };

const isStaff = (r: Role | null) => r === "teacher" || r === "admin";

function countBy<K extends string>(
  items: TaggedFeedback[],
  prev: TaggedFeedback[],
  keysOf: (f: TaggedFeedback) => K[],
  labels: Record<K, { th: string; en: string }>,
) {
  return (Object.keys(labels) as K[])
    .map((key) => {
      const mine = items.filter((f) => keysOf(f).includes(key));
      return {
        key,
        th: labels[key].th,
        en: labels[key].en,
        count: mine.length,
        previous: prev.filter((f) => keysOf(f).includes(key)).length,
        students: mine.filter((f) => f.role === "student").length,
        staff: mine.filter((f) => isStaff(f.role)).length,
      };
    })
    .filter((c) => c.count > 0 || c.previous > 0)
    .sort((a, b) => b.count - a.count);
}

export function themeSummary(items: TaggedFeedback[], prev: TaggedFeedback[]) {
  return {
    kinds: countBy<FeedbackKind>(items, prev, (f) => [f.kind], KINDS),
    topics: countBy<FeedbackTopic>(items, prev, (f) => f.topics, TOPICS),
    requests: items.filter((f) => f.kind === "request").sort((a, b) => b.at.localeCompare(a.at)),
  };
}

/** The anonymous one-liner for the printed report: the 3 topics people raise most (counts only, no text). */
export function topThemes(items: TaggedFeedback[]): { th: string; en: string; count: number }[] {
  return themeSummary(items, [])
    .topics.filter((t) => t.key !== "other")
    .slice(0, 3)
    .map((t) => ({ th: t.th, en: t.en, count: t.count }));
}

// ─── Idea cards ──────────────────────────────────────────────

export type IdeaCard = {
  key: string;
  strength: number;
  th: { title: string; problem: string; step: string };
  en: { title: string; problem: string; step: string };
  /** Numbers behind the idea, already written out. */
  evidence: { th: string; en: string }[];
  /** Up to 2 short feedback quotes (no names). */
  quotes: string[];
  /** The key result it would move (a METRICS key). */
  metric: string;
};

export type IdeaContext = {
  stats: ReportStats;
  funnel: FunnelStep[];
  rooms: RoomRank[];
  work: Workload;
  roomLabel: (id: string) => string;
  peak: { day: number; hour: number; count: number } | null;
  feedback: TaggedFeedback[];
  /** Posts per subject in the period (subject name → count), every subject listed. */
  subjectPosts: { subject: string; posts: number }[];
  /** 0–1 share of the free storage / database used. */
  storageUse: number;
  /** The school's Shared Drive takes every PDF: no need to get teachers onto their own Drive. */
  schoolDrive?: boolean;
};

const quote = (m: string) => (m.length > 120 ? `${m.slice(0, 117).trim()}…` : m);
const quotesFor = (fb: TaggedFeedback[], pick: (f: TaggedFeedback) => boolean) =>
  fb
    .filter(pick)
    .slice(0, 2)
    .map((f) => quote(f.message));
const num = (v: number, lang: Lang) => Math.round(v).toLocaleString(lang === "th" ? "th-TH" : "en-US");

/** Suggested next projects, strongest evidence first. Each rule needs real signal before it fires. */
export function ideaCards(c: IdeaContext): IdeaCard[] {
  const out: IdeaCard[] = [];
  const s = c.stats;
  const fb = c.feedback;
  const topicCount = (t: FeedbackTopic) => fb.filter((f) => f.topics.includes(t)).length;
  const kindTopic = (k: FeedbackKind, t: FeedbackTopic) => fb.filter((f) => f.kind === k && f.topics.includes(t)).length;

  // 1. Students sign up but don't plan for university.
  const target = c.funnel.find((f) => f.key === "target");
  if (target && s.activeStudents >= 10 && (target.fromPrev ?? 100) < 50) {
    out.push({
      key: "tcas-onboarding",
      strength: 90 - (target.fromPrev ?? 0) / 2,
      th: {
        title: "คาบแนะแนว: ตั้งเป้าหมาย TCAS ด้วยกัน",
        problem: "นักเรียนเข้าใช้ แต่ส่วนใหญ่ยังไม่ได้ตั้งเป้าหมาย TCAS",
        step: "คุยกับครูแนะแนว ขอ 1 คาบให้ทุกห้องเปิด TCAS แล้วบันทึกเป้าหมายแรก",
      },
      en: {
        title: "Guidance-class session: set a TCAS target together",
        problem: "Students use Connext, but most haven't set a TCAS target",
        step: "Ask the guidance teacher for one period where every class opens TCAS and saves a first target",
      },
      evidence: [
        {
          th: `นักเรียนที่เข้าใช้ ${num(s.activeStudents, "th")} คน ตั้งเป้าหมายแล้ว ${num(s.studentsWithTarget, "th")} คน`,
          en: `${num(s.studentsWithTarget, "en")} of ${num(s.activeStudents, "en")} active students have a target`,
        },
      ],
      quotes: quotesFor(fb, (f) => f.topics.includes("tcas")),
      metric: "students_with_target_pct",
    });
  }

  // 2. Rooms that lag behind.
  const lagging = c.rooms.filter((r) => r.total >= 5 && (r.registeredPct ?? 0) < 50);
  if (lagging.length) {
    out.push({
      key: "room-campaign",
      strength: 70 + lagging.length * 3,
      th: {
        title: "แคมเปญชวนห้องที่ยังลงทะเบียนน้อย",
        problem: `${lagging.length} ห้องลงทะเบียนไม่ถึงครึ่ง`,
        step: "ให้อาสาของห้องเปิด QR ลงทะเบียนในคาบโฮมรูม และจัดแข่งห้องที่ครบ 100% ก่อน",
      },
      en: {
        title: "Sign-up campaign for lagging classes",
        problem: `${lagging.length} classes are under half signed up`,
        step: "Have each class volunteer open the sign-up QR in homeroom; reward the first class to reach 100%",
      },
      evidence: lagging.slice(0, 4).map((r) => ({ th: `${r.label}: ${r.registered}/${r.total} คน`, en: `${r.label}: ${r.registered}/${r.total}` })),
      quotes: [],
      metric: "students_signed_up_pct",
    });
  }

  // 3. Deadline reminders: evening use or people asking for notifications.
  const notify = topicCount("notify");
  const evening = c.peak && (c.peak.hour >= 18 || c.peak.day >= 5);
  if (notify >= 2 || (evening && s.activeUsers >= 10)) {
    out.push({
      key: "reminders",
      strength: 60 + notify * 8 + (evening ? 10 : 0),
      th: { title: "แจ้งเตือนก่อนกำหนดส่ง", problem: "นักเรียนเช็กงานช่วงเย็น/วันหยุด และอยากได้การแจ้งเตือน", step: "ทดลองส่งอีเมลสรุปงานที่ครบกำหนดใน 2 วัน ทุกเย็นให้ 1 ห้องก่อน" },
      en: {
        title: "Deadline reminders",
        problem: "Students check work in the evening or at weekends, and ask for reminders",
        step: "Pilot an evening email listing work due within 2 days, for one class first",
      },
      evidence: [
        ...(c.peak
          ? [
              {
                th: `ช่วงที่ใช้มากที่สุด: วัน${DAYS.th[c.peak.day]} ${String(c.peak.hour).padStart(2, "0")}:00`,
                en: `Busiest: ${DAYS.en[c.peak.day]} ${String(c.peak.hour).padStart(2, "0")}:00`,
              },
            ]
          : []),
        ...(notify ? [{ th: `ความคิดเห็นเรื่องการแจ้งเตือน ${notify} ข้อ`, en: `${notify} feedback messages about notifications` }] : []),
      ],
      quotes: quotesFor(fb, (f) => f.topics.includes("notify")),
      metric: "weekly_active_pct",
    });
  }

  // 4. Exam clashes.
  if (c.work.clashes.length) {
    out.push({
      key: "exam-clash",
      strength: 80 + c.work.clashes.length * 4,
      th: {
        title: "เตือนครูเมื่อวันสอบชนกัน",
        problem: "บางห้องมีสอบหลายวิชาในวันเดียว",
        step: "ในฟอร์มประกาศวันสอบ แสดงว่าห้องนั้นมีสอบอะไรอยู่แล้วในวันเดียวกัน และนำข้อมูลนี้ไปคุยกับฝ่ายวิชาการ",
      },
      en: {
        title: "Warn teachers about exam clashes",
        problem: "Some classes have several exams on one day",
        step: "Show existing exams for that class and day in the exam form, and share the data with academic affairs",
      },
      evidence: c.work.clashes.slice(0, 3).map((x) => ({
        th: `${c.roomLabel(x.classroomId)} ${formatDay(x.day, "th", false)}: สอบ ${x.exams} วิชา`,
        en: `${roomText(c.roomLabel(x.classroomId), "en")} ${formatDay(x.day, "en", false)}: ${x.exams} exams`,
      })),
      quotes: [],
      metric: "lead_time_days",
    });
  }

  // 5. Short notice.
  if (c.work.leadAssignments !== null && c.work.leadAssignments < 3) {
    out.push({
      key: "earlier-notice",
      strength: 65,
      th: {
        title: "ชวนครูแจ้งงานล่วงหน้า",
        problem: `ครูแจ้งงานล่วงหน้าเฉลี่ยเพียง ${formatValue(c.work.leadAssignments, "days", "th")}`,
        step: "เพิ่มคำแนะนำในฟอร์มมอบหมายงานเมื่อกำหนดส่งเร็วกว่า 3 วัน",
      },
      en: {
        title: "Nudge teachers to post work earlier",
        problem: `Assignments are announced only ${formatValue(c.work.leadAssignments, "days", "en")} ahead on average`,
        step: "Add a gentle tip in the assignment form when the deadline is under 3 days away",
      },
      evidence: [{ th: `เฉลี่ย ${formatValue(c.work.leadAssignments, "days", "th")}`, en: `Average ${formatValue(c.work.leadAssignments, "days", "en")}` }],
      quotes: [],
      metric: "lead_time_days",
    });
  }

  // 6. Subjects with few posts → teacher help.
  const quiet = c.subjectPosts.filter((x) => x.posts === 0);
  if (s.posts >= 5 && quiet.length) {
    out.push({
      key: "teacher-training",
      strength: 55 + quiet.length * 3,
      th: {
        title: "ช่วยครูวิชาที่ยังไม่ได้ใช้",
        problem: `วิชาที่ยังไม่มีโพสต์ในช่วงนี้: ${quiet.map((x) => x.subject).join(", ")}`,
        step: "นัดสอนครูกลุ่มสาระนั้น 15 นาที โดยใช้คู่มือครูในระบบ",
      },
      en: {
        title: "Help teachers of quiet subjects",
        problem: `Subjects with no posts this period: ${quiet.map((x) => x.subject).join(", ")}`,
        step: "Run a 15-minute walkthrough for those departments using the in-app teacher guide",
      },
      evidence: c.subjectPosts.map((x) => ({ th: `${x.subject}: ${x.posts} โพสต์`, en: `${x.subject}: ${x.posts} posts` })),
      quotes: [],
      metric: "teachers_posting_pct",
    });
  }

  // 7. Fix sprints from problem reports.
  for (const t of ["mobile", "speed", "login", "files", "calendar"] as FeedbackTopic[]) {
    // Any mention of slowness is a complaint; other topics need a problem report.
    const bugs = t === "speed" ? topicCount("speed") : kindTopic("bug", t);
    if (bugs >= 2) {
      out.push({
        key: `fix-${t}`,
        strength: 70 + bugs * 6,
        th: {
          title: `แก้ปัญหาเรื่อง${TOPICS[t].th}`,
          problem: `ผู้ใช้แจ้งปัญหาเรื่อง${TOPICS[t].th} ${bugs} ครั้ง`,
          step: "รวบรวมขั้นตอนที่เกิดปัญหา ทดลองบนมือถือจริง แล้วแก้ใน 1 สัปดาห์",
        },
        en: {
          title: `Fix sprint: ${TOPICS[t].en}`,
          problem: `${bugs} problem reports about ${TOPICS[t].en.toLowerCase()}`,
          step: "Collect the steps, reproduce on a real phone, fix within a week",
        },
        evidence: [{ th: `แจ้งปัญหา ${bugs} ข้อ`, en: `${bugs} reports` }],
        quotes: quotesFor(fb, (f) => f.kind === "bug" && f.topics.includes(t)),
        metric: "feedback_count",
      });
    }
  }

  // 8. Feature requests grouped by topic.
  for (const t of Object.keys(TOPICS) as FeedbackTopic[]) {
    // Requests that are really about notifications are covered by the reminders card.
    const asks = fb.filter((f) => f.kind === "request" && f.topics.includes(t) && !f.topics.includes("notify")).length;
    if (asks >= 2 && t !== "notify") {
      out.push({
        key: `request-${t}`,
        strength: 55 + asks * 7,
        th: {
          title: `สิ่งที่ผู้ใช้ขอ: ${TOPICS[t].th}`,
          problem: `มีคนขอเรื่อง${TOPICS[t].th} ${asks} ครั้ง`,
          step: "อ่านคำขอทั้งหมด เลือกสิ่งที่ขอซ้ำมากที่สุด แล้วร่างแบบให้ผู้ใช้ 3 คนลองดู",
        },
        en: {
          title: `Requested: ${TOPICS[t].en}`,
          problem: `${asks} requests about ${TOPICS[t].en.toLowerCase()}`,
          step: "Read all requests, pick the most repeated one, and test a sketch with 3 users",
        },
        evidence: [{ th: `คำขอ ${asks} ข้อ`, en: `${asks} requests` }],
        quotes: quotesFor(fb, (f) => f.kind === "request" && f.topics.includes(t) && !f.topics.includes("notify")),
        metric: "weekly_active_pct",
      });
    }
  }

  // 9. Few teachers on Google Drive.
  if (!c.schoolDrive && s.teacherAccounts >= 3 && (s.driveTeachersPct ?? 0) < 40) {
    out.push({
      key: "drive-drive",
      strength: 45 + c.storageUse * 40,
      th: { title: "ชวนครูเชื่อมต่อ Google Drive", problem: "ครูส่วนใหญ่ยังเก็บ PDF ในระบบ ซึ่งใช้พื้นที่และโควตาดาวน์โหลดฟรี", step: "สาธิตการเชื่อมต่อ 1 นาทีในประชุมครู" },
      en: {
        title: "Get teachers onto Google Drive",
        problem: "Most teachers still store PDFs in Connext, using the free storage and download quota",
        step: "Demo the 1-minute connection in a staff meeting",
      },
      evidence: [{ th: `เชื่อมต่อแล้ว ${s.driveTeachers}/${s.teacherAccounts} คน`, en: `${s.driveTeachers}/${s.teacherAccounts} connected` }],
      quotes: [],
      metric: "drive_teachers_pct",
    });
  }

  // 10. Close to the free limits.
  if (c.storageUse >= 0.6) {
    out.push({
      key: "capacity",
      strength: 60 + c.storageUse * 40,
      th: {
        title: "เตรียมพื้นที่ก่อนเต็ม",
        problem: `ใช้พื้นที่ฟรีไปแล้ว ${Math.round(c.storageUse * 100)}%`,
        step: "เปิดใช้ Google Drive ให้ครบทุกครู หรือขอโรงเรียนพิจารณาแพ็กเกจเสียเงิน",
      },
      en: {
        title: "Plan capacity before it runs out",
        problem: `${Math.round(c.storageUse * 100)}% of the free storage is used`,
        step: "Move every teacher to Google Drive, or ask the school about a paid plan",
      },
      evidence: [{ th: `${Math.round(c.storageUse * 100)}% ของพื้นที่ฟรี`, en: `${Math.round(c.storageUse * 100)}% of free storage` }],
      quotes: [],
      metric: "errors_per_week",
    });
  }

  return out.sort((a, b) => b.strength - a.strength);
}
