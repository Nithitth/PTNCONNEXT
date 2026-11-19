import "server-only";
import { randomBytes, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import {
  DRIVE_FOLDER_NAME,
  DRIVE_MAX_BYTES,
  DRIVE_SCOPE,
  EXPIRED_FOLDER_NAME,
  SCHOOL_DRIVE_PAGE,
  SCHOOL_DRIVE_SCOPE,
  driveProblem,
  googleReason,
  isDriveFileId,
  safeName,
  safeNext,
} from "@/lib/driveCore";
import { decryptToken, encryptToken } from "@/lib/driveCrypto";
import { logError } from "@/lib/logs";
import { hashCode } from "@/lib/signupServer";
import { createAdminClient } from "@/lib/supabase/admin";

// Teachers' PDFs in Google Drive. All Google calls are plain fetch. Two ways to store them:
// • Drive ของโรงเรียน (docs/specs/2026-11-19-school-drive-design.md): an admin connects the school's Shared Drive
//   once; every teacher's PDF goes there. The connection lives in app_settings ("school_drive", server-only).
// • Each teacher's own Drive (migration 0019): used only while no school drive is connected. Each teacher
//   connects once; Google gives us a key for files this app creates (scope drive.file), kept encrypted in
//   drive_connections (server only).
// Whether a file is in the school drive is asked from Google (the file's driveId), so attachment rows don't change.

const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const REVOKE_URL = "https://oauth2.googleapis.com/revoke";
const API = "https://www.googleapis.com/drive/v3";
const UPLOAD = "https://www.googleapis.com/upload/drive/v3/files";
const FOLDER_TYPE = "application/vnd.google-apps.folder";
/** Every call that may touch a Shared Drive needs this. */
const ALL = "supportsAllDrives=true";

/** A Google problem, with a Thai message a teacher can act on. */
export class DriveError extends Error {
  constructor(
    public status: number,
    public reason = "",
  ) {
    super(driveProblem(status, reason));
  }
}

const env = () => ({
  id: process.env.GOOGLE_CLIENT_ID ?? "",
  secret: process.env.GOOGLE_CLIENT_SECRET ?? "",
  tokenSecret: process.env.GOOGLE_TOKEN_SECRET ?? "",
});

/** The Drive option only shows when the school has set up its Google keys (docs/SETUP.md). */
export function driveConfigured() {
  const e = env();
  return Boolean(e.id && e.secret && e.tokenSecret.length >= 16);
}

async function drive<T>(token: string, url: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json; charset=UTF-8", ...(init.headers ?? {}) },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new DriveError(res.status, googleReason(body));
  }
  return (res.status === 204 ? {} : await res.json()) as T;
}

/** Swaps a long-lived key for a short-lived one. Throws DriveError (reason "invalid_grant" when revoked). */
async function refresh(refreshToken: string): Promise<string> {
  const e = env();
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: e.id, client_secret: e.secret, refresh_token: refreshToken, grant_type: "refresh_token" }),
  });
  const body = (await res.json().catch(() => ({}))) as { access_token?: string };
  if (!res.ok || !body.access_token) throw new DriveError(res.status || 401, googleReason(body) || "invalid_grant");
  return body.access_token;
}

// ─── Drive ของโรงเรียน: the connection ────────────────────────

/** What app_settings.school_drive holds. */
type SchoolRow = {
  tokenEnc: string;
  /** null until the admin picks which Shared Drive to use. */
  driveId: string | null;
  driveName: string | null;
  connectedBy: string;
  connectedByName: string;
  connectedAt: string;
  lastOkAt?: string;
  /** Google refused the key (account removed or permission revoked): uploads fall back until someone reconnects. */
  broken?: boolean;
};

const SCHOOL_KEY = "school_drive";

async function loadSchool(): Promise<SchoolRow | null> {
  const { data } = await createAdminClient().from("app_settings").select("value").eq("key", SCHOOL_KEY).maybeSingle();
  const v = data?.value as SchoolRow | undefined;
  return v && typeof v.tokenEnc === "string" ? v : null;
}

