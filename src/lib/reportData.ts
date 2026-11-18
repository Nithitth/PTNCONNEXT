import "server-only";
import { loadRooms } from "@/lib/accessData";
import { DEFAULT_ASSUMPTIONS, DEFAULT_OKRS, cleanAssumptions, cleanOkrs, rangeIso, type Assumptions, type Okr } from "@/lib/report";
import type { PostType, RawDue, RawFeedback, RawLogin, RawPost, ReportRaw, Role } from "@/lib/reportAnalysis";
import { cleanTags, type Tags } from "@/lib/reportIdeas";
import { SUBJECTS } from "@/lib/school";
import { createAdminClient } from "@/lib/supabase/admin";
import { FREE_LIMITS } from "@/lib/usage";

// Reads for รายงาน & OKR (admin client). Callers must run requireProfile({ roles: ["admin"] }) first.
// Everything leaves this file as counts and dates: private tables (TCAS targets, Roadmaps) are only
// counted here and never listed, and groups under 3 students are dropped, like the *_totals() functions.

const BIG = 50_000;
const subjectName = (code: string | undefined) => SUBJECTS.find((s) => s.code === code)?.name ?? null;
const MIN_GROUP = 3;
/** Days after the period that the workload section also covers. */
export const AHEAD_DAYS = 14;

export type ReportBundle = {
  current: ReportRaw;
  previous: ReportRaw;
  okrs: Okr[];
  assumptions: Assumptions;
  tags: Tags;
  avgFileBytes: number | null;
  /** 0–1 of the free storage used by teacher files kept in Connext. */
  storageUse: number;
  /** Posts per subject in the current period (every subject, zeros included). */
  subjectPosts: { subject: string; posts: number }[];
  roomLabels: Record<string, string>;
};

type Span = { from: string; to: string };

