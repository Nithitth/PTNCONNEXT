import { NextResponse, type NextRequest } from "next/server";
import { getCurrentProfile, needsPdpa } from "@/lib/auth";
import { logError } from "@/lib/logs";
import { PROOF_BUCKET } from "@/lib/roadmapLevels";
import { createClient } from "@/lib/supabase/server";

/**
 * Opens one of the user's own proof files (or links). The proof row is read as the signed-in
 * user, so RLS only finds their own; the file then opens through a one-minute signed link.
 */
export async function GET(request: NextRequest, ctx: RouteContext<"/roadmap/proof/[id]">) {
  const { id } = await ctx.params;
  const profile = await getCurrentProfile();
  if (!profile) return NextResponse.redirect(new URL("/login", request.url));
  if (needsPdpa(profile)) return NextResponse.redirect(new URL("/pdpa", request.url));
  if (!/^\d{1,18}$/.test(id)) return text("ไม่พบหลักฐาน", 404);

  try {
    const supabase = await createClient();
    const { data } = await supabase.from("tcas_roadmap_proofs").select("file_path, url").eq("id", id).maybeSingle();
    if (!data) return text("ไม่พบหลักฐาน", 404);
    if (data.url) return NextResponse.redirect(data.url as string);
    if (!data.file_path) return text("ไม่พบหลักฐาน", 404);
    const { data: signed, error } = await supabase.storage.from(PROOF_BUCKET).createSignedUrl(data.file_path as string, 60);
    if (error || !signed) throw error ?? new Error("no signed url");
    return NextResponse.redirect(signed.signedUrl);
  } catch (e) {
    await logError("roadmap/proof", e);
    return text("เปิดหลักฐานไม่สำเร็จ ลองอีกครั้ง", 500);
  }
}

const text = (message: string, status: number) =>
  new NextResponse(message, { status, headers: { "content-type": "text/plain; charset=utf-8" } });
