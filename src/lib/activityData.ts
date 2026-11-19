import "server-only";
import { formatDateTime } from "@/lib/calendar";
import { describeChange, type Change, type Namers } from "@/lib/postHistory";
import { formatClassroom } from "@/lib/roster";
import { SUBJECTS } from "@/lib/school";
import { createAdminClient } from "@/lib/supabase/admin";

// Reads of the activity logs (migration 0020) for admins: ประวัติ and a person's activity page.
// Admin client: call only after requireProfile({ roles: ["admin"] }).

export type HistoryRow = { id: number; postId: string; action: "create" | "edit" | "delete"; title: string; who: string; at: string; lines: string[] };

/** Room and subject names for describing post changes. */
async function namers(): Promise<Namers> {
  const db = createAdminClient();
  const [rooms, subjects] = await Promise.all([db.from("classrooms").select("id, grade, room"), db.from("subjects").select("id, code")]);
  const roomName = new Map(((rooms.data ?? []) as { id: string; grade: number; room: number }[]).map((c) => [c.id, formatClassroom(c)]));
  const subjectName = new Map(
    ((subjects.data ?? []) as { id: string; code: string }[]).map((s) => [s.id, SUBJECTS.find((x) => x.code === s.code)?.name ?? s.code]),
  );
  return {
    room: (id) => (id === null ? "ทั้งโรงเรียน" : (roomName.get(id) ?? "ห้องที่ถูกลบ")),
    subject: (id) => (typeof id === "string" ? (subjectName.get(id) ?? "—") : "—"),
    time: (iso) => (iso ? formatDateTime(iso) : "—"),
  };
}

type RawHistory = {
  id: number;
  post_id: string;
  action: HistoryRow["action"];
  title: string | null;
  detail: Record<string, unknown> | null;
  created_at: string;
  actor: { display_name: string } | null;
};

function toRows(raw: RawHistory[], n: Namers): HistoryRow[] {
  return raw.map((h) => {
    const d = h.detail ?? {};
    let lines: string[] = [];
    if (h.action === "edit") lines = ((d.changes as Change[] | undefined) ?? []).map((c) => describeChange(c, n));
    else {
      const post = d.post as { targets?: { classroom_id: string | null; due_at: string | null }[]; file?: string | null } | null | undefined;
      lines = (post?.targets ?? []).map((t) => `${n.room(t.classroom_id)}${t.due_at ? `: ${n.time(t.due_at)}` : ""}`);
      if (post?.file) lines.push(`ไฟล์/ลิงก์: ${post.file}`);
      if (h.action === "delete") {
        const seen = Object.entries((d.seen as Record<string, number> | undefined) ?? {});
        if (seen.length) lines.push(`ก่อนลบ มีนักเรียนเปิดดู ${seen.map(([k, v]) => `${n.room(k === "school" ? null : k)} ${v} คน`).join(", ")}`);
      }
    }
    return { id: h.id, postId: h.post_id, action: h.action, title: h.title ?? "", who: h.actor?.display_name ?? "—", at: h.created_at, lines };
  });
}

const HISTORY = "id, post_id, action, title, detail, created_at, actor:profiles(display_name)";

/** The newest post creates/edits/deletes (ประวัติ). */
export async function loadPostHistory(limit = 100): Promise<HistoryRow[]> {
  const [{ data }, n] = await Promise.all([
    createAdminClient().from("post_history").select(HISTORY).order("created_at", { ascending: false }).limit(limit),
    namers(),
  ]);
  return toRows((data ?? []) as unknown as RawHistory[], n);
}

export type PersonActivity = {
  person: { id: string; name: string; role: string; loginId: string; room: string | null } | null;
  logins: { at: string; ok: boolean; reason: string | null }[];
  /** Days (newest first), each with the features used that day. */
  days: { day: string; features: { feature: string; visits: number; first: string; last: string }[] }[];
  seen: { postId: string; title: string; type: string; first: string; last: string; views: number; fileFirst: string | null; fileOpens: number }[];
  account: { action: string; target: string | null; detail: Record<string, unknown> | null; at: string; byOther: string | null }[];
  posts: HistoryRow[];
};

