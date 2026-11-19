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
  return /^\/(teacher|account|admin\/drive)(?:[/?#][^\s\\]*)?$/.test(s) && !s.startsWith("//") ? s : "/teacher";
}

// ─── Drive ของโรงเรียน (one school Shared Drive, docs/specs/2026-11-19-school-drive-design.md) ───

/**
 * The school connection needs the full Drive permission: listing Shared Drives and writing into one isn't
 * possible with drive.file. Acceptable because the Google app is "Internal" (school accounts only) and the
 * key is kept encrypted on the server.
 */
export const SCHOOL_DRIVE_SCOPE = "https://www.googleapis.com/auth/drive";
/** Where expired PDFs are kept (link switched off) at the top of the Shared Drive. */
export const EXPIRED_FOLDER_NAME = "หมดอายุ";
/** The page the school connection comes back to. */
export const SCHOOL_DRIVE_PAGE = "/admin/drive";
/** The "เชื่อมต่อ Drive ของโรงเรียน" link (admins only). */
export const schoolDriveConnectHref = () => `/api/google/connect?school=1&next=${encodeURIComponent(SCHOOL_DRIVE_PAGE)}`;

/** Folder and file names must not contain slashes or control characters, and stay short. */
export const safeName = (s: string, max = 120) =>
  String(s ?? "")
    .replace(/[\\/\u0000-\u001f]/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);

/** The school-year term a date falls in, as a folder name: May–Oct = ภาค 1, Nov–Apr = ภาค 2 (Buddhist Era year). */
export function termFolderName(date: Date): string {
  const thai = new Date(date.getTime() + 7 * 3_600_000);
  const y = thai.getUTCFullYear();
  const m = thai.getUTCMonth() + 1;
  const year = (m >= 5 ? y : y - 1) + 543;
  return `${year} ภาค ${m >= 5 && m <= 10 ? 1 : 2}`;
}

/**
 * "ม.5-1 · ใบงานบทที่ 3.pdf": rooms first so the school can find files by class.
 * `rooms` are labels like "ม.5/1" (empty = the whole school); every one of the 8 rooms → "ทุกห้อง".
 */
export function schoolFileName(rooms: string[], title: string, allRooms = 8): string {
  const where = rooms.length === 0 ? "ทั้งโรงเรียน" : rooms.length >= allRooms ? "ทุกห้อง" : rooms.map((r) => r.replace("/", "-")).join(", ");
  const name = safeName(`${where} · ${safeName(title, 120) || "เอกสาร"}`, 180);
  return `${name}.pdf`;
}

/**
 * A Google answer → a short Thai sentence a teacher can act on. `reason` is Google's error reason
 * (e.g. "storageQuotaExceeded") or OAuth error (e.g. "invalid_grant"); `status` the HTTP status.
 */
export function driveProblem(status: number, reason = ""): string {
  if (reason === "storageQuotaExceeded" || reason === "quotaExceeded") {
    return "Google Drive ของคุณเต็ม ลบไฟล์ที่ไม่ใช้ใน Drive ก่อน หรือกด “เก็บในระบบ Connext แทน”";
  }
  if (reason === "school-broken") {
    return "Drive ของโรงเรียนหลุดการเชื่อมต่อ กด “เก็บในระบบ Connext แทน” แล้วแจ้งผู้ดูแลระบบ";
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
