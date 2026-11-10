/**
 * Checks the database security rules (RLS) by logging in as the TEST
 * student and teacher from scripts/seed.ts and trying things they should
 * and shouldn't be able to do. Cleans up everything it creates.
 *
 *   npm run check:security
 *
 * Needs the test accounts to still have their birthdate passwords.
 */
import { config } from "dotenv";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { currentAcademicYear, loginIdToEmail } from "../src/lib/roster";

config({ path: ".env.local", quiet: true });
const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const secret = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const opts = { auth: { persistSession: false, autoRefreshToken: false } };
const admin = createClient(url, secret, opts);

let failures = 0;
function check(name: string, ok: boolean, detail = "") {
  console.log(`${ok ? "✓" : "✗"} ${name}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures++;
}

async function signIn(loginId: string, password: string): Promise<SupabaseClient> {
  const c = createClient(url, anon, opts);
  const { error } = await c.auth.signInWithPassword({ email: loginIdToEmail(loginId), password });
  if (error) {
    console.error(`Can't log in as ${loginId} (${error.message}). Has its password been changed?`);
    process.exit(1);
  }
  return c;
}

async function main() {
  const year = currentAcademicYear();
  const room = async (grade: number, r: number) =>
    (await admin.from("classrooms").select("id").match({ grade, room: r, academic_year: year }).single()).data!.id as string;
  const room51 = await room(5, 1);
  const { data: temp } = await admin
    .from("classrooms")
    .upsert({ grade: 6, room: 99, academic_year: year }, { onConflict: "grade,room,academic_year" })
    .select("id")
    .single();
  const notTaught = temp!.id as string;

  const s1 = await signIn("90001", "05052009"); // ม.5/1
  const s2 = await signIn("90002", "06062009"); // ม.5/2
  const t = await signIn("teacher.test", "12031980"); // teaches ม.5/1, ม.5/2

  console.log("\nStudents");
  const profiles = await s1.from("profiles").select("login_id");
  check("student sees only their own profile", profiles.data?.length === 1 && profiles.data[0].login_id === "90001");
  const logins = await s1.from("login_events").select("id");
  check("student can't read the login report", (logins.data ?? []).length === 0);
  const fb = await s1.from("feedback").select("id");
  check("student can't read feedback", (fb.data ?? []).length === 0);
  const sp = await s1.from("posts").insert({ type: "announcement", title: "hack", author_id: (await s1.auth.getUser()).data.user!.id });
  check("student can't create posts", Boolean(sp.error));
  await s1.from("profiles").update({ role: "admin" }).eq("login_id", "90001");
  const role = await admin.from("profiles").select("role").eq("login_id", "90001").single();
  check("student can't make themselves admin", role.data?.role === "student");

  console.log("\nTeacher");
  const teacherId = (await t.auth.getUser()).data.user!.id;
  const post = await t
    .from("posts")
    .insert({ type: "assignment", title: "[security check] การบ้านทดสอบ", author_id: teacherId })
    .select("id")
    .single();
  check("teacher can create a post", !post.error, post.error?.message);
  const postId = post.data?.id as string;
  const okTarget = await t.from("post_targets").insert({ post_id: postId, classroom_id: room51, due_at: new Date().toISOString() });
  check("teacher can post to a room they teach (ม.5/1)", !okTarget.error, okTarget.error?.message);
  const badTarget = await t.from("post_targets").insert({ post_id: postId, classroom_id: notTaught });
  check("teacher can't post to a room they don't teach (ม.6/99)", Boolean(badTarget.error));
  const schoolWide = await t.from("post_targets").insert({ post_id: postId, classroom_id: null });
  check("teacher can't post to the whole school", Boolean(schoolWide.error));
  const forged = await t.from("posts").insert({ type: "announcement", title: "x", author_id: (await s1.auth.getUser()).data.user!.id });
  check("teacher can't post in someone else's name", Boolean(forged.error));

  console.log("\nWho sees the ม.5/1 post");
  const seen1 = await s1.from("posts").select("id").eq("id", postId);
  check("student in ม.5/1 sees it", seen1.data?.length === 1);
  const seen2 = await s2.from("posts").select("id").eq("id", postId);
  check("student in ม.5/2 does NOT see it", (seen2.data ?? []).length === 0);
  const del = await s1.from("posts").delete().eq("id", postId).select("id");
  check("student can't delete the teacher's post", (del.data ?? []).length === 0);

  console.log("\nFiles (Week 2)");
  const pdf = new Blob(["%PDF-1.4\n%%EOF"], { type: "application/pdf" });
  const ownPath = `${teacherId}/security-check.pdf`;
  await admin.storage.from("materials").remove([ownPath]); // leftover from an interrupted run
  const up = await t.storage.from("materials").upload(ownPath, pdf, { contentType: "application/pdf" });
  check("teacher can upload a PDF into their own folder", !up.error, up.error?.message);
  const studentId = (await s1.auth.getUser()).data.user!.id;
  const otherUp = await t.storage.from("materials").upload(`${studentId}/x.pdf`, pdf, { contentType: "application/pdf" });
  check("teacher can't upload into someone else's folder", Boolean(otherUp.error));
  const studentUp = await s1.storage.from("materials").upload(`${studentId}/x.pdf`, pdf, { contentType: "application/pdf" });
  check("student can't upload files", Boolean(studentUp.error));
  const att = await t
    .from("attachments")
    .insert({ post_id: postId, kind: "file", storage_path: ownPath, file_name: "security-check.pdf", size_bytes: 20 })
    .select("id")
    .single();
  check("teacher can attach the file to their post", !att.error, att.error?.message);
  const att1 = await s1.from("attachments").select("id").eq("post_id", postId);
  check("student in ม.5/1 sees the attachment", att1.data?.length === 1);
  const att2 = await s2.from("attachments").select("id").eq("post_id", postId);
  check("student in ม.5/2 does NOT see the attachment", (att2.data ?? []).length === 0);
  const direct = await s2.storage.from("materials").createSignedUrl(ownPath, 60);
  check("student can't make their own download link for a file", Boolean(direct.error) || !direct.data?.signedUrl);
  const attachToOthers = await s1.from("attachments").insert({ post_id: postId, kind: "link", url: "https://x.com", file_name: "x" });
  check("student can't add attachments to a teacher's post", Boolean(attachToOthers.error));

  // Clean up
  await admin.storage.from("materials").remove([ownPath, `${studentId}/x.pdf`]);
  if (postId) await admin.from("posts").delete().eq("id", postId);
  await admin.from("classrooms").delete().eq("id", notTaught);
  await Promise.all([s1.auth.signOut(), s2.auth.signOut(), t.auth.signOut()]);

  console.log(failures ? `\n${failures} check(s) FAILED` : "\nAll security checks passed");
  process.exit(failures ? 1 : 0);
}

main();
