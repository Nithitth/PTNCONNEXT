import type { Metadata } from "next";
import { AdminNav } from "@/components/admin/AdminNav";
import { RoadmapTemplatesAdmin, type AdminTemplate } from "@/components/admin/RoadmapTemplatesAdmin";
import { Container, PageHeader } from "@/components/ui";
import { requireProfile } from "@/lib/auth";
import { isTerm } from "@/lib/roadmap";
import { loadKeyDates } from "@/lib/roadmapData";
import { createClient } from "@/lib/supabase/server";
import { loadGroupFields } from "@/lib/tcasData";

export const metadata: Metadata = { title: "แม่แบบ Roadmap · คอนโซลผู้พัฒนา" };

/** Developer Console → แม่แบบ Roadmap: suggested quests per field group, and TCAS key dates. */
export default async function AdminRoadmapPage() {
  await requireProfile({ roles: ["admin"] });
  const supabase = await createClient();
  const [{ data, error }, groups, keyDates] = await Promise.all([
    supabase.from("tcas_roadmap_templates").select("id, group_field, term, title, detail, xp, approved").order("group_field").order("id"),
    loadGroupFields(),
    loadKeyDates(supabase),
  ]);
  if (error) throw error;
  const templates: AdminTemplate[] = (data ?? [])
    .filter((t) => isTerm(t.term))
    .map((t) => ({
      id: Number(t.id),
      groupField: t.group_field,
      term: t.term,
      title: t.title,
      detail: t.detail,
      xp: t.xp,
      approved: t.approved,
    }));

  return (
    <Container className="py-10">
      <PageHeader
        eyebrow="ผู้ดูแลระบบ"
        title="แม่แบบ Roadmap"
        subtitle="ภารกิจแนะนำตามกลุ่มสาขาที่ทีมเขียนและครูแนะแนวตรวจ และวันสำคัญ TCAS สำหรับกล่องนับถอยหลัง"
      />
      <AdminNav />
      <RoadmapTemplatesAdmin templates={templates} groups={groups} keyDates={keyDates} />
    </Container>
  );
}
