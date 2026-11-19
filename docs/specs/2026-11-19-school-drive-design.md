# Drive ของโรงเรียน — teachers' PDFs in the school's Shared Drive

Approved with the team on 2026-11-19 (walkthrough of "option 1").

## Why
Teachers who aren't comfortable with technology shouldn't have to connect anything. PDFs should belong to the school (not to a teacher who might leave), and the school's Google Workspace storage removes our free-plan limits (1 GB storage, 5 GB downloads a month). The school's Workspace also lets the Google Cloud app be **Internal**, so no Google verification is needed.

## Decided
- **One school Shared Drive** holds every teacher PDF. An admin connects it **once** in the Developer Console (Google sign-in with a school account, then pick the Shared Drive). Teachers connect nothing.
- **Sharing stays "anyone with the link can view"**: most students have no school Google account.
- **The school drive replaces per-teacher Drives** when it's connected (teacher banners/offers disappear). Per-teacher Drive still works when no school drive is connected (schools without Workspace). PDFs already in teachers' own Drives keep working until they expire.
- **Folders for humans:** `<Shared Drive> / 2569 ภาค 2 / คณิตศาสตร์ / ม.5-1 · ใบงานบทที่ 3.pdf`.
- **After 180 days:** the link is switched off and the file moves to a **หมดอายุ** folder in the Shared Drive (kept as the school's archive).
- **Deleting a post / replacing its PDF:** link off, file to the Shared Drive's trash (restorable for 30 days).
- **Safety net:** if Google fails, "เก็บในระบบ Connext แทน" still saves the PDF in Connext.
- **If the connection breaks** (account removed, key revoked): old links keep working; new uploads fall back; the admin menu's alert strip says so; any Manager of the Shared Drive reconnects.

## How (builder's calls)
- **No migration.** The connection lives in `app_settings` (`school_drive`, server-only): encrypted refresh token (`encryptToken`, `GOOGLE_TOKEN_SECRET`), Shared Drive id/name, who connected, `broken` flag. Attachment rows keep using `drive_file_id`/`drive_owner_id` (owner = the teacher who posted). Whether a file is in the school drive is asked from Google (`driveId` of the file), so no new column is needed.
- **Same OAuth client and callback** (`/api/google/connect?school=1` → `/api/google/callback`), so no new redirect URI. The school connection asks for the full `drive` scope (needed to list Shared Drives and write into one); fine because the app is Internal and the key is encrypted. Per-teacher mode keeps `drive.file`.
- **Ownership check:** every school upload carries `appProperties.connextUser = <teacher id>`; saving or discarding a school file checks it (a teacher can't attach or trash a colleague's file by id) and that the file's `driveId` is the school drive.
- All Drive API calls send `supportsAllDrives=true`.
- **Pure rules** (tested): term folder name from a date, file name from rooms + title, safe names.
- **Admin page** `/admin/drive` + a box in the menu's ระบบ group, alert item when broken.
- **PDPA/privacy text** updated (school Shared Drive, 180-day link closing); `PDPA_VERSION` 7.

## Not now
A "robot" service account (option 2) — can replace the sign-in later without moving files. Moving PDFs already stored in Connext into the Shared Drive.
