"use server";

import { requireProfile, type Profile } from "@/lib/auth";
import { logError } from "@/lib/logs";
import { MATERIALS_BUCKET, MAX_FILE_BYTES, validatePost, type CleanPost, type PostInput } from "@/lib/postForm";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { loadCurrentRooms, loadTeachingOptions } from "@/lib/teaching";

export type SaveResult = { ok?: true; error?: string };

/** Teachers may post a subject they teach, to any of the 8 rooms. Whole-school and events are admin-only. */
async function checkAllowed(supabase: Awaited<ReturnType<typeof createClient>>, profile: Profile, post: CleanPost) {
  const schoolWide = post.targets.some((t) => t.classroom_id === null);
  if (profile.role !== "admin") {
    if (post.type === "event") return "เฉพาะผู้ดูแลระบบที่สร้างกิจกรรมโรงเรียนได้";
    if (schoolWide) return "เฉพาะผู้ดูแลระบบที่โพสต์ถึงทั้งโรงเรียนได้";
  }
  const [subjects, rooms] = await Promise.all([
    post.type === "event" ? null : loadTeachingOptions(supabase, profile),
    loadCurrentRooms(supabase),
  ]);
  if (subjects && !subjects.some((s) => s.id === post.subject_id)) return "คุณไม่ได้สอนวิชานี้";
  // Any of the 8 Phase 1 classrooms.
  const ok = new Set(rooms.map((r) => r.id));
  if (post.targets.some((t) => t.classroom_id !== null && !ok.has(t.classroom_id))) {
    return "เลือกได้เฉพาะ ม.4/1–ม.4/4 และ ม.5/1–ม.5/4";
  }
  return null;
}

/** The PDF was uploaded by the browser — make sure it's really there, in this user's folder. */
async function checkUploadedFile(profile: Profile, storagePath: string) {
  // Expected shape: "<your user id>/<random id>.pdf"
  const [folder, name, ...rest] = storagePath.split("/");
  if (folder !== profile.id || rest.length || !/^[0-9a-f-]{36}\.pdf$/.test(name ?? "")) return "ไฟล์ไม่ถูกต้อง";
  const { data, error } = await createAdminClient().storage.from(MATERIALS_BUCKET).list(folder, { search: name, limit: 1 });
  if (error) throw error;
  const found = data?.find((f) => f.name === name);
  if (!found) return "ไม่พบไฟล์ที่อัปโหลด ลองเลือกไฟล์ใหม่";
  const size = Number(found.metadata?.size ?? 0);
  if (size > MAX_FILE_BYTES) return "ไฟล์ใหญ่เกิน 10 MB";
  return null;
}

/** Deletes the uploaded PDFs behind these attachment rows (links have no file). */
async function removeFiles(rows: { storage_path: string | null }[] | null) {
  const paths = (rows ?? []).flatMap((r) => (r.storage_path ? [r.storage_path] : []));
  if (paths.length === 0) return;
  const { error } = await createAdminClient().storage.from(MATERIALS_BUCKET).remove(paths);
  if (error) await logError("teacher/removeFiles", error);
}

/**
 * Creates a post (postId null) or updates one of your own posts.
 * Writes go through the user's own Supabase client, so RLS double-checks
 * every classroom target.
 */
