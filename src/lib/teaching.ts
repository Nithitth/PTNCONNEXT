import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Profile } from "@/lib/auth";
import type { RoomOption, SubjectOption } from "@/lib/postForm";
import { currentAcademicYear, formatClassroom } from "@/lib/roster";
import { SUBJECTS, isSchoolClassroom } from "@/lib/school";

type Room = { id: string; grade: number; room: number; academic_year: number };
type Subject = { id: string; code: string; name_th: string; color: string };

/** Listed in the school's order (คณิต, PAT, สังคม, วิทย์, ไทย, อังกฤษ). */
const subjectOrder = (code: string) => SUBJECTS.findIndex((s) => s.code === code);
const toOption = (s: Subject): SubjectOption => ({ id: s.id, code: s.code, name: s.name_th, color: s.color });

/**
 * The subjects this person may post for.
 * - Teachers: the subjects the school's teacher roster lists for them.
 * - Admins: all six.
 * (Rooms are not limited per subject: anyone may post to any of the 8 rooms.)
 */
export async function loadTeachingOptions(supabase: SupabaseClient, profile: Profile): Promise<SubjectOption[]> {
  let subjects: Subject[];
  if (profile.role === "admin") {
    const { data, error } = await supabase.from("subjects").select("id, code, name_th, color");
    if (error) throw error;
    subjects = (data ?? []) as Subject[];
  } else {
    const { data, error } = await supabase
      .from("teaching_assignments")
      .select("subject:subjects(id, code, name_th, color)")
      .eq("teacher_id", profile.id);
    if (error) throw error;
    const byId = new Map<string, Subject>();
    for (const row of (data ?? []) as unknown as { subject: Subject | null }[]) {
      if (row.subject) byId.set(row.subject.id, row.subject);
    }
    subjects = [...byId.values()];
  }
  return subjects.sort((a, b) => subjectOrder(a.code) - subjectOrder(b.code)).map(toOption);
}

/** The 8 Phase 1 classrooms for this school year (src/lib/school.ts), ม.4/1 … ม.5/4. */
export async function loadCurrentRooms(supabase: SupabaseClient): Promise<RoomOption[]> {
  const { data, error } = await supabase
    .from("classrooms")
    .select("id, grade, room, academic_year")
    .eq("academic_year", currentAcademicYear());
  if (error) throw error;
  return ((data ?? []) as Room[])
    .filter(isSchoolClassroom)
    .sort((a, b) => a.grade - b.grade || a.room - b.room)
    .map((r) => ({ id: r.id, label: formatClassroom(r) }));
}
