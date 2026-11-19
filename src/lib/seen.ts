// "ใครเปิดดูแล้ว": which students of each targeted room opened a post (post_views, migration 0020). Pure and tested.

export type SeenStudent = { id: string; name: string; classroomId: string | null };
export type SeenView = { userId: string; first: string; fileFirst: string | null };
export type SeenRoom = {
  /** null = the whole school. */
  id: string | null;
  label: string;
  total: number;
  seen: number;
  /** Students who haven't opened it yet, by name (ก–ฮ). */
  notSeen: { id: string; name: string }[];
  /** Students who opened it, earliest first. */
  opened: { id: string; name: string; first: string; fileFirst: string | null }[];
};

const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name, "th");

/** One entry per targeted room (in the order given). A whole-school post counts every student. */
export function seenByRoom(rooms: { id: string | null; label: string }[], students: SeenStudent[], views: SeenView[]): SeenRoom[] {
  const seen = new Map(views.map((v) => [v.userId, v]));
  return rooms.map((room) => {
    const mine = students.filter((s) => room.id === null || s.classroomId === room.id);
    const opened = mine
      .filter((s) => seen.has(s.id))
      .map((s) => ({ id: s.id, name: s.name, first: seen.get(s.id)!.first, fileFirst: seen.get(s.id)!.fileFirst }))
      .sort((a, b) => a.first.localeCompare(b.first));
    const notSeen = mine
      .filter((s) => !seen.has(s.id))
      .map((s) => ({ id: s.id, name: s.name }))
      .sort(byName);
    return { id: room.id, label: room.label, total: mine.length, seen: opened.length, notSeen, opened };
  });
}

/** "เปิดดูแล้ว 28/40" */
export const seenLabel = (seen: number, total: number) => `เปิดดูแล้ว ${seen.toLocaleString("th-TH")}/${total.toLocaleString("th-TH")}`;
