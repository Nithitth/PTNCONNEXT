import { NextResponse, type NextRequest } from "next/server";
import { requireProfile } from "@/lib/auth";
import { checkConnectState, finishConnect } from "@/lib/drive";
import { logAudit, logError } from "@/lib/logs";

/**
 * Google sends the teacher back here after its permission page. We check it really is the trip we started
 * (one-time cookie), save the connection, and show a big, friendly result page (/teacher/drive).
 */
export async function GET(request: NextRequest) {
  const profile = await requireProfile({ roles: ["teacher", "admin"] });
  const q = request.nextUrl.searchParams;
  const next = await checkConnectState(profile.id, q.get("state") ?? "");
  const show = (status: string, back = "/teacher") =>
    NextResponse.redirect(new URL(`/teacher/drive?status=${status}&next=${encodeURIComponent(back)}`, request.url));

  if (!next) return show("expired");
  if (q.get("error")) return show("cancelled", next); // the teacher pressed "ยกเลิก" at Google
  const code = q.get("code");
  if (!code) return show("failed", next);
  try {
    const result = await finishConnect(profile.id, request.nextUrl.origin, code);
    if (result === "ok") await logAudit(profile.id, "drive-connect");
    return show(result, next);
  } catch (e) {
    await logError("api/google/callback", e);
    return show("failed", next);
  }
}
