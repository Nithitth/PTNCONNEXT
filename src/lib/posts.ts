import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Profile } from "@/lib/auth";
import { addDays, bangkokInputToIso, type Attachment, type CalendarItem, type DayKey } from "@/lib/calendar";
import type { ExamKind, PostKind } from "@/lib/postForm";
import { formatClassroom } from "@/lib/roster";

// Reads posts for the calendar and the Teacher's Console.
// Always called with the user's own client, so RLS decides what comes back:
// students get only their classroom + whole-school posts.

const KINDS: PostKind[] = ["assignment", "material", "exam", "event"];

type SubjectRow = { code: string; name_th: string; color: string } | null;
type AttachmentRow = { id: string; kind: "file" | "link"; url: string | null; file_name: string };
type ClassroomRow = { grade: number; room: number } | null;
type TargetRow = {
  classroom_id: string | null;
  due_at: string | null;
  ends_at: string | null;
  classroom: ClassroomRow;
};
type PostRow = {
  id: string;
  type: PostKind;
  title: string;
  description: string;
  content_order: number;
  exam_kind: ExamKind;
  created_at: string;
  subject: SubjectRow;
  attachments: AttachmentRow[];
};

const POST_FIELDS =
  "id, type, title, description, content_order, exam_kind, created_at, subject:subjects(code, name_th, color), attachments(id, kind, url, file_name)";

const toSubject = (s: SubjectRow) => (s ? { code: s.code, name: s.name_th, color: s.color } : null);

/** Links open directly; PDFs go through /files/[id], which checks access first. */
const toAttachments = (rows: AttachmentRow[] = []): Attachment[] =>
  rows.map((a) => ({ id: a.id, kind: a.kind, name: a.file_name, href: a.kind === "link" ? (a.url ?? "#") : `/files/${a.id}` }));

const roomLabel = (t: { classroom_id: string | null; classroom: ClassroomRow }) =>
  t.classroom_id === null ? "ทั้งโรงเรียน" : t.classroom ? formatClassroom(t.classroom) : null;

/** "ม.5/10" after "ม.5/2" — numbers compared as numbers. */
const compareRoomLabels = (a: string, b: string) => a.localeCompare(b, "th", { numeric: true });

function toItem(post: PostRow, key: string, target?: TargetRow, room: string | null = null): CalendarItem {
  return {
    key,
    type: post.type,
    examKind: post.exam_kind,
    title: post.title,
    description: post.description,
    subject: toSubject(post.subject),
    dueAt: target?.due_at ?? null,
    endsAt: target?.ends_at ?? null,
    room,
    contentOrder: post.content_order,
    createdAt: post.created_at,
    attachments: toAttachments(post.attachments),
  };
}

/**
 * Assignments, exams and events with a date between from and to (Thai days).
 * The range is widened so exam lead-ups and long events that start outside
 * the visible weeks still show.
 */
export async function loadDatedItems(
  supabase: SupabaseClient,
  profile: Profile,
  from: DayKey,
  to: DayKey,
): Promise<CalendarItem[]> {
  let query = supabase
    .from("post_targets")
    .select(`id, classroom_id, due_at, ends_at, classroom:classrooms(grade, room), post:posts!inner(${POST_FIELDS})`)
    .in("post.type", ["assignment", "exam", "event"])
    .gte("due_at", bangkokInputToIso(addDays(from, -62))!)
    .lt("due_at", bangkokInputToIso(addDays(to, 32))!)
    .order("due_at")
    .limit(1000);
  // Students: only their own room's row of a multi-room post (plus whole-school posts).
  if (profile.role === "student") {
    query = profile.classroom
      ? query.or(`classroom_id.is.null,classroom_id.eq.${profile.classroom.id}`)
      : query.is("classroom_id", null);
  }
  const { data, error } = await query;
  if (error) throw error;
  const isStaff = profile.role !== "student";
  return ((data ?? []) as unknown as (TargetRow & { id: string; post: PostRow })[]).map((t) =>
    // Staff see every room, so label each item; students only need "ทั้งโรงเรียน".
    toItem(t.post, t.id, t, isStaff || t.classroom_id === null ? roomLabel(t) : null),
  );
}

