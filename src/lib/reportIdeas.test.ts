import assert from "node:assert/strict";
import { test } from "node:test";
import type { ReportStats } from "./report";
import { funnel, workload, type RawFeedback } from "./reportAnalysis";
import { classifyFeedback, cleanTags, ideaCards, themeSummary, topThemes, withTags, type IdeaContext } from "./reportIdeas";

test("classifyFeedback: kind and topics from Thai keywords", () => {
  assert.deepEqual(classifyFeedback("เปิดไฟล์ PDF ในมือถือไม่ได้ ค้างตลอด"), { kind: "bug", topics: ["files", "mobile"] });
  assert.deepEqual(classifyFeedback("อยากให้มีแจ้งเตือนก่อนกำหนดส่งงาน"), { kind: "request", topics: ["calendar", "notify"] });
  assert.deepEqual(classifyFeedback("ขอบคุณครับ ใช้งานง่ายดี"), { kind: "praise", topics: ["other"] });
  assert.equal(classifyFeedback("TCAS คณะนี้ใช้คะแนนอะไรบ้างคะ?").kind, "question");
  assert.deepEqual(classifyFeedback("เว็บโหลดนานมาก").topics, ["speed"]);
  // Traps: "ขอบคุณ" isn't a request, "เสียเวลา" isn't about colours, "ใช้งาน" isn't about work.
  assert.equal(classifyFeedback("ขอบคุณที่ทำเว็บนี้").kind, "praise");
  assert.deepEqual(classifyFeedback("เสียเวลาน้อยลง ใช้งานสะดวก").topics, ["other"]);
});

const fb = (id: string, message: string, role: RawFeedback["role"] = "student"): RawFeedback => ({
  id: `00000000-0000-0000-0000-${id.padStart(12, "0")}`,
  at: "2026-11-18T03:00:00Z",
  message,
  role,
});

test("withTags lets hand-made tags win, cleanTags checks them", () => {
  const items = [fb("1", "อยากให้มีโหมดมืด"), fb("2", "ชอบมาก")];
  const tagged = withTags(items, { [items[1].id]: { kind: "request", topics: ["design"] } });
  assert.equal(tagged[0].kind, "request");
  assert.equal(tagged[0].manual, false);
  assert.equal(tagged[1].kind, "request");
  assert.equal(tagged[1].manual, true);
  assert.ok("tags" in cleanTags({ [items[0].id]: { kind: "bug", topics: ["mobile", "mobile", "nope"] } }));
  const c = cleanTags({ [items[0].id]: { kind: "bug", topics: ["mobile", "mobile", "nope"] } });
  if ("tags" in c) assert.deepEqual(c.tags[items[0].id].topics, ["mobile"]);
  assert.ok("error" in cleanTags({ "not-an-id": { kind: "bug", topics: [] } }));
  assert.ok("error" in cleanTags({ [items[0].id]: { kind: "nope", topics: [] } }));
  assert.ok("error" in cleanTags([]));
});

test("themeSummary counts by role and against last period; topThemes hides text", () => {
  const cur = withTags([fb("1", "มือถือเปิดไม่ได้"), fb("2", "แอปบนมือถือค้าง", "teacher"), fb("3", "อยากให้มีแจ้งเตือน")], {});
  const prev = withTags([fb("4", "มือถือช้า")], {});
  const t = themeSummary(cur, prev);
  const mobile = t.topics.find((x) => x.key === "mobile")!;
  assert.equal(mobile.count, 2);
  assert.equal(mobile.previous, 1);
  assert.equal(mobile.students, 1);
  assert.equal(mobile.staff, 1);
  assert.equal(t.requests.length, 1);
  const top = topThemes(cur);
  assert.equal(top[0].th, "มือถือ");
  assert.ok(top.every((x) => !("message" in x)));
});

