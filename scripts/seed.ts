/**
 * Creates TEST data for development: 2 classrooms, 3 subjects, and one
 * account per role. Safe to run more than once (skips what already exists).
 *
 *   npm run seed
 *
 * Test accounts (first password = birthdate DDMMYYYY; you'll be offered a chance to change it):
 *   นักเรียน ม.5/1   90001          05052009
 *   นักเรียน ม.5/2   90002          06062009
 *   ครู              teacher.test   12031980   (สอน ค32101 ใน ม.5/1 และ ม.5/2)
 *   ผู้ดูแลระบบ      admin.test     01011990   (log in with “ครู”)
 *
 * Never run this against the real school project after launch.
 */
import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";
import { currentAcademicYear, loginIdToEmail, subjectColor } from "../src/lib/roster";

config({ path: ".env.local" });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local");
  process.exit(1);
}
const db = createClient(url, key, { auth: { persistSession: false } });

async function must<T>(p: PromiseLike<{ data: T; error: unknown }>, what: string): Promise<T> {
  const { data, error } = await p;
  if (error) {
    console.error(`✗ ${what}`, error);
    process.exit(1);
  }
  return data;
}

async function main() {
  const year = currentAcademicYear();

  const rooms = await must(
    db
      .from("classrooms")
      .upsert(
        [
          { grade: 5, room: 1, academic_year: year },
          { grade: 5, room: 2, academic_year: year },
        ],
        { onConflict: "grade,room,academic_year" },
      )
      .select("id, room"),
    "classrooms",
  );
  const roomId = (r: number) => (rooms ?? []).find((x) => x.room === r)!.id as string;

  const subjects = await must(
    db
      .from("subjects")
      .upsert(
        [
          { code: "ค32101", name_th: "คณิตศาสตร์", color: subjectColor("ค32101") },
          { code: "ว32201", name_th: "ฟิสิกส์", color: subjectColor("ว32201") },
          { code: "อ32101", name_th: "ภาษาอังกฤษ", color: subjectColor("อ32101") },
        ],
        { onConflict: "code" },
      )
      .select("id, code"),
    "subjects",
  );
  const math = (subjects ?? []).find((s) => s.code === "ค32101")!.id as string;

  const accounts = [
    { login_id: "90001", password: "05052009", role: "student", display_name: "ด.ญ.ทดสอบ ห้องหนึ่ง", classroom_id: roomId(1) },
    { login_id: "90002", password: "06062009", role: "student", display_name: "ด.ช.ทดสอบ ห้องสอง", classroom_id: roomId(2) },
    { login_id: "teacher.test", password: "12031980", role: "teacher", display_name: "ครูทดสอบ ใจดี", classroom_id: null },
    { login_id: "admin.test", password: "01011990", role: "admin", display_name: "ผู้ดูแลทดสอบ", classroom_id: null },
  ] as const;

  const ids: Record<string, string> = {};
  for (const a of accounts) {
    const existing = await must(db.from("profiles").select("id").eq("login_id", a.login_id).maybeSingle(), a.login_id);
    if (existing) {
      ids[a.login_id] = existing.id;
      console.log(`· ${a.login_id} already exists`);
      continue;
    }
    const { data, error } = await db.auth.admin.createUser({
      email: loginIdToEmail(a.login_id),
      password: a.password,
      email_confirm: true,
    });
    if (error || !data.user) {
      console.error(`✗ create ${a.login_id}`, error);
      process.exit(1);
    }
    const { password: _pw, ...profile } = a;
    void _pw;
    await must(db.from("profiles").insert({ id: data.user.id, ...profile, must_change_password: true }), `profile ${a.login_id}`);
    ids[a.login_id] = data.user.id;
    console.log(`✓ ${a.login_id} (${a.role})`);
  }

  await must(
    db.from("teaching_assignments").upsert(
      [
        { teacher_id: ids["teacher.test"], classroom_id: roomId(1), subject_id: math },
        { teacher_id: ids["teacher.test"], classroom_id: roomId(2), subject_id: math },
      ],
      { onConflict: "teacher_id,classroom_id,subject_id", ignoreDuplicates: true },
    ),
    "teaching_assignments",
  );

  console.log(`\nDone. Academic year ${year}. Run "npm run dev" and log in at http://localhost:3000/login`);
}

main();