async function saveSchool(row: SchoolRow, actorId?: string) {
  const { error } = await createAdminClient()
    .from("app_settings")
    .upsert({ key: SCHOOL_KEY, value: row, updated_at: new Date().toISOString(), ...(actorId ? { updated_by: actorId } : {}) });
  if (error) throw error;
}

export type SchoolDriveStatus = {
  configured: boolean;
  /** off = never connected · pick = signed in, Shared Drive not chosen yet · on = in use · broken = needs reconnecting */
  state: "off" | "pick" | "on" | "broken";
  driveName: string | null;
  connectedByName: string | null;
  connectedAt: string | null;
  lastOkAt: string | null;
};

export async function schoolDriveStatus(): Promise<SchoolDriveStatus> {
  const configured = driveConfigured();
  const row = configured ? await loadSchool() : null;
  const state = !row ? "off" : row.broken ? "broken" : row.driveId ? "on" : "pick";
  return {
    configured,
    state,
    driveName: row?.driveName ?? null,
    connectedByName: row?.connectedByName ?? null,
    connectedAt: row?.connectedAt ?? null,
    lastOkAt: row?.lastOkAt ?? null,
  };
}

/** The school drive when it's ready to take uploads (connected, Shared Drive chosen, not broken). */
async function activeSchool(): Promise<(SchoolRow & { driveId: string }) | null> {
  if (!driveConfigured()) return null;
  const row = await loadSchool();
  return row && row.driveId && !row.broken ? (row as SchoolRow & { driveId: string }) : null;
}

/** A short-lived key for the school drive. A refused key marks the connection broken (admins see an alert). */
async function schoolToken(row: SchoolRow): Promise<string> {
  const refreshToken = decryptToken(row.tokenEnc, env().tokenSecret);
  if (!refreshToken) {
    await saveSchool({ ...row, broken: true });
    throw new DriveError(401, "school-broken");
  }
  try {
    return await refresh(refreshToken);
  } catch (e) {
    if (e instanceof DriveError && (e.reason === "invalid_grant" || e.status === 401)) {
      await saveSchool({ ...row, broken: true });
      throw new DriveError(401, "school-broken");
    }
    throw e;
  }
}

export type SharedDriveChoice = { id: string; name: string; canUse: boolean };

/** The Shared Drives the connected account can see, and whether Connext could add files to each. */
export async function listSharedDrives(): Promise<SharedDriveChoice[]> {
  const row = await loadSchool();
  if (!row) return [];
  const token = await schoolToken(row);
  const r = await drive<{
    drives?: { id: string; name: string; capabilities?: { canAddChildren?: boolean; canShare?: boolean; canTrashChildren?: boolean } }[];
  }>(token, `${API}/drives?pageSize=100&fields=drives(id,name,capabilities(canAddChildren,canShare,canTrashChildren))`);
  return (r.drives ?? []).map((d) => ({
    id: d.id,
    name: d.name,
    canUse: Boolean(d.capabilities?.canAddChildren && d.capabilities?.canShare && d.capabilities?.canTrashChildren),
  }));
}

/** The admin picks which Shared Drive to use. Only one Connext can add to, share from and trash in. */
export async function chooseSharedDrive(driveId: string, actorId: string): Promise<SharedDriveChoice | null> {
  const row = await loadSchool();
  if (!row) return null;
  const pick = (await listSharedDrives()).find((d) => d.id === driveId && d.canUse);
  if (!pick) return null;
  await saveSchool({ ...row, driveId: pick.id, driveName: pick.name, broken: false, lastOkAt: new Date().toISOString() }, actorId);
  return pick;
}

/** "ทดสอบการเชื่อมต่อ": the key still works and the Shared Drive is still there. */
export async function testSchoolDrive(): Promise<boolean> {
  const row = await loadSchool();
  if (!row?.driveId) return false;
  const token = await schoolToken(row);
  await drive(token, `${API}/drives/${encodeURIComponent(row.driveId)}?fields=id`);
  await saveSchool({ ...row, lastOkAt: new Date().toISOString() });
  return true;
}