const STATS: ReportStats = {
  studentsTotal: 100,
  studentsRegistered: 80,
  teachersTotal: 10,
  teachersRegistered: 10,
  accounts: 90,
  studentAccounts: 80,
  teacherAccounts: 10,
  signups: 0,
  activeUsers: 60,
  activeStudents: 50,
  weeklyActivePct: 40,
  logins: 100,
  loginSuccessPct: 99,
  posts: 20,
  postsPerWeek: 10,
  teachersPosting: 5,
  teachersPostingPct: 50,
  materials: 5,
  files: 5,
  driveFiles: 0,
  leadTimeDays: 2,
  studentsWithTarget: 10,
  studentsWithTargetPct: 12.5,
  studentsWithRoadmap: 5,
  studentsWithRoadmapPct: 6,
  avgRoadmapStage: 1,
  errors: 0,
  errorsPerWeek: 0,
  feedback: 0,
  driveTeachers: 1,
  driveTeachersPct: 10,
};

function ctx(over: Partial<IdeaContext> = {}): IdeaContext {
  return {
    stats: STATS,
    funnel: funnel(STATS),
    rooms: [],
    work: workload([]),
    roomLabel: (id) => id,
    peak: null,
    feedback: [],
    subjectPosts: [],
    storageUse: 0,
    ...over,
  };
}

test("idea rules fire on matching data", () => {
  const keys = (c: IdeaContext) => ideaCards(c).map((i) => i.key);
  // 10 of 50 active students have a target → TCAS onboarding; 1/10 teachers on Drive → Drive idea.
  assert.ok(keys(ctx()).includes("tcas-onboarding"));
  assert.ok(keys(ctx()).includes("drive-drive"));
  const bugs = withTags([fb("1", "มือถือเปิดไม่ได้"), fb("2", "บนมือถือกดไม่ได้"), fb("3", "อยากให้มีแจ้งเตือน"), fb("4", "ขอให้มีแจ้งเตือนก่อนสอบ")], {});
  const k = keys(ctx({ feedback: bugs, peak: { day: 6, hour: 20, count: 9 } }));
  assert.ok(k.includes("fix-mobile"));
  assert.ok(k.includes("reminders"));
  const cards = ideaCards(ctx({ feedback: bugs }));
  const mobile = cards.find((c) => c.key === "fix-mobile")!;
  assert.equal(mobile.quotes.length, 2);
  assert.equal(mobile.metric, "feedback_count");
  const lagging = keys(ctx({ rooms: [{ classroomId: "a", label: "ม.4/1", total: 40, registered: 5, registeredPct: 12.5, active: 0, activePct: 0 }] }));
  assert.ok(lagging.includes("room-campaign"));
  assert.ok(keys(ctx({ storageUse: 0.7 })).includes("capacity"));
  assert.ok(
    keys(
      ctx({
        subjectPosts: [
          { subject: "PAT", posts: 0 },
          { subject: "คณิตศาสตร์", posts: 12 },
        ],
      }),
    ).includes("teacher-training"),
  );
});

test("idea rules stay quiet without signal, and cards are sorted", () => {
  const calm: ReportStats = { ...STATS, studentsWithTarget: 45, driveTeachers: 8, driveTeachersPct: 80, leadTimeDays: 6 };
  const keys = ideaCards(ctx({ stats: calm, funnel: funnel(calm), work: { ...workload([]), leadAssignments: 6 } })).map((i) => i.key);
  assert.deepEqual(keys, []);
  const cards = ideaCards(ctx({ storageUse: 0.9 }));
  for (let i = 1; i < cards.length; i++) assert.ok(cards[i - 1].strength >= cards[i].strength);
});

test("no 'get teachers onto Drive' idea once the school drive is connected", () => {
  assert.ok(ideaCards(ctx()).some((i) => i.key === "drive-drive"));
  assert.ok(!ideaCards(ctx({ schoolDrive: true })).some((i) => i.key === "drive-drive"));
});
