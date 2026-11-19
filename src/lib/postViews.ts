import "server-only";
import { seenByRoom, type SeenRoom, type SeenStudent, type SeenView } from "@/lib/seen";
import { createAdminClient } from "@/lib/supabase/admin";

// "ใครเปิดดูแล้ว" for teachers (migration 0020). Teachers can't read other profiles under RLS, so these use the
// admin client. Call them ONLY for posts the user may manage (loadManagedPosts already applies that rule).

/** Per targeted room: who opened the post and who hasn't yet (names). */
export async function loadSeenBy(postId: string, rooms: { id: string | null; label: string }[]): Promise<SeenRoom[]> {
  if (!rooms.length) return [];
  const db = createAdminClient();
  const wholeSchool = rooms.some((r) => r.id === null);
  let students = db.from("profiles").select("id, display_name, classroom_id").eq("role", "student").limit(5000);
  if (!wholeSchool)
    students = students.in(
      "classroom_id",
      rooms.map((r) => r.id as string),
    );
  const [s, v] = await Promise.all([students, db.from("post_views").select("user_id, first_seen_at, file_first_at").eq("post_id", postId).limit(5000)]);
  const list: SeenStudent[] = ((s.data ?? []) as { id: string; display_name: string; classroom_id: string | null }[]).map((x) => ({
    id: x.id,
    name: x.display_name,
    classroomId: x.classroom_id,
  }));
  const views: SeenView[] = ((v.data ?? []) as { user_id: string; first_seen_at: string; file_first_at: string | null }[]).map((x) => ({
    userId: x.user_id,
    first: x.first_seen_at,
    fileFirst: x.file_first_at,
  }));
  return seenByRoom(rooms, list, views);
}

/** "เปิดดูแล้ว 28/40" for each post in a list. Empty when the activity log isn't set up yet. */
export async function loadSeenCounts(postIds: string[]): Promise<Record<string, { seen: number; total: number }>> {
  if (!postIds.length) return {};
  const { data, error } = await createAdminClient().rpc("post_seen_counts", { p_posts: postIds.slice(0, 300) });
  if (error) return {};
  return Object.fromEntries(
    ((data ?? []) as { post_id: string; targeted: number; seen: number }[]).map((r) => [r.post_id, { seen: r.seen, total: r.targeted }]),
  );
}