/** Forgets the school connection and cancels the key. Files stay in the Shared Drive and their links keep working. */
export async function disconnectSchoolDrive() {
  const row = await loadSchool();
  const token = row ? decryptToken(row.tokenEnc, env().tokenSecret) : null;
  if (token) await fetch(`${REVOKE_URL}?${new URLSearchParams({ token })}`, { method: "POST" }).catch(() => null);
  await createAdminClient().from("app_settings").delete().eq("key", SCHOOL_KEY);
}

const quoteQ = (s: string) => s.replace(/\\/g, "\\\\").replace(/'/g, "\\'");

/** Finds or makes a folder path inside the Shared Drive, e.g. ["2569 ภาค 2", "คณิตศาสตร์"]. Returns the last folder's id. */
async function ensureSchoolFolder(token: string, driveId: string, path: string[]): Promise<string> {
  let parent = driveId;
  for (const raw of path) {
    const name = safeName(raw) || "อื่น ๆ";
    const q = `name='${quoteQ(name)}' and '${parent}' in parents and mimeType='${FOLDER_TYPE}' and trashed=false`;
    const found = await drive<{ files?: { id: string }[] }>(
      token,
      `${API}/files?${new URLSearchParams({ q, corpora: "drive", driveId, includeItemsFromAllDrives: "true", supportsAllDrives: "true", fields: "files(id)", pageSize: "1" })}`,
    );
    parent =
      found.files?.[0]?.id ??
      (
        await drive<{ id: string }>(token, `${API}/files?${ALL}&fields=id`, {
          method: "POST",
          body: JSON.stringify({ name, mimeType: FOLDER_TYPE, parents: [parent] }),
        })
      ).id;
  }
  return parent;
}

type SchoolFile = {
  id: string;
  name?: string;
  mimeType?: string;
  size?: string;
  trashed?: boolean;
  driveId?: string;
  parents?: string[];
  appProperties?: { connextUser?: string };
};

/** The file if it lives in the school's Shared Drive, else null (it's in a teacher's own Drive, or gone). */
async function schoolFile(token: string, row: SchoolRow, fileId: string): Promise<SchoolFile | null> {
  if (!isDriveFileId(fileId)) return null;
  try {
    const f = await drive<SchoolFile>(token, `${API}/files/${fileId}?${ALL}&fields=id,name,mimeType,size,trashed,driveId,parents,appProperties`);
    return f.driveId === row.driveId ? f : null;
  } catch (e) {
    if (e instanceof DriveError && (e.status === 404 || e.status === 403)) return null;
    throw e;
  }
}

/** Link sharing off (Google keeps trashed and moved files open to link holders otherwise). */
async function unshare(token: string, fileId: string, shared: boolean) {
  await drive(token, `${API}/files/${fileId}/permissions/anyoneWithLink${shared ? `?${ALL}` : ""}`, { method: "DELETE" }).catch((e) => {
    if (!(e instanceof DriveError && e.status === 404)) throw e; // already not shared
  });
}

// ─── Each teacher's own Drive: connecting (OAuth) ─────────────

/** Has this person connected their own Google Drive? */
async function hasTeacherDrive(userId: string) {
  const { data } = await createAdminClient().from("drive_connections").select("user_id").eq("user_id", userId).maybeSingle();
  return Boolean(data);
}

/** Can this person's PDFs go to Google Drive right now (the school drive, or their own)? */
export async function isDriveConnected(userId: string) {
  if (!driveConfigured()) return false;
  return Boolean(await activeSchool()) || (await hasTeacherDrive(userId));
}

/** For the teacher pages: is Drive set up, does it work for me, and is it the school's? */
export async function driveState(userId: string) {
  const configured = driveConfigured();
  const school = configured && Boolean(await activeSchool());
  return { configured, school, connected: school || (configured && (await hasTeacherDrive(userId))) };
}

const STATE_COOKIE = "ptn-drive-state";
const STATE_MINUTES = 15;
const stateMac = (userId: string, nonce: string, exp: number, next: string) => hashCode(`drive-state:${userId}:${nonce}:${exp}:${next}`);

/**
 * The Google page to send someone to, plus a one-time check cookie against forged returns.
 * `school` asks for the full Drive permission (admins connecting the school's Shared Drive; `next` is then /admin/drive).
 */
export async function startConnect(userId: string, origin: string, nextRaw: string, school = false) {
  const next = school ? SCHOOL_DRIVE_PAGE : safeNext(nextRaw);
  const nonce = randomBytes(16).toString("base64url");
  const exp = Date.now() + STATE_MINUTES * 60_000;
  (await cookies()).set(STATE_COOKIE, [nonce, exp, Buffer.from(next).toString("base64url"), stateMac(userId, nonce, exp, next)].join("."), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/api/google",
    maxAge: STATE_MINUTES * 60,
  });
  const params = new URLSearchParams({
    client_id: env().id,
    redirect_uri: `${origin}/api/google/callback`,
    response_type: "code",
    scope: school ? SCHOOL_DRIVE_SCOPE : DRIVE_SCOPE,
    access_type: "offline",
    prompt: "consent",
    state: nonce,
  });
  return `${AUTH_URL}?${params}`;
}

