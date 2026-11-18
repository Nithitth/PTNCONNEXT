import type { Metadata } from "next";
import { Calculator, Target } from "lucide-react";
import { AdminBack } from "@/components/admin/AdminBack";
import { AssumptionsEditor, OkrEditor, ResetReportSettings } from "@/components/admin/report/ReportSettings";
import { Container, PageHeader } from "@/components/ui";
import { requireProfile } from "@/lib/auth";
import { DEFAULT_ASSUMPTIONS, DEFAULT_OKRS, cleanAssumptions, cleanOkrs } from "@/lib/report";
import { createAdminClient } from "@/lib/supabase/admin";

export const metadata: Metadata = { title: "แก้ไข OKR และสมมติฐาน · คอนโซลผู้พัฒนา" };

/** Edit the report's OKRs and the assumptions behind the impact estimates (saved in app_settings). */
export default async function ReportSettingsPage() {
  await requireProfile({ roles: ["admin"] });
  const { data } = await createAdminClient().from("app_settings").select("key, value").in("key", ["report_okrs", "report_assumptions"]);
  const get = (k: string) => (data ?? []).find((r) => r.key === k)?.value;
  const okrs = cleanOkrs(get("report_okrs"));
  const assumptions = cleanAssumptions(get("report_assumptions"));

  return (
    <Container className="py-10">
      <AdminBack parent={{ href: "/admin/report", label: "รายงาน & OKR" }} />
      <PageHeader eyebrow="รายงาน & OKR" title="แก้ไข OKR และสมมติฐาน" subtitle="ทุกผลลัพธ์หลักเชื่อมกับตัวชี้วัดจริงในระบบ ตัวเลขในรายงานจึงอัปเดตเองเสมอ">
        <ResetReportSettings />
      </PageHeader>
      <h2 className="mb-3 flex items-center gap-2 font-display text-xl font-bold text-ink">
        <Target aria-hidden className="h-5 w-5 text-brand" />
        OKR
      </h2>
      <OkrEditor initial={"okrs" in okrs ? okrs.okrs : DEFAULT_OKRS} />
      <h2 className="mb-3 mt-10 flex items-center gap-2 font-display text-xl font-bold text-ink">
        <Calculator aria-hidden className="h-5 w-5 text-brand" />
        สมมติฐานของการประมาณการ
      </h2>
      <div className="rounded-2xl border border-line bg-surface p-5 shadow-soft-sm">
        <AssumptionsEditor initial={"assumptions" in assumptions ? assumptions.assumptions : DEFAULT_ASSUMPTIONS} />
      </div>
    </Container>
  );
}