/** Everything the logs hold about one person in the last `days` days (newest first). */
export async function loadPersonActivity(userId: string, days = 60): Promise<PersonActivity> {
  const db = createAdminClient();
  const since = new Date(Date.now() - days * 86_400_000).toISOString();
  const [person, logins, usage, seen, own, onThem, posts, n] = await Promise.all([
    db.from("profiles").select("id, display_name, role, login_id, classroom:classrooms!profiles_classroom_id_fkey(grade, room)").eq("id", userId).maybeSingle(),
    db
      .from("login_events")
      .select("success, reason, created_at")
      .eq("user_id", userId)
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(200),
    db
      .from("usage_daily")
      .select("feature, day, visits, first_at, last_at")
      .eq("user_id", userId)
      .gte("day", since.slice(0, 10))
      .order("day", { ascending: false })
      .limit(1000),
    db
      .from("post_views")
      .select("post_id, first_seen_at, last_seen_at, views, file_first_at, file_opens, post:posts(title, type)")
      .eq("user_id", userId)
      .gte("last_seen_at", since)
      .order("last_seen_at", { ascending: false })
      .limit(200),
    db
      .from("audit_events")
      .select("action, target, detail, created_at")
      .eq("actor_id", userId)
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(200),
    db
      .from("audit_events")
      .select("action, target, detail, created_at, actor:profiles(display_name)")
      .eq("target", userId)
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(100),
    db.from("post_history").select(HISTORY).eq("actor_id", userId).gte("created_at", since).order("created_at", { ascending: false }).limit(100),
    namers(),
  ]);

  const p = person.data as unknown as {
    id: string;
    display_name: string;
    role: string;
    login_id: string;
    classroom: { grade: number; room: number } | null;
  } | null;
  const byDay = new Map<string, PersonActivity["days"][number]["features"]>();
  for (const u of (usage.data ?? []) as { feature: string; day: string; visits: number; first_at: string; last_at: string }[]) {
    const list = byDay.get(u.day) ?? [];
    list.push({ feature: u.feature, visits: u.visits, first: u.first_at, last: u.last_at });
    byDay.set(u.day, list);
  }
  type Own = { action: string; target: string | null; detail: Record<string, unknown> | null; created_at: string; actor?: { display_name: string } | null };
  const account = [
    ...((own.data ?? []) as Own[]).map((a) => ({ action: a.action, target: a.target, detail: a.detail, at: a.created_at, byOther: null })),
    ...((onThem.data ?? []) as unknown as Own[]).map((a) => ({
      action: a.action,
      target: null,
      detail: a.detail,
      at: a.created_at,
      byOther: a.actor?.display_name ?? "—",
    })),
  ].sort((a, b) => b.at.localeCompare(a.at));

  return {
    person: p ? { id: p.id, name: p.display_name, role: p.role, loginId: p.login_id, room: p.classroom ? formatClassroom(p.classroom) : null } : null,
    logins: ((logins.data ?? []) as { success: boolean; reason: string | null; created_at: string }[]).map((l) => ({
      at: l.created_at,
      ok: l.success,
      reason: l.reason,
    })),
    days: [...byDay].map(([day, features]) => ({ day, features: features.sort((a, b) => b.visits - a.visits) })),
    seen: (
      (seen.data ?? []) as unknown as {
        post_id: string;
        first_seen_at: string;
        last_seen_at: string;
        views: number;
        file_first_at: string | null;
        file_opens: number;
        post: { title: string; type: string } | null;
      }[]
    ).map((v) => ({
      postId: v.post_id,
      title: v.post?.title ?? "(โพสต์ถูกลบ)",
      type: v.post?.type ?? "",
      first: v.first_seen_at,
      last: v.last_seen_at,
      views: v.views,
      fileFirst: v.file_first_at,
      fileOpens: v.file_opens,
    })),
    account,
    posts: toRows((posts.data ?? []) as unknown as RawHistory[], n),
  };
}
