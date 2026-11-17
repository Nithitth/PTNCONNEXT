import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

// Google's long-lived key for each teacher is stored encrypted (AES-256-GCM). The encryption key comes from
// GOOGLE_TOKEN_SECRET, which lives only in the server's environment, so a copy of the database alone is
// useless. Changing the secret disconnects every teacher (they press "เชื่อมต่อ Google Drive" again).

const keyFrom = (secret: string) => createHash("sha256").update(`ptn-drive:${secret}`).digest();

/** "v1.<iv>.<tag>.<data>" in base64url. */
export function encryptToken(plain: string, secret: string): string {
  if (secret.length < 16) throw new Error("GOOGLE_TOKEN_SECRET is too short");
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", keyFrom(secret), iv);
  const data = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return ["v1", iv, cipher.getAuthTag(), data].map((p) => (typeof p === "string" ? p : p.toString("base64url"))).join(".");
}

/** The stored key, or null when it can't be read (wrong secret, tampered, old format). */
export function decryptToken(stored: string, secret: string): string | null {
  const [v, iv, tag, data] = String(stored ?? "").split(".");
  if (v !== "v1" || !iv || !tag || !data) return null;
  try {
    const decipher = createDecipheriv("aes-256-gcm", keyFrom(secret), Buffer.from(iv, "base64url"));
    decipher.setAuthTag(Buffer.from(tag, "base64url"));
    return Buffer.concat([decipher.update(Buffer.from(data, "base64url")), decipher.final()]).toString("utf8");
  } catch {
    return null;
  }
}
