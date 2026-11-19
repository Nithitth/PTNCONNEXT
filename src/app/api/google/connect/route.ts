import { NextResponse, type NextRequest } from "next/server";
import { requireProfile } from "@/lib/auth";
import { driveConfigured, startConnect } from "@/lib/drive";
import { SCHOOL_DRIVE_PAGE, safeNext } from "@/lib/driveCore";

/**
 * Sends someone to Google's permission page. Opened by a normal link (not a form, the CSP only allows our own
 * form targets). Google comes back to /api/google/callback.
 * • "เชื่อมต่อ Google Drive" (teachers): their own Drive, files this app makes only.
 * • `?school=1` "เชื่อมต่อ Drive ของโรงเรียน" (admins only): the school's Shared Drive, back to /admin/drive.
 */
export async function GET(request: NextRequest) {
  const school = request.nextUrl.searchParams.get("school") === "1";
  const profile = await requireProfile({ roles: school ? ["admin"] : ["teacher", "admin"] });
  const next = school ? SCHOOL_DRIVE_PAGE : safeNext(request.nextUrl.searchParams.get("next"));
  if (!driveConfigured()) {
    const off = school ? `${SCHOOL_DRIVE_PAGE}?status=off` : `/teacher/drive?status=off&next=${encodeURIComponent(next)}`;
    return NextResponse.redirect(new URL(off, request.url));
  }
  return NextResponse.redirect(await startConnect(profile.id, request.nextUrl.origin, next, school));
}
