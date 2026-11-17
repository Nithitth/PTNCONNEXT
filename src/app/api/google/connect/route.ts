import { NextResponse, type NextRequest } from "next/server";
import { requireProfile } from "@/lib/auth";
import { driveConfigured, startConnect } from "@/lib/drive";
import { safeNext } from "@/lib/driveCore";

/**
 * "เชื่อมต่อ Google Drive": sends a teacher to Google's permission page. Opened by a normal link (not a form,
 * the CSP only allows our own form targets). Google comes back to /api/google/callback.
 */
export async function GET(request: NextRequest) {
  const profile = await requireProfile({ roles: ["teacher", "admin"] });
  const next = safeNext(request.nextUrl.searchParams.get("next"));
  if (!driveConfigured()) {
    return NextResponse.redirect(new URL(`/teacher/drive?status=off&next=${encodeURIComponent(next)}`, request.url));
  }
  return NextResponse.redirect(await startConnect(profile.id, request.nextUrl.origin, next));
}
