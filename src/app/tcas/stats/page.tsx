import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, BarChart3, ShieldCheck } from "lucide-react";
import { Card, Container, EmptyState, PageHeader } from "@/components/ui";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "สถิติเป้าหมาย · TCAS" };

type Row = { group_field: string; faculty: string; university_name: string; grade: number | null; students: number };

function sumBy(rows: Row[], key: (r: Row) => string) {
  const m = new Map<string, number>();
  for (const r of rows) m.set(key(r), (m.get(key(r)) ?? 0) + r.students);
  return [...m].sort((a, b) => b[1] - a[1]);
}

/** One measure, one hue: a horizontal bar per category with its count written beside it. */
function BarList({ title, data }: { title: string; data: [string, number][] }) {
  const max = Math.max(...data.map(([, n]) => n), 1);
  return (
    <Card>
      <h2 className="mb-4 font-display text-lg font-bold text-ink">{title}</h2>
      <ul className="space-y-3">
        {data.map(([label, n]) => (
          <li key={label} title={`${label}: ${n.toLocaleString("th-TH")}`}>
            <div className="mb-1 flex items-baseline justify-between gap-3 text-sm">
              <span className="min-w-0 text-ink">{label}</span>
              <span className="shrink-0 font-bold tabular-nums text-ink">{n.toLocaleString("th-TH")}</span>
            </div>
            <div className="h-2 rounded-full bg-sunken" aria-hidden>
              <div className="h-2 rounded-full bg-brand" style={{ width: `${(n / max) * 100}%` }} />
            </div>
          </li>
        ))}
      </ul>
    </Card>
  );
}

/** Anonymous totals of students' TCAS targets, for teachers and admins. */
export default async function TcasStatsPage() {
  await requireProfile({ roles: ["teacher", "admin"] });
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("tcas_target_totals");
  if (error) throw error;
  const rows = (data ?? []) as Row[];

  return (
    <Container className="py-10">
      <Link
        href="/tcas"
        className="-ml-2 mb-4 inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-sm font-bold text-muted transition-colors hover:bg-surface hover:text-brand"
      >
        <ArrowLeft aria-hidden className="h-4 w-4" />
        TCAS
      </Link>
      <PageHeader eyebrow="TCAS" title="สถิติเป้าหมายของนักเรียน" subtitle="นักเรียนตั้งเป้าหมายเข้าคณะไหนบ้าง (ไม่แสดงชื่อ)" />

      <p className="mb-6 flex gap-2 text-sm text-muted">
        <ShieldCheck aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-success" />
        แสดงเฉพาะกลุ่มที่มีนักเรียนตั้งแต่ 3 คนขึ้นไป เพื่อความเป็นส่วนตัว นักเรียนที่ตั้งหลายเป้าหมายอาจถูกนับในหลายกลุ่ม
      </p>

      {rows.length === 0 ? (
        <EmptyState
          icon={<BarChart3 aria-hidden className="h-6 w-6" />}
          title="ยังไม่มีข้อมูลเพียงพอ"
          body="เมื่อมีนักเรียนอย่างน้อย 3 คนตั้งเป้าหมายในกลุ่มเดียวกัน สถิติจะแสดงที่นี่"
        />
      ) : (
        <div className="grid items-start gap-5 lg:grid-cols-2">
          <BarList title="ตามกลุ่มสาขา" data={sumBy(rows, (r) => r.group_field || "ไม่ระบุ")} />
          <div className="space-y-5">
            <BarList title="ตามมหาวิทยาลัย" data={sumBy(rows, (r) => r.university_name)} />
            <BarList title="ตามระดับชั้น" data={sumBy(rows, (r) => (r.grade ? `ม.${r.grade}` : "ไม่ระบุ"))} />
          </div>
        </div>
      )}
    </Container>
  );
}
