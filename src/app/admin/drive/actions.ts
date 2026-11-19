"use server";

import { revalidatePath } from "next/cache";
import { requireProfile } from "@/lib/auth";
import { DriveError, chooseSharedDrive, disconnectSchoolDrive, testSchoolDrive } from "@/lib/drive";
import { logAudit, logError } from "@/lib/logs";

// Drive ของโรงเรียน (Developer Console → /admin/drive). Admins only.

export type SchoolDriveResult = { ok?: boolean; error?: string };

const done = () => {
  revalidatePath("/admin/drive");
  revalidatePath("/admin");
};

/** Pick which Shared Drive Connext uses (only ones the connected account can add to, share from and trash in). */
export async function chooseSchoolDrive(driveId: string): Promise<SchoolDriveResult> {
  const profile = await requireProfile({ roles: ["admin"] });
  try {
    const pick = await chooseSharedDrive(String(driveId ?? ""), profile.id);
    if (!pick) return { error: "ใช้ Shared Drive นี้ไม่ได้ บัญชีที่เชื่อมต่อต้องเป็นผู้จัดการ (Manager) ของ Shared Drive นั้น" };
    await logAudit(profile.id, "school-drive-choose", pick.name);
    done();
    return { ok: true };
  } catch (e) {
    if (e instanceof DriveError) return { error: e.reason === "school-broken" ? "การเชื่อมต่อหลุด กด “เชื่อมต่อใหม่”" : e.message };
    await logError("admin/drive/choose", e);
    return { error: "ระบบขัดข้อง ลองอีกครั้ง" };
  }
}

/** "ทดสอบการเชื่อมต่อ". */
export async function testSchoolDriveAction(): Promise<SchoolDriveResult> {
  await requireProfile({ roles: ["admin"] });
  try {
    const ok = await testSchoolDrive();
    done();
    return ok ? { ok: true } : { error: "ยังไม่ได้เลือก Shared Drive" };
  } catch (e) {
    done();
    if (e instanceof DriveError)
      return { error: e.reason === "school-broken" ? "การเชื่อมต่อหลุด กด “เชื่อมต่อใหม่”" : "ไม่พบ Shared Drive หรือบัญชีนี้ไม่มีสิทธิ์แล้ว กด “เชื่อมต่อใหม่”" };
    await logError("admin/drive/test", e);
    return { error: "ระบบขัดข้อง ลองอีกครั้ง" };
  }
}

/** "ยกเลิกการเชื่อมต่อ": files stay in the Shared Drive and their links keep working; new PDFs go to Connext. */
export async function disconnectSchoolDriveAction(): Promise<SchoolDriveResult> {
  const profile = await requireProfile({ roles: ["admin"] });
  try {
    await disconnectSchoolDrive();
    await logAudit(profile.id, "school-drive-disconnect");
    done();
    return { ok: true };
  } catch (e) {
    await logError("admin/drive/disconnect", e);
    return { error: "ยกเลิกไม่สำเร็จ ลองอีกครั้ง" };
  }
}