/** Checks Google's return against the cookie; gives the page to go back to, or null when forged/expired. */
export async function checkConnectState(userId: string, state: string): Promise<string | null> {
  const jar = await cookies();
  const raw = jar.get(STATE_COOKIE)?.value ?? "";
  jar.delete({ name: STATE_COOKIE, path: "/api/google" });
  const [nonce, expText, nextB64, mac] = raw.split(".");
  const exp = Number(expText);
  if (!nonce || !mac || !Number.isFinite(exp) || exp < Date.now() || nonce !== state) return null;
  const next = safeNext(Buffer.from(nextB64 ?? "", "base64url").toString());
  const expected = Buffer.from(stateMac(userId, nonce, exp, next));
  const got = Buffer.from(mac);
  return expected.length === got.length && timingSafeEqual(expected, got) ? next : null;
}

/**
 * Swaps Google's one-time code for the long-lived key and saves it (encrypted).
 * `school` saves it as the school connection (the admin then picks the Shared Drive).
 * "noscope" = the permission was un-ticked on Google's page.
 */
export async function finishConnect(
  userId: string,
  origin: string,
  code: string,
  school: { name: string } | null = null,
): Promise<"ok" | "noscope" | "failed"> {
  const e = env();
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: e.id,
      client_secret: e.secret,
      redirect_uri: `${origin}/api/google/callback`,
      grant_type: "authorization_code",
    }),
  });
  const body = (await res.json().catch(() => ({}))) as { refresh_token?: string; access_token?: string; scope?: string };
  if (!res.ok) {
    await logError("drive/finishConnect", new Error(`token ${res.status} ${googleReason(body)}`));
    return "failed";
  }
  if (
    !String(body.scope ?? "")
      .split(" ")
      .includes(school ? SCHOOL_DRIVE_SCOPE : DRIVE_SCOPE)
  )
    return "noscope";
  if (!body.refresh_token || !body.access_token) return "failed";
  const now = new Date().toISOString();
  if (school) {
    // A fresh school connection: the Shared Drive is chosen next on /admin/drive.
    await saveSchool(
      {
        tokenEnc: encryptToken(body.refresh_token, e.tokenSecret),
        driveId: null,
        driveName: null,
        connectedBy: userId,
        connectedByName: school.name,
        connectedAt: now,
      },
      userId,
    );
    return "ok";
  }
  const { error } = await createAdminClient()
    .from("drive_connections")
    .upsert({ user_id: userId, refresh_token_enc: encryptToken(body.refresh_token, e.tokenSecret), folder_id: null, connected_at: now, updated_at: now });
  if (error) throw error;
  try {
    await ensureFolder(userId, body.access_token);
  } catch (err) {
    await logError("drive/finishConnect/folder", err); // made again on the first upload
  }
  return "ok";
}

/** Forgets a teacher's own connection and tells Google to cancel the key. Files already in Drive stay there. */
export async function disconnectDrive(userId: string) {
  const db = createAdminClient();
  const { data } = await db.from("drive_connections").select("refresh_token_enc").eq("user_id", userId).maybeSingle();
  const token = data ? decryptToken(data.refresh_token_enc as string, env().tokenSecret) : null;
  if (token) await fetch(`${REVOKE_URL}?${new URLSearchParams({ token })}`, { method: "POST" }).catch(() => null);
  await db.from("drive_connections").delete().eq("user_id", userId);
}

