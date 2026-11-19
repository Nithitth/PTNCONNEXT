import "server-only";
import { unstable_cache } from "next/cache";
import { loadReport } from "@/lib/reportData";

// The war room refreshes itself every 5 minutes on a big screen. Caching the report for 5 minutes keeps that
// to about 12 full loads an hour per screen instead of 60 (Supabase's free plan counts every download).
// Cached code can't read cookies: loadReport uses the admin client, so callers must check the admin first.
// Saving OKRs or assumptions clears the tag (report/actions.ts).

export const REPORT_CACHE_TAG = "report";

export const loadReportCached = unstable_cache(loadReport, ["report-bundle-v1"], { tags: [REPORT_CACHE_TAG], revalidate: 300 });
