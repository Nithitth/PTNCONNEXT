import "server-only";
import { requireProfile } from "@/lib/auth";
import type { MetricNow } from "@/components/admin/report/MetricPicker";
import { METRICS, previousRange, resolveRange, type Lang } from "@/lib/report";
import { computeStats } from "@/lib/reportAnalysis";
import { weeklySeries } from "@/lib/reportCompare";
import { loadReport } from "@/lib/reportData";
import { buildView } from "@/lib/reportView";

/** The report for this URL (`?preset=` or `?from=&to=`, `?lang=en`). Admins only. */
export async function reportFor(sp: Record<string, string | string[] | undefined>) {
  await requireProfile({ roles: ["admin"], feature: "report" });
  const one = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : undefined);
  const range = resolveRange({ preset: one("preset"), from: one("from"), to: one("to") });
  const lang: Lang = one("lang") === "en" ? "en" : "th";
  const bundle = await loadReport(range, previousRange(range));
  return { view: buildView(bundle, range, lang), bundle };
}

/** Every goal's value this term and its last 8 weeks, for the goal picker (OKR settings). */
export async function metricsNow(): Promise<MetricNow> {
  const range = resolveRange({ preset: "term" });
  const bundle = await loadReport(range, previousRange(range));
  const stats = computeStats(bundle.current, bundle.assumptions);
  const series = weeklySeries(
    bundle.current,
    METRICS.map((m) => m.key),
    bundle.assumptions,
    stats,
  );
  return Object.fromEntries(METRICS.map((m) => [m.key, { value: m.value(stats), spark: (series[m.key] ?? []).slice(-8).map((p) => p.value) }]));
}
