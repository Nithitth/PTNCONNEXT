"use server";

import { headers } from "next/headers";
import { requireProfile } from "@/lib/auth";
import { DriveError, disconnectDrive, isDriveConnected, startUpload, trashDriveFile, type SchoolPlace } from "@/lib/drive";
import { DRIVE_MAX_BYTES, driveProblem, isDriveFileId, schoolFileName, termFolderName } from "@/lib/driveCore";
import { logAudit, logError } from "@/lib/logs";
import { isUuid } from "@/lib/postForm";
import { formatClassroom } from "@/lib/roster";
import { CLASSROOMS, SUBJECTS } from "@/lib/school";
import { createAdminClient } from "@/lib/supabase/admin";

// Google Drive actions for the Teacher's Console and the account page (teachers and admins).

export type DriveUploadStart = { url?: string; error?: string; reconnect?: boolean };

/** What the post is about, so a school-drive PDF lands in "<term> / <subject>" named "<rooms> · <title>.pdf". */
export type UploadAbout = { subjectId: string | null; title: string; classroomIds: (string | null)[] };

/** The school drive's folder and file name for this post (read from the database, not trusted from the browser). */
async function placeFor(about: UploadAbout | undefined): Promise<SchoolPlace | undefined> {
  if (!about) return undefined;
  const db = createAdminClient();
  const ids = [...new Set((about.classroomIds ?? []).filter((id): id is string => typeof id === "string" && isUuid(id)))].slice(0, 20);
  const [subject, rooms] = await Promise.all([
    about.subjectId && isUuid(about.subjectId) ? db.from("subjects").select("code").eq("id", about.subjectId).maybeSingle() : null,
    ids.length ? db.from("classrooms").select("grade, room").in("id", ids) : null,
  ]);
  const subjectName = SUBJECTS.find((s) => s.code === subject?.data?.code)?.name ?? "กิจกรรมโรงเรียน";
  const labels = ((rooms?.data ?? []) as { grade: number; room: number }[]).sort((a, b) => a.grade - b.grade || a.room - b.room).map((c) => formatClassroom(c));
  const wholeSchool = (about.classroomIds ?? []).some((id) => id === null);
  return {
    folders: [termFolderName(new Date()), subjectName],
    fileName: schoolFileName(wholeSchool ? [] : labels, String(about.title ?? ""), CLASSROOMS.length),
  };
}

/** Opens an upload into Google Drive (the school's, or the teacher's own); the browser then sends the PDF straight to Google. */
export async function startDriveUpload(name: string, size: number, about?: UploadAbout): Promise<DriveUploadStart> {
  const profile = await requireProfile({ roles: ["teacher", "admin"] });
  const clean =
    String(name ?? "")
      .replace(/[\\/\u0000-\u001f]/g, " ")
      .trim()
      .slice(0, 200) || "เอกสาร.pdf";
  if (!Number.isInteger(size) || size <= 0) return { error: "ไฟล์ว่างเปล่า" };
  if (size > DRIVE_MAX_BYTES) return { error: "ไฟล์ใหญ่เกิน 50 MB" };
  try {
    const h = await headers();
    const origin = h.get("origin") ?? `${h.get("x-forwarded-proto") ?? "https"}://${h.get("host")}`;
    return { url: await startUpload(profile.id, clean, size, origin, await placeFor(about)) };
  } catch (e) {
    if (e instanceof DriveError) {
      // A broken school drive isn't the teacher's to fix: no "connect again" guide, just the fallback button.
      const reconnect = e.reason !== "school-broken" && (e.status === 401 || e.reason === "invalid_grant" || e.reason === "not-connected");
      return { error: e.message, reconnect };
    }
    await logError("teacher/startDriveUpload", e);
    return { error: driveProblem(500) };
  }
}

/** A post that failed to save: move the PDF we just sent to Drive into the trash again (only your own upload). */
export async function discardDriveUpload(fileId: string): Promise<void> {
  const profile = await requireProfile({ roles: ["teacher", "admin"] });
  if (isDriveFileId(fileId)) await trashDriveFile(profile.id, fileId, { uploader: profile.id });
}

/** Can my PDFs go to Google Drive? (The form asks again when the teacher comes back to the page.) */
export async function checkDriveConnected(): Promise<boolean> {
  const profile = await requireProfile({ roles: ["teacher", "admin"] });
  return isDriveConnected(profile.id);
}

/** "ยกเลิกการเชื่อมต่อ": files already in Drive stay there and their links keep working. */
export async function disconnectDriveAction(): Promise<{ ok?: true; error?: string }> {
  const profile = await requireProfile({ roles: ["teacher", "admin"] });
  try {
    await disconnectDrive(profile.id);
    await logAudit(profile.id, "drive-disconnect");
    return { ok: true };
  } catch (e) {
    await logError("teacher/disconnectDrive", e);
    return { error: "ยกเลิกการเชื่อมต่อไม่สำเร็จ ลองอีกครั้ง" };
  }
}
