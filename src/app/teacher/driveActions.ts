"use server";

import { headers } from "next/headers";
import { requireProfile } from "@/lib/auth";
import { DriveError, disconnectDrive, isDriveConnected, startUpload, trashDriveFile } from "@/lib/drive";
import { DRIVE_MAX_BYTES, driveProblem, isDriveFileId } from "@/lib/driveCore";
import { logAudit, logError } from "@/lib/logs";

// Google Drive actions for the Teacher's Console and the account page (teachers and admins).

export type DriveUploadStart = { url?: string; error?: string; reconnect?: boolean };

/** Opens an upload into the teacher's Drive; the browser then sends the PDF straight to Google. */
export async function startDriveUpload(name: string, size: number): Promise<DriveUploadStart> {
  const profile = await requireProfile({ roles: ["teacher", "admin"] });
  const clean = String(name ?? "").replace(/[\\/\u0000-\u001f]/g, " ").trim().slice(0, 200) || "เอกสาร.pdf";
  if (!Number.isInteger(size) || size <= 0) return { error: "ไฟล์ว่างเปล่า" };
  if (size > DRIVE_MAX_BYTES) return { error: "ไฟล์ใหญ่เกิน 50 MB" };
  try {
    const h = await headers();
    const origin = h.get("origin") ?? `${h.get("x-forwarded-proto") ?? "https"}://${h.get("host")}`;
    return { url: await startUpload(profile.id, clean, size, origin) };
  } catch (e) {
    if (e instanceof DriveError) {
      return { error: e.message, reconnect: e.status === 401 || e.reason === "invalid_grant" || e.reason === "not-connected" };
    }
    await logError("teacher/startDriveUpload", e);
    return { error: driveProblem(500) };
  }
}

/** A post that failed to save: move the PDF we just sent to Drive into the trash again. */
export async function discardDriveUpload(fileId: string): Promise<void> {
  const profile = await requireProfile({ roles: ["teacher", "admin"] });
  if (isDriveFileId(fileId)) await trashDriveFile(profile.id, fileId);
}

/** Is Google Drive connected for me? (The form asks again when the teacher comes back to the page.) */
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
