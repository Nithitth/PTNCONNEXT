import "server-only";
import { formatClassroom } from "@/lib/roster";
import { CLASSROOMS } from "@/lib/school";
import { maskEmail, maskPhone, slotStatus, type SlotStatus } from "@/lib/signup";
import { isSignupOpen } from "@/lib/signupServer";
import { createAdminClient } from "@/lib/supabase/admin";

// Reads for the Developer Console's sign-up dashboard (admin client: the sign-up tables have no
// browser access). Callers must run requireProfile({ roles: ["admin"] }) first.

export type RoomRow = {
  classroomId: string;
  label: string;
  code: string | null;
  startsAt: string | null;
  endsAt: string | null;
  status: SlotStatus;
  total: number;
  registered: number;
};

/** The school's rooms this year (ม.4/1–ม.5/4) with their slot and progress. */
export async function loadRooms(): Promise<RoomRow[]> {
  const db = createAdminClient();
  const [{ data: classes }, { data: slots }, { data: regs }] = await Promise.all([
    db.from("classrooms").select("id, grade, room, academic_year").order("academic_year", { ascending: false }),
    db.from("signup_rooms").select("classroom_id, code, starts_at, ends_at"),
    db.from("registrations").select("classroom_id, claimed_by").eq("kind", "student"),
  ]);
  // The newest school year's copy of each of the eight rooms.
  const year = Math.max(0, ...(classes ?? []).map((c) => c.academic_year));
  return CLASSROOMS.flatMap((ref) => {
    const c = (classes ?? []).find((x) => x.grade === ref.grade && x.room === ref.room && x.academic_year === year);
    if (!c) return [];
    const slot = (slots ?? []).find((s) => s.classroom_id === c.id) ?? null;
    const mine = (regs ?? []).filter((r) => r.classroom_id === c.id);
    return [
      {
        classroomId: c.id,
        label: formatClassroom(c),
        code: slot?.code ?? null,
        startsAt: slot?.starts_at ?? null,
        endsAt: slot?.ends_at ?? null,
        status: slotStatus(slot ? { startsAt: slot.starts_at, endsAt: slot.ends_at } : null),
        total: mine.length,
        registered: mine.filter((r) => r.claimed_by).length,
      },
    ];
  });
}

export type PersonRow = {
  id: string;
  name: string;
  loginId: string | null;
  registered: boolean;
  registeredAt: string | null;
  contact: string | null;
  codeState: "none" | "active" | "expired" | "locked";
  codeExpiresAt: string | null;
  subjects: string[];
};

type RegRow = {
  id: string;
  login_id: string | null;
  prefix: string;
  first_name: string;
  last_name: string;
  claimed_by: string | null;
  claimed_at: string | null;
  code_hash: string | null;
  code_expires_at: string | null;
  code_attempts: number;
  assignments: { subject_code: string }[];
  profile: { email: string | null; phone: string | null } | null;
};

function toPerson(r: RegRow): PersonRow {
  const expired = r.code_expires_at !== null && new Date(r.code_expires_at) < new Date();
  return {
    id: r.id,
    name: `${r.prefix}${r.first_name} ${r.last_name}`.trim(),
    loginId: r.login_id,
    registered: Boolean(r.claimed_by),
    registeredAt: r.claimed_at,
    contact: r.profile?.email ? maskEmail(r.profile.email) : r.profile?.phone ? maskPhone(r.profile.phone) : null,
    codeState: !r.code_hash ? "none" : r.code_attempts >= 5 ? "locked" : expired ? "expired" : "active",
    codeExpiresAt: r.code_expires_at,
    subjects: [...new Set((r.assignments ?? []).map((a) => a.subject_code))],
  };
}

const PEOPLE =
  "id, login_id, prefix, first_name, last_name, claimed_by, claimed_at, code_hash, code_expires_at, code_attempts, assignments, profile:profiles!registrations_claimed_by_fkey(email, phone)";

/** The students pre-registered in one room, by student ID. */
export async function loadRoomPeople(classroomId: string): Promise<PersonRow[]> {
  const { data, error } = await createAdminClient()
    .from("registrations")
    .select(PEOPLE)
    .eq("kind", "student")
    .eq("classroom_id", classroomId)
    .order("login_id");
  if (error) throw error;
  return ((data ?? []) as unknown as RegRow[]).map(toPerson);
}

/** Every pre-registered teacher, by name. */
export async function loadTeacherPeople(): Promise<PersonRow[]> {
  const { data, error } = await createAdminClient().from("registrations").select(PEOPLE).eq("kind", "teacher").order("first_name");
  if (error) throw error;
  return ((data ?? []) as unknown as RegRow[]).map(toPerson);
}

/** Midnight today, Thai time, as an ISO string. */
export const startOfThaiDay = () => `${new Date(Date.now() + 7 * 3_600_000).toISOString().slice(0, 10)}T00:00:00+07:00`;

export type Overview = {
  open: boolean;
  rooms: RoomRow[];
  students: { total: number; registered: number };
  teachers: { total: number; registered: number };
  today: {
    signups: number;
    loginsOk: number;
    loginsFailed: number;
    emailsSent: number;
    wrongRoomCodes: number;
    wrongTeacherCodes: number;
    lockedCodes: number;
    takenNames: number;
    rateLimited: number;
    lockedLogins: number;
  };
};

export async function loadOverview(): Promise<Overview> {
  const db = createAdminClient();
  const since = startOfThaiDay();
  const [open, rooms, teachers, events, logins, rateLimited] = await Promise.all([
    isSignupOpen(db),
    loadRooms(),
    db.from("registrations").select("claimed_by").eq("kind", "teacher"),
    db.from("signup_events").select("kind, outcome, detail").gte("created_at", since).limit(10000),
    db.from("login_events").select("success, reason").gte("created_at", since).limit(10000),
    db.from("error_logs").select("*", { count: "exact", head: true }).eq("route", "login/rate-limit").gte("created_at", since),
  ]);
  const ev = events.data ?? [];
  const count = (kind: string, outcome?: string, detail?: string) =>
    ev.filter((e) => e.kind === kind && (!outcome || e.outcome === outcome) && (!detail || (e.detail ?? "").includes(detail))).length;
  return {
    open,
    rooms,
    students: { total: rooms.reduce((n, r) => n + r.total, 0), registered: rooms.reduce((n, r) => n + r.registered, 0) },
    teachers: { total: teachers.data?.length ?? 0, registered: (teachers.data ?? []).filter((t) => t.claimed_by).length },
    today: {
      signups: count("registered", "ok"),
      loginsOk: (logins.data ?? []).filter((l) => l.success).length,
      loginsFailed: (logins.data ?? []).filter((l) => !l.success).length,
      emailsSent: count("email_sent"),
      wrongRoomCodes: count("room_code", "fail") + count("personal_code", "fail"),
      wrongTeacherCodes: count("teacher_code", "fail"),
      lockedCodes: count("teacher_code", "fail", "ล็อก"),
      takenNames: count("name", "fail", "ลงทะเบียนแล้ว"),
      rateLimited: rateLimited.count ?? 0,
      lockedLogins: (logins.data ?? []).filter((l) => l.reason === "locked").length,
    },
  };
}
