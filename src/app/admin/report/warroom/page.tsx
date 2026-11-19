import type { Metadata } from "next";
import { WarRoom } from "@/components/admin/report/WarRoom";
import { requireProfile } from "@/lib/auth";
import { schoolDriveStatus } from "@/lib/drive";
import { previousRange, resolveRange } from "@/lib/report";
import { loadReportCached } from "@/lib/reportCache";
import { buildView } from "@/lib/reportView";
import { createAdminClient } from "@/lib/supabase/admin";
import { EMPTY_LIVE, type Live } from "@/lib/warroom";

export const metadata: Metadata = { title: "ห้องบัญชาการ · รายงาน & OKR" };

/**
 * ห้องบัญชาการ (war room): the report as a live dark display for a big screen. Counts only, no names.
 * The report itself is cached for 5 minutes (reportCache.ts); the live strip polls every minute.
 */
export default async function WarRoomPage({ searchParams }: PageProps<"/admin/report/warroom">) {
  await requireProfile({ roles: ["admin"], feature: "report" });
  const sp = await searchParams;
  const range = resolveRange({ preset: typeof sp.preset === "string" ? sp.preset : "term" });
  const [bundle, live, drive] = await Promise.all([
    loadReportCached(range, previousRange(range)),
    createAdminClient().rpc("report_live"),
    schoolDriveStatus(),
  ]);
  const view = buildView(bundle, range, "th");
  return (
    <WarRoom
      v={view}
      initialLive={live.error || !live.data ? EMPTY_LIVE : (live.data as Live)}
      preset={range.preset}
      lockouts={bundle.current.lockouts ?? 0}
      schoolDriveBroken={drive.state === "broken"}
      generatedAt={new Date().toISOString()}
    />
  );
}
