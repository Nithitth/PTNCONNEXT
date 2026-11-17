import { NextResponse, type NextRequest } from "next/server";
import { trashDriveFile } from "@/lib/drive";
import { logError } from "@/lib/logs";
import { MATERIALS_BUCKET } from "@/lib/postForm";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Daily clean-up (Vercel Cron, see vercel.json): deletes teachers' PDFs whose 180 days are over
 * (migration 0014). The attachment row stays with expired_at set, so the post can say "ไฟล์หมดอายุแล้ว".
 * Downloads are already blocked by /files/[id] the moment a file expires; this frees the storage.
 * It also deletes log rows older than a year (log-ins, unlocks, sign-up events, admin actions), so we
 * keep personal data only as long as needed (PDPA).
 * Vercel calls it with "Authorization: Bearer <CRON_SECRET>"; anything else gets 401.
 */
const LOG_TABLES = ["login_events", "login_unlocks", "signup_events", "audit_events"];
const LOG_DAYS = 365;
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    const admin = createAdminClient();
    const oldLogs = new Date(Date.now() - LOG_DAYS * 86_400_000).toISOString();
    for (const table of LOG_TABLES) {
      const { error: logsError } = await admin.from(table).delete().lt("created_at", oldLogs);
      if (logsError) await logError(`cron/expire-logs/${table}`, logsError);
    }
    const now = new Date().toISOString();

    // PDFs kept in teachers' own Google Drive (migration 0019): move each to its owner's Drive trash.
    // If the teacher disconnected, Connext still blocks the link (/files/[id] returns 410), and the file
    // simply stays in their Drive.
    const { data: driveData, error: driveError } = await admin
      .from("attachments")
      .select("id, drive_file_id, drive_owner_id")
      .not("drive_file_id", "is", null)
      .is("expired_at", null)
      .lte("expires_at", now)
      .limit(200);
    if (driveError) throw driveError;
    let trashed = 0;
    for (const r of (driveData ?? []) as { id: string; drive_file_id: string; drive_owner_id: string | null }[]) {
      if (await trashDriveFile(r.drive_owner_id, r.drive_file_id)) trashed++;
      const { error: markError } = await admin.from("attachments").update({ expired_at: new Date().toISOString() }).eq("id", r.id);
      if (markError) await logError("cron/expire-files/drive", markError);
    }

    const { data, error } = await admin
      .from("attachments")
      .select("id, storage_path")
      .eq("kind", "file")
      .is("expired_at", null)
      .lte("expires_at", now)
      .limit(500);
    if (error) throw error;
    const rows = (data ?? []) as { id: string; storage_path: string | null }[];
    if (rows.length === 0) return NextResponse.json({ deleted: 0, driveExpired: driveData?.length ?? 0, driveTrashed: trashed });

    const paths = rows.flatMap((r) => (r.storage_path ? [r.storage_path] : []));
    if (paths.length) {
      const { error: removeError } = await admin.storage.from(MATERIALS_BUCKET).remove(paths);
      if (removeError) throw removeError;
    }
    const { error: updateError } = await admin
      .from("attachments")
      .update({ expired_at: new Date().toISOString(), storage_path: null })
      .in(
        "id",
        rows.map((r) => r.id),
      );
    if (updateError) throw updateError;
    return NextResponse.json({ deleted: rows.length, driveExpired: driveData?.length ?? 0, driveTrashed: trashed });
  } catch (e) {
    await logError("cron/expire-files", e);
    return NextResponse.json({ error: "failed" }, { status: 500 });
  }
}