// ─── Each teacher's own Drive: talking to it ─────────────────

/** A short-lived key for a teacher's own Drive. A cancelled connection is removed, so the page offers to reconnect. */
export async function accessTokenFor(userId: string): Promise<string> {
  const db = createAdminClient();
  const { data } = await db.from("drive_connections").select("refresh_token_enc").eq("user_id", userId).maybeSingle();
  const refreshToken = data ? decryptToken(data.refresh_token_enc as string, env().tokenSecret) : null;
  if (!refreshToken) {
    if (data) await db.from("drive_connections").delete().eq("user_id", userId);
    throw new DriveError(401, "not-connected");
  }
  try {
    return await refresh(refreshToken);
  } catch (e) {
    if (e instanceof DriveError && e.reason === "invalid_grant") await db.from("drive_connections").delete().eq("user_id", userId);
    throw e;
  }
}

/** The "PTN Connext" folder in a teacher's own Drive (made once, made again if they deleted it). */
async function ensureFolder(userId: string, token: string): Promise<string> {
  const db = createAdminClient();
  const { data } = await db.from("drive_connections").select("folder_id").eq("user_id", userId).maybeSingle();
  const saved = (data?.folder_id as string | null) ?? null;
  if (saved) {
    const f = await drive<{ trashed?: boolean }>(token, `${API}/files/${saved}?fields=id,trashed`).catch(() => null);
    if (f && !f.trashed) return saved;
  }
  const made = await drive<{ id: string }>(token, `${API}/files?fields=id`, {
    method: "POST",
    body: JSON.stringify({ name: DRIVE_FOLDER_NAME, mimeType: FOLDER_TYPE }),
  });
  await db.from("drive_connections").update({ folder_id: made.id, updated_at: new Date().toISOString() }).eq("user_id", userId);
  return made.id;
}

// ─── Uploading, checking, removing (both ways) ───────────────

/** Where a school upload goes: ["2569 ภาค 2", "คณิตศาสตร์"] and its file name. Ignored for teachers' own Drives. */
export type SchoolPlace = { folders: string[]; fileName: string };

async function openUpload(token: string, metadata: Record<string, unknown>, size: number, origin: string, shared: boolean): Promise<string> {
  const res = await fetch(`${UPLOAD}?uploadType=resumable&fields=id${shared ? `&${ALL}` : ""}`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json; charset=UTF-8",
      "x-upload-content-type": "application/pdf",
      "x-upload-content-length": String(size),
      origin,
    },
    body: JSON.stringify({ mimeType: "application/pdf", ...metadata }),
  });
  const location = res.headers.get("location");
  if (!res.ok || !location) throw new DriveError(res.status, googleReason(await res.json().catch(() => ({}))));
  return location;
}

/**
 * Opens an upload and returns its one-time address; the browser then sends the PDF straight to Google (our server
 * never carries the file). The school drive when connected, else the teacher's own Drive. `origin` lets Google accept it.
 */
export async function startUpload(userId: string, name: string, size: number, origin: string, place?: SchoolPlace): Promise<string> {
  const school = await activeSchool();
  if (school) {
    const token = await schoolToken(school);
    const folder = await ensureSchoolFolder(token, school.driveId, place?.folders ?? ["อื่น ๆ"]);
    // Who uploaded it travels with the file, so nobody can attach or trash a colleague's file by its id.
    return openUpload(token, { name: place?.fileName ?? name, parents: [folder], appProperties: { connextUser: userId } }, size, origin, true);
  }
  const token = await accessTokenFor(userId);
  const folder = await ensureFolder(userId, token);
  return openUpload(token, { name, parents: [folder] }, size, origin, false);
}

