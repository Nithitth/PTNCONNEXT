import "server-only";
import { requireProfile } from "@/lib/auth";
import { previousRange, resolveRange, type Lang } from "@/lib/report";
import { loadReport } from "@/lib/reportData";
import { buildView } from "@/lib/reportView";

/** The report for this URL (`?preset=` or `?from=&to=`, `?lang=en`). Admins only. */
export async function reportFor(sp: Record<string, string | string[] | undefined>) {
  await requireProfile({ roles: ["admin"] });
  const one = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : undefined);
  const range = resolveRange({ preset: one("preset"), from: one("from"), to: one("to") });
  const lang: Lang = one("lang") === "en" ? "en" : "th";
  const bundle = await loadReport(range, previousRange(range));
  return { view: buildView(bundle, range, lang), bundle };
}
