import { test } from "node:test";
import assert from "node:assert/strict";
import { driveProblem, driveViewUrl, googleReason, isDriveFileId, safeNext } from "./driveCore";
import { decryptToken, encryptToken } from "./driveCrypto";

const SECRET = "a-long-test-secret-for-drive-keys";

test("Google keys are stored encrypted and only the right secret reads them back", () => {
  const stored = encryptToken("1//refresh-token-example", SECRET);
  assert.ok(stored.startsWith("v1."));
  assert.ok(!stored.includes("refresh-token-example"));
  assert.equal(decryptToken(stored, SECRET), "1//refresh-token-example");
  assert.equal(decryptToken(stored, "another-secret-of-enough-length"), null);
  // Each encryption is different (random IV), and a changed letter is refused.
  assert.notEqual(encryptToken("same", SECRET), encryptToken("same", SECRET));
  const tampered = stored.slice(0, -2) + (stored.endsWith("A") ? "BB" : "AA");
  assert.equal(decryptToken(tampered, SECRET), null);
  assert.equal(decryptToken("garbage", SECRET), null);
  assert.throws(() => encryptToken("x", "short"));
});

test("Drive file ids and links", () => {
  assert.equal(isDriveFileId("1AbC-dEf_GhIjKlMnOpQrStUvWxYz012345"), true);
  assert.equal(isDriveFileId("short"), false);
  assert.equal(isDriveFileId("../../etc/passwd-but-long-enough-xx"), false);
  assert.equal(driveViewUrl("1AbC-dEf_GhIjKlMnOpQrStUvWxYz012345"), "https://drive.google.com/file/d/1AbC-dEf_GhIjKlMnOpQrStUvWxYz012345/view");
});

test("after connecting, people only go back to our own teacher or account pages", () => {
  assert.equal(safeNext("/teacher?tab=material"), "/teacher?tab=material");
  assert.equal(safeNext("/account"), "/account");
  assert.equal(safeNext("https://evil.example"), "/teacher");
  assert.equal(safeNext("//evil.example"), "/teacher");
  assert.equal(safeNext("/teacherx"), "/teacher");
  assert.equal(safeNext(null), "/teacher");
});

test("Google errors become a Thai sentence a teacher can act on", () => {
  assert.match(driveProblem(403, "storageQuotaExceeded"), /เต็ม/);
  assert.match(driveProblem(400, "invalid_grant"), /เชื่อมต่อ Google Drive/);
  assert.match(driveProblem(401), /หมดอายุ/);
  assert.match(driveProblem(0), /อินเทอร์เน็ต/);
  assert.match(driveProblem(500), /ขัดข้อง/);
  assert.equal(googleReason({ error: { errors: [{ reason: "storageQuotaExceeded" }] } }), "storageQuotaExceeded");
  assert.equal(googleReason({ error: "invalid_grant" }), "invalid_grant");
  assert.equal(googleReason("nope"), "");
});