/** The current period and the one before it, in one go (each table is read once for both). */
export async function loadReport(current: Span, previous: Span): Promise<ReportBundle> {
  const db = createAdminClient();
  const wide = { start: rangeIso(previous).start, end: rangeIso(current).end };
  // The workload section also looks 14 days past the period, so upcoming exam clashes can still be acted on.
  const ahead = new Date(Date.parse(wide.end) + AHEAD_DAYS * 86_400_000).toISOString();

  const [rooms, regs, profiles, logins, posts, dues, drive, errorsCur, errorsPrev, feedback, targets, roadmaps, files, settings] = await Promise.all([
    loadRooms(),
    db.from("registrations").select("kind, claimed_by, claimed_at").limit(BIG),
    db.from("profiles").select("id, role, classroom_id").limit(BIG),
    db.from("login_events").select("user_id, success, created_at").gte("created_at", wide.start).lte("created_at", wide.end).limit(BIG),
    db
      .from("posts")
      .select("id, type, exam_kind, author_id, created_at, subject:subjects(code), post_targets(classroom_id, due_at), attachments(kind, drive_file_id)")
      .gte("created_at", wide.start)
      .lte("created_at", wide.end)
      .limit(BIG),
    db
      .from("post_targets")
      .select("classroom_id, due_at, post:posts(type, exam_kind, created_at, subject:subjects(code))")
      .not("classroom_id", "is", null)
      .gte("due_at", wide.start)
      .lte("due_at", ahead)
      .limit(BIG),
    db.from("drive_connections").select("user_id").limit(BIG),
    db.from("error_logs").select("*", { count: "exact", head: true }).gte("created_at", rangeIso(current).start).lte("created_at", rangeIso(current).end),
    db.from("error_logs").select("*", { count: "exact", head: true }).gte("created_at", rangeIso(previous).start).lte("created_at", rangeIso(previous).end),
    db
      .from("feedback")
      .select("id, message, created_at, user:profiles(role)")
      .gte("created_at", wide.start)
      .lte("created_at", wide.end)
      .order("created_at", { ascending: false })
      .limit(5000),
    db.from("tcas_targets").select("student_id, program:tcas_programs(faculty, university_name)").limit(BIG),
    db.from("tcas_roadmaps").select("student_id, stage").limit(BIG),
    db.from("attachments").select("kind, size_bytes, drive_file_id, expired_at").limit(BIG),
    db.from("app_settings").select("key, value").in("key", ["report_okrs", "report_assumptions", "feedback_tags"]),
  ]);
  for (const r of [regs, profiles, logins, posts, dues, drive, feedback, targets, roadmaps, files, settings]) if (r.error) throw r.error;

  // People: role and room by id. Only students count towards the student percentages.
  const who = new Map<string, { role: Role; classroomId: string | null }>();
  for (const p of profiles.data ?? []) who.set(p.id, { role: p.role as Role, classroomId: p.classroom_id });
  const isStudent = (id: string) => who.get(id)?.role === "student";
  const accounts = { students: 0, teachers: 0, admins: 0 };
  for (const p of who.values()) accounts[p.role === "student" ? "students" : p.role === "teacher" ? "teachers" : "admins"]++;

  const regRows = regs.data ?? [];
  const roster = {
    studentsTotal: regRows.filter((r) => r.kind === "student").length,
    studentsRegistered: regRows.filter((r) => r.kind === "student" && r.claimed_by).length,
    teachersTotal: regRows.filter((r) => r.kind === "teacher").length,
    teachersRegistered: regRows.filter((r) => r.kind === "teacher" && r.claimed_by).length,
  };
  const signupDates = regRows.filter((r) => r.claimed_at).map((r) => r.claimed_at as string);

  const allLogins: RawLogin[] = (logins.data ?? []).map((l) => {
    const p = l.user_id ? who.get(l.user_id) : undefined;
    return { at: l.created_at, ok: l.success, userId: l.user_id, role: p?.role ?? null, classroomId: p?.classroomId ?? null };
  });

  type PostRow = {
    id: string;
    type: PostType;
    exam_kind: "quiz" | "major" | null;
    author_id: string;
    created_at: string;
    subject: { code: string } | null;
    post_targets: { classroom_id: string | null; due_at: string | null }[];
    attachments: { kind: string; drive_file_id: string | null }[];
  };
  const allPosts: RawPost[] = ((posts.data ?? []) as unknown as PostRow[]).map((p) => ({
    id: p.id,
    type: p.type,
    examKind: p.type === "exam" ? p.exam_kind : null,
    subject: subjectName(p.subject?.code),
    authorId: p.author_id,
    createdAt: p.created_at,
    hasFile: p.attachments.some((a) => a.kind === "file" || a.drive_file_id),
    targets: p.post_targets.map((t) => ({ classroomId: t.classroom_id, dueAt: t.due_at })),
  }));

  type DueRow = {
    classroom_id: string;
    due_at: string;
    post: { type: PostType; exam_kind: "quiz" | "major" | null; created_at: string; subject: { code: string } | null } | null;
  };
  const allDues: RawDue[] = ((dues.data ?? []) as unknown as DueRow[])
    .filter((d) => d.post)
    .map((d) => ({
      type: d.post!.type,
      examKind: d.post!.exam_kind,
      subject: subjectName(d.post!.subject?.code),
      classroomId: d.classroom_id,
      dueAt: d.due_at,
      createdAt: d.post!.created_at,
    }));

  type FeedbackRow = { id: string; message: string; created_at: string; user: { role: Role } | null };
  const allFeedback: RawFeedback[] = ((feedback.data ?? []) as unknown as FeedbackRow[]).map((f) => ({
    id: f.id,
    at: f.created_at,
    message: f.message,
    role: f.user?.role ?? null,
  }));

  // TCAS targets and Roadmaps: counted only (students), groups under 3 dropped.
  type TargetRow = { student_id: string; program: { faculty: string; university_name: string } | null };
  const targetRows = ((targets.data ?? []) as unknown as TargetRow[]).filter((t) => isStudent(t.student_id));
  const byFaculty = new Map<string, Set<string>>();
  for (const t of targetRows) {
    if (!t.program) continue;
    const label = `${t.program.faculty} · ${t.program.university_name}`;
    if (!byFaculty.has(label)) byFaculty.set(label, new Set());
    byFaculty.get(label)!.add(t.student_id);
  }
  const topTargets = [...byFaculty]
    .map(([label, s]) => ({ label, students: s.size }))
    .filter((x) => x.students >= MIN_GROUP)
    .sort((a, b) => b.students - a.students)
    .slice(0, 5);
  const studentsWithTarget = new Set(targetRows.map((t) => t.student_id)).size;
  const studentRoadmaps = (roadmaps.data ?? []).filter((r) => isStudent(r.student_id));
  const roadmapStages: Record<number, number> = {};
  for (const r of studentRoadmaps) roadmapStages[r.stage] = (roadmapStages[r.stage] ?? 0) + 1;

  const fileRows = files.data ?? [];
  const kept = fileRows.filter((f) => f.kind === "file" && !f.expired_at);
  const sizes = fileRows.map((f) => f.size_bytes).filter((n): n is number => typeof n === "number" && n > 0);
  const storageBytes = kept.reduce((n, f) => n + (f.size_bytes ?? 0), 0);
  const driveFiles = fileRows.filter((f) => f.drive_file_id).length;

  const setting = (key: string) => (settings.data ?? []).find((s) => s.key === key)?.value;
  const okrsSaved = cleanOkrs(setting("report_okrs"));
  const assumptionsSaved = cleanAssumptions(setting("report_assumptions"));
  const tagsSaved = cleanTags(setting("feedback_tags") ?? {});

  const driveTeachers = (drive.data ?? []).filter((d) => who.get(d.user_id)?.role !== "student").length;

  const build = (span: Span, errors: number, lookAhead = false): ReportRaw => {
    const start = Date.parse(rangeIso(span).start);
    const end = Date.parse(rangeIso(span).end);
    const inSpanT = (iso: string | null) => iso !== null && Date.parse(iso) >= start && Date.parse(iso) <= end;
    const periodPosts = allPosts.filter((p) => inSpanT(p.createdAt));
    return {
      range: span,
      roster,
      rooms: rooms.map((r) => ({ classroomId: r.classroomId, label: r.label, total: r.total, registered: r.registered })),
      accounts,
      signups: signupDates.filter(inSpanT),
      logins: allLogins.filter((l) => inSpanT(l.at)),
      posts: periodPosts,
      dues: allDues.filter((d) => inSpanT(d.dueAt) || (lookAhead && Date.parse(d.dueAt) > end && Date.parse(d.dueAt) <= end + AHEAD_DAYS * 86_400_000)),
      files: periodPosts.filter((p) => p.hasFile).length,
      // Files that live in teachers' Google Drive (all time: they never used the school's storage).
      driveFiles: driveFiles,
      driveTeachers,
      errors,
      feedback: allFeedback.filter((f) => inSpanT(f.at)),
      studentsWithTarget,
      studentsWithRoadmap: studentRoadmaps.length,
      roadmapStages: Object.fromEntries(Object.entries(roadmapStages).filter(([, n]) => n >= MIN_GROUP)),
      topTargets,
      storageBytes,
    };
  };

  const cur = build(current, errorsCur.count ?? 0, true);

  return {
    current: cur,
    previous: build(previous, errorsPrev.count ?? 0),
    okrs: "okrs" in okrsSaved ? okrsSaved.okrs : DEFAULT_OKRS,
    assumptions: "assumptions" in assumptionsSaved ? assumptionsSaved.assumptions : DEFAULT_ASSUMPTIONS,
    tags: "tags" in tagsSaved ? tagsSaved.tags : {},
    avgFileBytes: sizes.length ? sizes.reduce((a, b) => a + b, 0) / sizes.length : null,
    storageUse: Math.min(1, storageBytes / FREE_LIMITS.storageBytes),
    subjectPosts: SUBJECTS.map((s) => ({ subject: s.name, posts: cur.posts.filter((p) => p.subject === s.name).length })),
    roomLabels: Object.fromEntries(rooms.map((r) => [r.classroomId, r.label])),
  };
}
