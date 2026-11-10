import type { Metadata } from "next";
import { AdminNav } from "@/components/admin/AdminNav";
import { TcasUniversityCard, type StagingSummary } from "@/components/admin/TcasUniversityCard";
import { Container, Notice, PageHeader } from "@/components/ui";
import { requireProfile } from "@/lib/auth";
import { formatDateTime } from "@/lib/calendar";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { TCAS_UNIVERSITIES, type Round3Row } from "@/lib/tcas";
import { diffPrograms } from "@/lib/tcasSource";

export const metadata: Metadata = { title: "ข้อมูล TCAS" };
// Pulling a big university (~300 programs) takes a while.
export const maxDuration = 300;

type LiveRow = { program_id: string; university_id: string; name_th: string; faculty: string; fingerprint: string | null };
type StagedRow = {
  university_id: string;
  program_id: string;
  pulled_at: string;
  fp: string;
  name: string;
  faculty: string;
  round3: Round3Row[] | null;
};
type PublishRow = {
  university_id: string;
  added: number;
  changed: number;
  removed: number;
  published_at: string;
  publisher: { display_name: string } | null;
};

const label = (name: string, faculty: string) => (faculty ? `${name} · ${faculty}` : name);

/** Developer Console: pull TCAS data per university, review what changed, publish. */
export default async function TcasDataPage() {
  await requireProfile({ roles: ["admin"] });
  const supabase = await createClient();
  const [live, staged, publishes] = await Promise.all([
    supabase.from("tcas_programs").select("program_id, university_id, name_th, faculty, fingerprint").eq("active", true).limit(5000),
    // Staging has no RLS policies (service key only); this page is admin-only.
    createAdminClient()
      .from("tcas_staging")
      .select("university_id, program_id, pulled_at, fp:payload->>fingerprint, name:payload->program->>name_th, faculty:payload->program->>faculty, round3:payload->round3")
      .limit(5000),
    supabase
      .from("tcas_publishes")
      .select("university_id, added, changed, removed, published_at, publisher:profiles(display_name)")
      .order("published_at", { ascending: false })
      .limit(50),
  ]);
  if (live.error) throw live.error;
  if (staged.error) throw staged.error;
  if (publishes.error) throw publishes.error;

  const liveRows = (live.data ?? []) as LiveRow[];
  const stagedRows = (staged.data ?? []) as unknown as StagedRow[];
  const publishRows = (publishes.data ?? []) as unknown as PublishRow[];

  const cards = TCAS_UNIVERSITIES.map((u) => {
    const liveHere = liveRows.filter((r) => r.university_id === u.id);
    const stagedHere = stagedRows.filter((r) => r.university_id === u.id);
    const last = publishRows.find((p) => p.university_id === u.id);

    let staging: StagingSummary | null = null;
    if (stagedHere.length > 0) {
      const names = new Map<string, string>();
      for (const r of liveHere) names.set(r.program_id, label(r.name_th, r.faculty));
      for (const r of stagedHere) names.set(r.program_id, label(r.name, r.faculty));
      const diff = diffPrograms(
        new Map(liveHere.map((r) => [r.program_id, r.fingerprint ?? ""])),
        new Map(stagedHere.map((r) => [r.program_id, r.fp])),
      );
      const nameOf = (id: string) => names.get(id) ?? id;
      staging = {
        count: stagedHere.length,
        pulledAt: formatDateTime(stagedHere[0].pulled_at),
        added: diff.added.map(nameOf),
        changed: diff.changed.map(nameOf),
        removed: diff.removed.map(nameOf),
        problems: stagedHere.flatMap((r) =>
          (r.round3 ?? [])
            .filter((o) => o.problem)
            .slice(0, 1)
            .map((o) => ({ name: label(r.name, r.faculty), reason: o.problem! })),
        ),
      };
    }

    return {
      ...u,
      liveCount: liveHere.length,
      lastPublish: last
        ? {
            at: formatDateTime(last.published_at),
            by: last.publisher?.display_name ?? null,
            added: last.added,
            changed: last.changed,
            removed: last.removed,
          }
        : null,
      staging,
    };
  });

  return (
    <Container className="py-10">
      <PageHeader eyebrow="ผู้ดูแลระบบ" title="ข้อมูล TCAS" subtitle="หลักสูตรและเกณฑ์รับสมัครรอบ 1 และรอบ 3 สำหรับ TCASter" />
      <AdminNav />
      <div className="mb-5">
        <Notice tone="info">ข้อมูลจาก mytcas.com (ทปอ.) — ดึงทีละมหาวิทยาลัย ตรวจรายการด้านล่างก่อนกดเผยแพร่</Notice>
      </div>
      <div className="space-y-4">
        {cards.map((c) => (
          <TcasUniversityCard
            key={c.id}
            id={c.id}
            name={c.name}
            liveCount={c.liveCount}
            lastPublish={c.lastPublish}
            staging={c.staging}
          />
        ))}
      </div>
    </Container>
  );
}
