import { NextResponse, type NextRequest } from "next/server";
import { getCurrentProfile, needsPdpa } from "@/lib/auth";
import { logError } from "@/lib/logs";
import { MATERIALS_BUCKET, isUuid } from "@/lib/postForm";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

/**
 * Opens an uploaded PDF. The attachment is looked up as the signed-in user,
 * so RLS only finds it if they may see the post. Then the server makes a
 * signed link that works for one minute and sends the browser there.
 * Add ?download=1 to save the file instead of opening it.
 */
export async function GET(request: NextRequest, ctx: RouteContext<"/files/[id]">) {
  const { id } = await ctx.params;
  const profile = await getCurrentProfile();
  if (!profile) return NextResponse.redirect(new URL("/login", request.url));
  if (needsPdpa(profile)) return NextResponse.redirect(new URL("/pdpa", request.url));
  if (!isUuid(id)) return text("ไม่พบไฟล์ หรือคุณไม่มีสิทธิ์เปิดไฟล์นี้", 404);

  try {
    const supabase = await createClient();
    const { data } = await supabase
      .from("attachments")
      .select("kind, url, storage_path, file_name")
      .eq("id", id)
      .maybeSingle();
    if (!data) return text("ไม่พบไฟล์ หรือคุณไม่มีสิทธิ์เปิดไฟล์นี้", 404);
    if (data.kind === "link") return NextResponse.redirect(data.url as string);

    const download = request.nextUrl.searchParams.has("download") ? (data.file_name as string) : false;
    const { data: signed, error } = await createAdminClient()
      .storage.from(MATERIALS_BUCKET)
      .createSignedUrl(data.storage_path as string, 60, { download });
    if (error || !signed) throw error ?? new Error("no signed url");
    return NextResponse.redirect(signed.signedUrl);
  } catch (e) {
    await logError("files/[id]", e);
    return text("เปิดไฟล์ไม่สำเร็จ ลองอีกครั้ง", 500);
  }
}

const text = (message: string, status: number) =>
  new NextResponse(message, { status, headers: { "content-type": "text/plain; charset=utf-8" } });