export async function savePost(postId: string | null, input: PostInput): Promise<SaveResult> {
  const profile = await requireProfile({ roles: ["teacher", "admin"] });
  const checked = validatePost(input);
  if (!checked.ok) return { error: checked.error };
  const post = checked.value;

  try {
    const supabase = await createClient();
    if (post.attachment.mode === "keep" && !postId) return { error: "แนบไฟล์ไม่ถูกต้อง" };
    const [problem, fileProblem] = await Promise.all([
      checkAllowed(supabase, profile, post),
      post.attachment.mode === "file" ? checkUploadedFile(profile, post.attachment.storagePath) : null,
    ]);
    if (problem || fileProblem) return { error: (problem || fileProblem)! };

    const fields = {
      type: post.type,
      subject_id: post.subject_id,
      title: post.title,
      description: post.description,
      content_order: post.content_order,
      exam_kind: post.exam_kind,
    };

    let id: string;
    if (postId) {
      // Only your own posts, and the kind can't change.
      const { data: existing } = await supabase
        .from("posts")
        .select("id, type, author_id")
        .eq("id", postId)
        .eq("author_id", profile.id)
        .maybeSingle();
      if (!existing) return { error: "ไม่พบโพสต์นี้ หรือคุณไม่มีสิทธิ์แก้ไข" };
      if (existing.type !== post.type) return { error: "เปลี่ยนประเภทโพสต์ไม่ได้" };
      const { error } = await supabase
        .from("posts")
        .update({ ...fields, updated_at: new Date().toISOString() })
        .eq("id", postId);
      if (error) throw error;
      const { error: delErr } = await supabase.from("post_targets").delete().eq("post_id", postId);
      if (delErr) throw delErr;
      id = postId;
    } else {
      const { data, error } = await supabase
        .from("posts")
        .insert({ ...fields, author_id: profile.id })
        .select("id")
        .single();
      if (error || !data) throw error ?? new Error("post insert returned nothing");
      id = data.id as string;
    }

    // A brand-new post that fails half-way is removed again, so nothing half-saved is left.
    const failed = async (e: unknown) => {
      if (!postId) await supabase.from("posts").delete().eq("id", id);
      throw e;
    };

    const { error: targetErr } = await supabase
      .from("post_targets")
      .insert(post.targets.map((t) => ({ ...t, post_id: id })));
    if (targetErr) await failed(targetErr);

    if (post.attachment.mode !== "keep") {
      if (postId) {
        const { data: old } = await supabase.from("attachments").select("storage_path").eq("post_id", id);
        if (old?.length) {
          await supabase.from("attachments").delete().eq("post_id", id);
          await removeFiles(old);
        }
      }
      const a = post.attachment;
      if (a.mode === "link" || a.mode === "file") {
        const row: Record<string, string | number> =
          a.mode === "link"
            ? { post_id: id, kind: "link", url: a.url, file_name: shortLinkName(a.url) }
            : { post_id: id, kind: "file", storage_path: a.storagePath, file_name: a.fileName, size_bytes: a.size };
        const { error: attErr } = await supabase.from("attachments").insert(row);
        if (attErr) await failed(attErr);
      }
    }
    return { ok: true };
  } catch (e) {
    await logError("teacher/savePost", e);
    return { error: "บันทึกไม่สำเร็จ ระบบขัดข้อง ลองอีกครั้ง" };
  }
}

/** Deletes one of your own posts, with its classroom targets, attachments and uploaded PDFs. */
export async function deletePost(postId: string): Promise<SaveResult> {
  const profile = await requireProfile({ roles: ["teacher", "admin"] });
  try {
    const supabase = await createClient();
    const { data: files } = await supabase.from("attachments").select("storage_path").eq("post_id", postId);
    const { data, error } = await supabase
      .from("posts")
      .delete()
      .eq("id", postId)
      .eq("author_id", profile.id)
      .select("id");
    if (error) throw error;
    if (!data?.length) return { error: "ไม่พบโพสต์นี้ หรือคุณไม่มีสิทธิ์ลบ" };
    await removeFiles(files);
    return { ok: true };
  } catch (e) {
    await logError("teacher/deletePost", e);
    return { error: "ลบไม่สำเร็จ ลองอีกครั้ง" };
  }
}

/** "drive.google.com/…" — a readable name for a link. */
function shortLinkName(url: string) {
  try {
    const u = new URL(url);
    return u.hostname.replace(/^www\./, "").slice(0, 200);
  } catch {
    return "ลิงก์";
  }
}
