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
  const notTaught = await room(5, 3); // teacher.test teaches ม.5/1 and ม.5/2 only

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
  const otherRoom = await t.from("post_targets").insert({ post_id: postId, classroom_id: notTaught });
  check("teacher can also post to a room they don't teach (ม.5/3)", !otherRoom.error, otherRoom.error?.message);
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

  console.log("\nFeedback and the Developer Console (Week 3)");
  // No .select() here: students may not read feedback, and insert-then-read would be refused.
  const sent = await s1.from("feedback").insert({ user_id: studentId, message: "[security check] ทดสอบ" });
  check("student can send feedback as themselves", !sent.error, sent.error?.message);
  const forgedFb = await s1.from("feedback").insert({ user_id: teacherId, message: "[security check] ปลอม" });
  check("student can't send feedback in someone else's name", Boolean(forgedFb.error));
  const tFb = await t.from("feedback").select("id");
  const tErr = await t.from("error_logs").select("id");
  const tLog = await t.from("login_events").select("id");
  check(
    "teacher can't read feedback, error log or login report",
    (tFb.data ?? []).length + (tErr.data ?? []).length + (tLog.data ?? []).length === 0,
  );
  const sErr = await s1.from("error_logs").select("id");
  check("student can't read the error log", (sErr.data ?? []).length === 0);
  const a = await signIn("admin.test", "01011990");
  const aFb = await a.from("feedback").select("id").like("message", "[security check]%");
  check("admin can read feedback", (aFb.data ?? []).length >= 1, aFb.error?.message);
  const aErr = await a.from("error_logs").select("id").limit(1);
  const aLog = await a.from("login_events").select("id").limit(1);
  check("admin can read the error log and login report", !aErr.error && !aLog.error);
  const aPost = await a
    .from("posts")
    .insert({ type: "assignment", title: "[security check] admin", author_id: (await a.auth.getUser()).data.user!.id })
    .select("id")
    .single();
  const aTarget = await a.from("post_targets").insert({ post_id: aPost.data?.id, classroom_id: notTaught });
  check("admin can post to a classroom like a teacher", !aPost.error && !aTarget.error, aPost.error?.message ?? aTarget.error?.message);

  console.log("\nWho can edit and delete posts");
  const subjectId = async (code: string) =>
    (await admin.from("subjects").select("id").eq("code", code).single()).data!.id as string;
  const [math, science] = await Promise.all([subjectId("math"), subjectId("science")]); // teacher.test teaches math only
  const adminId = (await a.auth.getUser()).data.user!.id;
  const otherPost = async (subject: string) => {
    const { data } = await a
      .from("posts")
      .insert({ type: "assignment", title: "[security check] ของครูท่านอื่น", subject_id: subject, author_id: adminId })
      .select("id")
      .single();
    await a.from("post_targets").insert({ post_id: data!.id, classroom_id: room51, due_at: new Date().toISOString() });
    return data!.id as string;
  };
  const mathPost = await otherPost(math);
  const sciencePost = await otherPost(science);

  const seeMath = await t.from("posts").select("id").eq("id", mathPost);
  check("teacher sees another teacher's post in their subject", seeMath.data?.length === 1);
  const editMath = await t.from("posts").update({ title: "[security check] แก้แล้ว" }).eq("id", mathPost).select("id");
  check("teacher can edit a post in their subject", editMath.data?.length === 1, editMath.error?.message);
  const retarget = await t.from("post_targets").insert({ post_id: mathPost, classroom_id: notTaught });
  check("teacher can change the rooms of a post in their subject", !retarget.error, retarget.error?.message);
  const delMath = await t.from("posts").delete().eq("id", mathPost).select("id");
  check("teacher can delete a post in their subject", delMath.data?.length === 1, delMath.error?.message);

  const editSci = await t.from("posts").update({ title: "hack" }).eq("id", sciencePost).select("id");
  const delSci = await t.from("posts").delete().eq("id", sciencePost).select("id");
  const sciTarget = await t.from("post_targets").insert({ post_id: sciencePost, classroom_id: notTaught });
  check(
    "teacher can't edit, delete or retarget a post in a subject they don't teach",
    (editSci.data ?? []).length === 0 && (delSci.data ?? []).length === 0 && Boolean(sciTarget.error),
  );
  // Even the admin can't (only the server's service key could).
  const steal = await a.from("posts").update({ author_id: adminId }).eq("id", postId);
  check("nobody can change who wrote a post", Boolean(steal.error));

  const aEdit = await a.from("posts").update({ title: "[security check] admin แก้" }).eq("id", postId).select("id");
  const aTarget2 = await a.from("post_targets").insert({ post_id: postId, classroom_id: notTaught });
  check("admin can edit and retarget a teacher's post", aEdit.data?.length === 1 && !aTarget2.error, aTarget2.error?.message);
  const aDel = await a.from("posts").delete().eq("id", sciencePost).select("id");
  check("admin can delete any post", aDel.data?.length === 1, aDel.error?.message);

  console.log("\nTCASter (Phase 2)");
  const dummyIds = Array.from({ length: 6 }, (_, i) => `TEST00000000${i}A`);
  await admin.from("tcas_programs").upsert(
    dummyIds.map((program_id) => ({
      program_id, university_id: "000", university_name: "[security check]", name_th: "[security check]", tcas_year: 2570,
    })),
  );
  const s2Id = (await s2.auth.getUser()).data.user!.id;
  // Start the test student with no targets (also clears leftovers from an interrupted run).
  await admin.from("tcas_targets").delete().eq("student_id", studentId);
  const myTarget = await s1.from("tcas_targets").insert({ student_id: studentId, program_id: dummyIds[0], slider_scores: { tgat: 50 } });
  check("student can save a target", !myTarget.error, myTarget.error?.message);
  const peek = await s2.from("tcas_targets").select("program_id").eq("student_id", studentId);
  check("another student can't see it", (peek.data ?? []).length === 0);
  const tTargets = await t.from("tcas_targets").select("program_id");
  const aTargets = await a.from("tcas_targets").select("program_id");
  check("teachers and admins can't read anyone's targets", (tTargets.data ?? []).length + (aTargets.data ?? []).length === 0);
  const forgedTarget = await s1.from("tcas_targets").insert({ student_id: s2Id, program_id: dummyIds[1] });
  check("student can't save a target for someone else", Boolean(forgedTarget.error));
  const tooMany = await s1.from("tcas_targets").insert(dummyIds.slice(1, 6).map((program_id) => ({ student_id: studentId, program_id })));
  check("can't get past 5 targets by saving several at once", Boolean(tooMany.error));
  const more = await s1.from("tcas_targets").insert(dummyIds.slice(1, 5).map((program_id) => ({ student_id: studentId, program_id })));
  const sixth = await s1.from("tcas_targets").insert({ student_id: studentId, program_id: dummyIds[5] });
  check("a 6th target is refused", !more.error && Boolean(sixth.error), more.error?.message);
  const rescore = await s1
    .from("tcas_targets")
    .update({ slider_scores: { tgat: 70 } })
    .eq("student_id", studentId)
    .eq("program_id", dummyIds[0])
    .select("program_id");
  check("with 5 targets, a student can still update one's scores", rescore.data?.length === 1, rescore.error?.message);
  const tPublish = await t.rpc("tcas_publish", { p_university: "006" });
  check("teacher can't publish TCAS data", Boolean(tPublish.error));
  const sTotals = await s1.rpc("tcas_target_totals");
  check("student can't read the staff totals", Boolean(sTotals.error));
  const aTotals = await a.rpc("tcas_target_totals");
  check(
    "totals hide groups under 3 students",
    !aTotals.error && !(aTotals.data ?? []).some((r: { university_name: string }) => r.university_name === "[security check]"),
    aTotals.error?.message,
  );
  const sStage = await s1.from("tcas_staging").select("program_id").limit(1);
  const tStage = await t.from("tcas_staging").select("program_id").limit(1);
  check("students and teachers can't read TCAS staging", (sStage.data ?? []).length + (tStage.data ?? []).length === 0);
  await admin.from("tcas_programs").delete().in("program_id", dummyIds); // cascades to the targets

  // Clean up
  await admin.from("posts").delete().in("id", [mathPost, sciencePost]);
  await admin.from("feedback").delete().like("message", "[security check]%");
  if (aPost.data?.id) await admin.from("posts").delete().eq("id", aPost.data.id);
  await a.auth.signOut();
  await admin.storage.from("materials").remove([ownPath, `${studentId}/x.pdf`]);
  if (postId) await admin.from("posts").delete().eq("id", postId);
  await Promise.all([s1.auth.signOut(), s2.auth.signOut(), t.auth.signOut()]);

  console.log(failures ? `\n${failures} check(s) FAILED` : "\nAll security checks passed");
  process.exit(failures ? 1 : 0);
}

main();