/** The uploaded file must be this teacher's, a PDF, not in the trash, and not too big. Returns the key to share it with. */
export async function checkUploaded(userId: string, fileId: string) {
  if (!isDriveFileId(fileId)) throw new DriveError(404);
  const school = await activeSchool();
  if (school) {
    const token = await schoolToken(school);
    const f = await schoolFile(token, school, fileId);
    if (f) {
      if (f.appProperties?.connextUser !== userId || f.trashed || f.mimeType !== "application/pdf") throw new DriveError(404);
      const size = Number(f.size ?? 0);
      if (!size || size > DRIVE_MAX_BYTES) throw new DriveError(400, "too-big");
      return { name: f.name ?? "", size, token, shared: true };
    }
  }
  const t = await accessTokenFor(userId);
  const f = await drive<{ mimeType?: string; size?: string; trashed?: boolean; name?: string }>(
    t,
    `${API}/files/${fileId}?fields=id,name,mimeType,size,trashed`,
  );
  if (f.trashed || f.mimeType !== "application/pdf") throw new DriveError(404);
  const size = Number(f.size ?? 0);
  if (!size || size > DRIVE_MAX_BYTES) throw new DriveError(400, "too-big");
  return { name: f.name ?? "", size, token: t, shared: false };
}

/** "Anyone with the link can view", so every student can open it without a Google account. */
export async function shareWithLink(token: string, fileId: string, shared = false) {
  await drive(token, `${API}/files/${fileId}/permissions?fields=id${shared ? `&${ALL}` : ""}`, {
    method: "POST",
    body: JSON.stringify({ role: "reader", type: "anyone" }),
  });
}

/**
 * A post was deleted or its PDF replaced: stop sharing the file and move it to the trash (restorable for 30 days).
 * School drive files go to the Shared Drive's trash; others to their owner's own Drive trash. With `uploader`,
 * only that person's school files may be trashed (a teacher discarding their own failed upload).
 * Returns false when it couldn't (disconnected, Google down); never throws.
 */
export async function trashDriveFile(ownerId: string | null, fileId: string, opts: { uploader?: string } = {}): Promise<boolean> {
  if (!isDriveFileId(fileId) || !driveConfigured()) return false;
  try {
    const school = await activeSchool();
    if (school) {
      const token = await schoolToken(school);
      const f = await schoolFile(token, school, fileId);
      if (f) {
        if (opts.uploader && f.appProperties?.connextUser !== opts.uploader) return false;
        await unshare(token, fileId, true);
        await drive(token, `${API}/files/${fileId}?${ALL}&fields=id`, { method: "PATCH", body: JSON.stringify({ trashed: true }) });
        return true;
      }
    }
    if (!ownerId) return false;
    const token = await accessTokenFor(ownerId);
    await unshare(token, fileId, false);
    await drive(token, `${API}/files/${fileId}?fields=id`, { method: "PATCH", body: JSON.stringify({ trashed: true }) });
    return true;
  } catch (e) {
    if (e instanceof DriveError && e.status === 404) return true; // already gone
    await logError("drive/trash", e);
    return false;
  }
}

/**
 * A PDF reached its 180 days. School drive: the link is switched off and the file moves to the "หมดอายุ" folder,
 * kept as the school's archive. A teacher's own Drive: link off and into their trash (as before).
 * Returns false when it couldn't; never throws.
 */
export async function expireDriveFile(ownerId: string | null, fileId: string): Promise<boolean> {
  if (!isDriveFileId(fileId) || !driveConfigured()) return false;
  try {
    const school = await activeSchool();
    if (school) {
      const token = await schoolToken(school);
      const f = await schoolFile(token, school, fileId);
      if (f) {
        await unshare(token, fileId, true);
        const archive = await ensureSchoolFolder(token, school.driveId, [EXPIRED_FOLDER_NAME]);
        if (!(f.parents ?? []).includes(archive)) {
          const move = new URLSearchParams({ addParents: archive, removeParents: (f.parents ?? []).join(","), supportsAllDrives: "true", fields: "id" });
          await drive(token, `${API}/files/${fileId}?${move}`, { method: "PATCH", body: "{}" });
        }
        return true;
      }
    }
    return await trashDriveFile(ownerId, fileId);
  } catch (e) {
    if (e instanceof DriveError && e.status === 404) return true;
    await logError("drive/expire", e);
    return false;
  }
}