/** Shared documents (newest 300). For staff, `room` lists where each one went. */
export async function loadMaterials(supabase: SupabaseClient, profile: Profile): Promise<CalendarItem[]> {
  const isStaff = profile.role !== "student";
  const { data, error } = await supabase
    .from("posts")
    .select(isStaff ? `${POST_FIELDS}, post_targets(classroom_id, classroom:classrooms(grade, room))` : POST_FIELDS)
    .eq("type", "material")
    .order("created_at", { ascending: false })
    .limit(300);
  if (error) throw error;
  type Row = PostRow & { post_targets?: TargetRow[] };
  return ((data ?? []) as unknown as Row[]).map((p) => {
    const rooms = (p.post_targets ?? [])
      .map(roomLabel)
      .filter((l): l is string => Boolean(l))
      .sort(compareRoomLabels);
    return toItem(p, p.id, undefined, rooms.join(", ") || null);
  });
}

export type MyPost = {
  id: string;
  type: PostKind;
  title: string;
  description: string;
  contentOrder: number;
  examKind: ExamKind;
  subjectId: string | null;
  subject: { code: string; name: string; color: string } | null;
  authorId: string;
  /** Null when this user may not read the author's profile (teachers only see their own). */
  authorName: string | null;
  targets: { classroomId: string | null; room: string; dueAt: string | null; endsAt: string | null }[];
  attachments: Attachment[];
};

/**
 * Posts this person may edit and delete, newest first — for the console list and the edit page.
 * Admins: every post. Teachers: their own, plus every post in a subject they teach.
 */
export async function loadManagedPosts(
  supabase: SupabaseClient,
  profile: Profile,
  opts: { id?: string; limit?: number } = {},
): Promise<MyPost[]> {
  let query = supabase
    .from("posts")
    .select(
      `id, type, title, description, content_order, exam_kind, subject_id, author_id,
       author:profiles(display_name),
       subject:subjects(code, name_th, color), attachments(id, kind, url, file_name),
       post_targets(classroom_id, due_at, ends_at, classroom:classrooms(grade, room))`,
    )
    .in("type", KINDS)
    .order("created_at", { ascending: false })
    .limit(opts.limit ?? 200);
  if (profile.role !== "admin") {
    const { data: taught, error } = await supabase
      .from("teaching_assignments")
      .select("subject_id")
      .eq("teacher_id", profile.id);
    if (error) throw error;
    const ids = [...new Set((taught ?? []).map((t) => t.subject_id as string))];
    query = query.or(ids.length ? `author_id.eq.${profile.id},subject_id.in.(${ids.join(",")})` : `author_id.eq.${profile.id}`);
  }
  if (opts.id) query = query.eq("id", opts.id);
  const { data, error } = await query;
  if (error) throw error;

  type Row = PostRow & {
    subject_id: string | null;
    author_id: string;
    author: { display_name: string } | null;
    post_targets: TargetRow[];
  };
  return ((data ?? []) as unknown as Row[]).map((p) => ({
    id: p.id,
    type: p.type,
    title: p.title,
    description: p.description,
    contentOrder: p.content_order,
    examKind: p.exam_kind,
    subjectId: p.subject_id,
    subject: toSubject(p.subject),
    authorId: p.author_id,
    authorName: p.author?.display_name ?? null,
    targets: p.post_targets
      .map((t) => ({
        classroomId: t.classroom_id,
        room: roomLabel(t) ?? "-",
        dueAt: t.due_at,
        endsAt: t.ends_at,
      }))
      .sort((a, b) => compareRoomLabels(a.room, b.room)),
    attachments: toAttachments(p.attachments),
  }));
}
