// Google Drive for teachers' PDFs: pure rules shared by the browser and the server (no secrets here).
// Each teacher connects their own Google account once; PDFs then go into a "PTN Connext" folder in their
// Drive, shared "anyone with the link can view", and Connext keeps only the link (migration 0019).

/** The only Google permission we ask for: files this app created. We never see the rest of the Drive. */
export const DRIVE_SCOPE = "https://www.googleapis.com/auth/drive.file";
/** The folder made in each teacher's Drive. */
export const DRIVE_FOLDER_NAME = "PTN Connext";
/** Largest PDF a teacher may keep in Drive (it uses their own Google space, not ours). */
export const DRIVE_MAX_BYTES = 50 * 1024 * 1024;

/** Google Drive file ids are 20–100 letters, digits, "-" or "_". */
export const isDriveFileId = (id: string) => /^[A-Za-z0-9_-]{20,100}$/.test(id);

/** The link students open. */
export const driveViewUrl = (id: string) => `https://drive.google.com/file/d/${id}/view`;

/** The "เชื่อมต่อ Google Drive" link (a plain link: our CSP only lets forms post to ourselves). */
export const driveConnectHref = (next: string) => `/api/google/connect?next=${encodeURIComponent(next)}`;

/** Where to send someone back after connecting: only our own pages. */
export function safeNext(raw: string | null | undefined): string {
  const s = String(raw ?? "");
  return /^\/(teacher|account)(?:[/?#][^\s\\]*)?$/.test(s) && !s.startsWith("//") ? s : "/teacher";
}

/**
 * A Google answer → a short Thai sentence a teacher can act on. `reason` is Google's error reason
 * (e.g. "storageQuotaExceeded") or OAuth error (e.g. "invalid_grant"); `status` the HTTP status.
 */
export function driveProblem(status: number, reason = ""): string {
  if (reason === "storageQuotaExceeded" || reason === "quotaExceeded") {
    return "Google Drive ของคุณเต็ม ลบไฟล์ที่ไม่ใช้ใน Drive ก่อน หรือกด “เก็บในระบบ Connext แทน”";
  }
  if (reason === "invalid_grant" || reason === "not-connected" || status === 401) {
    return "การเชื่อมต่อ Google Drive หมดอายุ กดปุ่ม “เชื่อมต่อ Google Drive” ใหม่อีกครั้ง";
  }
  if (reason === "publishOutNotPermitted" || reason === "cannotShareTeamDriveWithNonGoogleAccounts") {
    return "บัญชี Google ของคุณไม่อนุญาตให้แชร์ไฟล์ให้นักเรียนทุกคน ใช้บัญชี Gmail ส่วนตัวแทน หรือกด “เก็บในระบบ Connext แทน”";
  }
  if (reason === "too-big") return "ไฟล์ใหญ่เกิน 50 MB";
  if (status === 403) return "Google Drive ไม่อนุญาตให้ส่งไฟล์ ลองเชื่อมต่อ Google Drive ใหม่อีกครั้ง";
  if (status === 404) return "ไม่พบไฟล์ใน Google Drive ลองเลือกไฟล์ใหม่";
  if (status === 0) return "ส่งไฟล์ไม่สำเร็จ ตรวจสอบอินเทอร์เน็ตแล้วลองอีกครั้ง";
  return "Google Drive ขัดข้อง ลองอีกครั้ง หรือกด “เก็บในระบบ Connext แทน”";
}

/** Reads Google's error reason out of a JSON error body (Drive API or OAuth). */
export function googleReason(body: unknown): string {
  if (!body || typeof body !== "object") return "";
  const b = body as { error?: unknown; error_description?: unknown };
  if (typeof b.error === "string") return b.error;
  const e = b.error as { errors?: { reason?: unknown }[]; status?: unknown } | undefined;
  const reason = e?.errors?.[0]?.reason;
  return typeof reason === "string" ? reason : typeof e?.status === "string" ? e.status : "";
}
