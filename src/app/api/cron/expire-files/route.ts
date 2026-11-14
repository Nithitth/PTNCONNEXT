import { NextResponse, type NextRequest } from "next/server";
import { logError } from "@/lib/logs";
import { MATERIALS_BUCKET } from "@/lib/postForm";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Daily clean-up (Vercel Cron, see vercel.json): deletes teachers' PDFs whose 180 days are over
 * (migration 0014). The attachment row stays with expired_at set, so the post can say "ไฟล์หมดอายุแล้ว".
 * Downloads are already blocked by /files/[id] the moment a file expires; this frees the storage.
 * Vercel calls it with "Authorization: Bearer <CRON_SECRET>"; anything else gets 401.
 */
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("attachments")
      .select("id, storage_path")
      .eq("kind", "file")
      .is("expired_at", null)
      .lte("expires_at", new Date().toISOString())
      .limit(500);
    if (error) throw error;
    const rows = (data ?? []) as { id: string; storage_path: string | null }[];
    if (rows.length === 0) return NextResponse.json({ deleted: 0 });

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
    return NextResponse.json({ deleted: rows.length });
  } catch (e) {
    await logError("cron/expire-files", e);
    return NextResponse.json({ error: "failed" }, { status: 500 });
  }
}
