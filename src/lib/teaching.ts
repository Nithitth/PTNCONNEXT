import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Profile } from "@/lib/auth";
import type { RoomOption, SubjectOption } from "@/lib/postForm";
import { currentAcademicYear, formatClassroom } from "@/lib/roster";
import { SUBJECTS, isSchoolClassroom } from "@/lib/school";

type Room = { id: string; grade: number; room: number; academic_year: number };
type Subject = { id: string; code: string; name_th: string; color: string };

const byGradeRoom = (a: Room, b: Room) => a.grade - b.grade || a.room - b.room;
const toOption = (r: Room): RoomOption => ({ id: r.id, label: formatClassroom(r) });
/** Listed in the school's order (คณิต, PAT, สังคม, วิทย์, ไทย, อังกฤษ). */
const subjectOrder = (code: string) => SUBJECTS.findIndex((s) => s.code === code);
const toSubjectOption = (s: Subject, rooms: RoomOption[]): SubjectOption => ({
  id: s.id,
  code: s.code,
  name: s.name_th,
  color: s.color,
  rooms,
});

/** This school year's rooms, limited to the Phase 1 classrooms in src/lib/school.ts. */
const usable = (r: Room | null): r is Room =>
  Boolean(r) && r!.academic_year === currentAcademicYear() && isSchoolClassroom(r!);

/**
 * The subjects this person may post for, each with the classrooms they may
 * post it to.
 * - Teachers: from teaching_assignments (the school's teacher roster).
 * - Admins: every subject, every classroom.
 * The database (RLS) enforces the same thing; this list drives the form.
 */
export async function loadTeachingOptions(supabase: SupabaseClient, profile: Profile): Promise<SubjectOption[]> {
  if (profile.role === "admin") {
    const [subjects, all] = await Promise.all([
      supabase.from("subjects").select("id, code, name_th, color"),
      loadCurrentRooms(supabase),
    ]);
    if (subjects.error) throw subjects.error;
    return ((subjects.data ?? []) as Subject[])
      .sort((a, b) => subjectOrder(a.code) - subjectOrder(b.code))
      .map((s) => toSubjectOption(s, all));
  }

  const { data, error } = await supabase
    .from("teaching_assignments")
    .select("subject:subjects(id, code, name_th, color), classroom:classrooms(id, grade, room, academic_year)")
    .eq("teacher_id", profile.id);
  if (error) throw error;

  const bySubject = new Map<string, { subject: Subject; rooms: Room[] }>();
  for (const row of (data ?? []) as unknown as { subject: Subject | null; classroom: Room | null }[]) {
    if (!row.subject || !usable(row.classroom)) continue;
    const entry = bySubject.get(row.subject.id) ?? { subject: row.subject, rooms: [] };
    if (!entry.rooms.some((r) => r.id === row.classroom!.id)) entry.rooms.push(row.classroom);
    bySubject.set(row.subject.id, entry);
  }
  return [...bySubject.values()]
    .sort((a, b) => subjectOrder(a.subject.code) - subjectOrder(b.subject.code))
    .map(({ subject, rooms }) => toSubjectOption(subject, rooms.sort(byGradeRoom).map(toOption)));
}

/** All Phase 1 classrooms this school year (admins: school events can go to any of them). */
export async function loadCurrentRooms(supabase: SupabaseClient): Promise<RoomOption[]> {
  const { data, error } = await supabase
    .from("classrooms")
    .select("id, grade, room, academic_year")
    .eq("academic_year", currentAcademicYear());
  if (error) throw error;
  return ((data ?? []) as Room[]).filter(usable).sort(byGradeRoom).map(toOption);
}
