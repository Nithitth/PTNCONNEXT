import "server-only";
import { randomBytes, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { DRIVE_FOLDER_NAME, DRIVE_MAX_BYTES, DRIVE_SCOPE, driveProblem, googleReason, isDriveFileId, safeNext } from "@/lib/driveCore";
import { decryptToken, encryptToken } from "@/lib/driveCrypto";
import { logError } from "@/lib/logs";
import { hashCode } from "@/lib/signupServer";
import { createAdminClient } from "@/lib/supabase/admin";

// Teachers' PDFs in their own Google Drive (migration 0019). All Google calls are plain fetch.
// Each teacher connects once ("เชื่อมต่อ Google Drive"); Google gives us a long-lived key for files this
// app creates (scope drive.file), which we keep encrypted in drive_connections (server only).

const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const REVOKE_URL = "https://oauth2.googleapis.com/revoke";
const API = "https://www.googleapis.com/drive/v3";
const UPLOAD = "https://www.googleapis.com/upload/drive/v3/files";

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

/** Has this person connected Google Drive? */
export async function isDriveConnected(userId: string) {
  if (!driveConfigured()) return false;
  const { data } = await createAdminClient().from("drive_connections").select("user_id").eq("user_id", userId).maybeSingle();
  return Boolean(data);
}

export async function driveState(userId: string) {
  const configured = driveConfigured();
  return { configured, connected: configured && (await isDriveConnected(userId)) };
}

// ─── Connecting (OAuth) ───────────────────────────────────────

const STATE_COOKIE = "ptn-drive-state";
const STATE_MINUTES = 15;
const stateMac = (userId: string, nonce: string, exp: number, next: string) => hashCode(`drive-state:${userId}:${nonce}:${exp}:${next}`);

/** The Google page to send a teacher to, plus a one-time check cookie against forged returns. */
export async function startConnect(userId: string, origin: string, nextRaw: string) {
  const next = safeNext(nextRaw);
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
    scope: DRIVE_SCOPE,
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
 * "noscope" = the teacher un-ticked the Drive permission on Google's page.
 */
export async function finishConnect(userId: string, origin: string, code: string): Promise<"ok" | "noscope" | "failed"> {
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
  if (!String(body.scope ?? "").split(" ").includes(DRIVE_SCOPE)) return "noscope";
  if (!body.refresh_token || !body.access_token) return "failed";
  const now = new Date().toISOString();
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

/** Forgets the connection and tells Google to cancel the key. Files already in Drive stay there. */
export async function disconnectDrive(userId: string) {
  const db = createAdminClient();
  const { data } = await db.from("drive_connections").select("refresh_token_enc").eq("user_id", userId).maybeSingle();
  const token = data ? decryptToken(data.refresh_token_enc as string, env().tokenSecret) : null;
  if (token) await fetch(`${REVOKE_URL}?${new URLSearchParams({ token })}`, { method: "POST" }).catch(() => null);
  await db.from("drive_connections").delete().eq("user_id", userId);
}

// ─── Talking to Drive ─────────────────────────────────────────

/** A short-lived Drive key for this person. A cancelled connection is removed, so the page offers to reconnect. */
export async function accessTokenFor(userId: string): Promise<string> {
  const e = env();
  const db = createAdminClient();
  const { data } = await db.from("drive_connections").select("refresh_token_enc").eq("user_id", userId).maybeSingle();
  const refresh = data ? decryptToken(data.refresh_token_enc as string, e.tokenSecret) : null;
  if (!refresh) {
    if (data) await db.from("drive_connections").delete().eq("user_id", userId);
    throw new DriveError(401, "not-connected");
  }
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: e.id, client_secret: e.secret, refresh_token: refresh, grant_type: "refresh_token" }),
  });
  const body = (await res.json().catch(() => ({}))) as { access_token?: string };
  if (!res.ok || !body.access_token) {
    const reason = googleReason(body);
    if (reason === "invalid_grant") await db.from("drive_connections").delete().eq("user_id", userId);
    throw new DriveError(res.status || 401, reason || "invalid_grant");
  }
  return body.access_token;
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

/** The "PTN Connext" folder in this teacher's Drive (made once, made again if they deleted it). */
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
    body: JSON.stringify({ name: DRIVE_FOLDER_NAME, mimeType: "application/vnd.google-apps.folder" }),
  });
  await db.from("drive_connections").update({ folder_id: made.id, updated_at: new Date().toISOString() }).eq("user_id", userId);
  return made.id;
}

/**
 * Opens an upload into the teacher's "PTN Connext" folder and returns its one-time address. The browser then
 * sends the PDF straight to Google (our server never carries the file). `origin` lets Google accept it.
 */
export async function startUpload(userId: string, name: string, size: number, origin: string): Promise<string> {
  const token = await accessTokenFor(userId);
  const folder = await ensureFolder(userId, token);
  const res = await fetch(`${UPLOAD}?uploadType=resumable&fields=id`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json; charset=UTF-8",
      "x-upload-content-type": "application/pdf",
      "x-upload-content-length": String(size),
      origin,
    },
    body: JSON.stringify({ name, mimeType: "application/pdf", parents: [folder] }),
  });
  const location = res.headers.get("location");
  if (!res.ok || !location) throw new DriveError(res.status, googleReason(await res.json().catch(() => ({}))));
  return location;
}

/** The uploaded file must be this teacher's, a PDF, not in the trash, and not too big. */
export async function checkUploaded(userId: string, fileId: string, token?: string) {
  if (!isDriveFileId(fileId)) throw new DriveError(404);
  const t = token ?? (await accessTokenFor(userId));
  const f = await drive<{ mimeType?: string; size?: string; trashed?: boolean; name?: string }>(
    t,
    `${API}/files/${fileId}?fields=id,name,mimeType,size,trashed`,
  );
  if (f.trashed || f.mimeType !== "application/pdf") throw new DriveError(404);
  const size = Number(f.size ?? 0);
  if (!size || size > DRIVE_MAX_BYTES) throw new DriveError(400, "too-big");
  return { name: f.name ?? "", size, token: t };
}

/** "Anyone with the link can view", so every student can open it without a Google account. */
export async function shareWithLink(token: string, fileId: string) {
  await drive(token, `${API}/files/${fileId}/permissions?fields=id`, {
    method: "POST",
    body: JSON.stringify({ role: "reader", type: "anyone" }),
  });
}

/**
 * Stops sharing a Drive PDF and moves it to its owner's Drive trash (they can still restore it for 30 days).
 * Sharing is switched off first because Google keeps a trashed file open to anyone with the link until
 * the trash is emptied. Returns false when it couldn't (owner disconnected, Google down); never throws.
 */
export async function trashDriveFile(ownerId: string | null, fileId: string): Promise<boolean> {
  if (!ownerId || !isDriveFileId(fileId) || !driveConfigured()) return false;
  try {
    const token = await accessTokenFor(ownerId);
    await drive(token, `${API}/files/${fileId}/permissions/anyoneWithLink`, { method: "DELETE" }).catch((e) => {
      if (!(e instanceof DriveError && e.status === 404)) throw e; // already not shared
    });
    await drive(token, `${API}/files/${fileId}?fields=id`, { method: "PATCH", body: JSON.stringify({ trashed: true }) });
    return true;
  } catch (e) {
    if (e instanceof DriveError && e.status === 404) return true; // already gone
    await logError("drive/trash", e);
    return false;
  }
}
