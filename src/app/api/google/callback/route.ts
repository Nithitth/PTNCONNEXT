import { NextResponse, type NextRequest } from "next/server";
import { requireProfile } from "@/lib/auth";
import { checkConnectState, finishConnect } from "@/lib/drive";
import { SCHOOL_DRIVE_PAGE } from "@/lib/driveCore";
import { logAudit, logError } from "@/lib/logs";

/**
 * Google sends people back here after its permission page. We check it really is the trip we started
 * (one-time cookie), save the connection, and show the result: teachers get the big friendly page
 * (/teacher/drive); the school connection (admins) goes back to /admin/drive to pick the Shared Drive.
 */
export async function GET(request: NextRequest) {
  const profile = await requireProfile({ roles: ["teacher", "admin"] });
  const q = request.nextUrl.searchParams;
  const next = await checkConnectState(profile.id, q.get("state") ?? "");
  const school = next === SCHOOL_DRIVE_PAGE;
  const show = (status: string, back = "/teacher") =>
    NextResponse.redirect(
      new URL(school ? `${SCHOOL_DRIVE_PAGE}?status=${status}` : `/teacher/drive?status=${status}&next=${encodeURIComponent(back)}`, request.url),
    );

  if (!next) return show("expired");
  if (school && profile.role !== "admin") return show("failed");
  if (q.get("error")) return show("cancelled", next); // "ยกเลิก" was pressed at Google
  const code = q.get("code");
  if (!code) return show("failed", next);
  try {
    const result = await finishConnect(profile.id, request.nextUrl.origin, code, school ? { name: profile.display_name } : null);
    if (result === "ok") await logAudit(profile.id, school ? "school-drive-connect" : "drive-connect");
    return show(result, next);
  } catch (e) {
    await logError("api/google/callback", e);
    return show("failed", next);
  }
}
