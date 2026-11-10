import type { Metadata } from "next";
import { CheckCircle2 } from "lucide-react";
import { AdminNav } from "@/components/admin/AdminNav";
import { Container, EmptyState, PageHeader } from "@/components/ui";
import { requireProfile } from "@/lib/auth";
import { formatDateTime } from "@/lib/calendar";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "ข้อผิดพลาด" };

const LIMIT = 200;

/** Error log: unexpected server failures recorded by logError(), newest first. */
export default async function ErrorLogPage() {
  await requireProfile({ roles: ["admin"] });
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("error_logs")
    .select("id, route, message, created_at")
    .order("created_at", { ascending: false })
    .limit(LIMIT);
  if (error) throw error;
  const rows = data ?? [];

  return (
    <Container className="py-10">
      <PageHeader
        eyebrow="ผู้ดูแลระบบ"
        title="ข้อผิดพลาด"
        subtitle={`สิ่งที่ระบบทำไม่สำเร็จ เช่น บันทึกโพสต์ไม่ได้ · แสดงล่าสุด ${LIMIT} รายการ`}
      />
      <AdminNav />

      {rows.length === 0 ? (
        <EmptyState
          icon={<CheckCircle2 aria-hidden className="h-6 w-6" />}
          title="ไม่มีข้อผิดพลาด"
          body="ถ้าระบบทำงานไม่สำเร็จ รายละเอียดจะถูกบันทึกไว้ที่นี่ให้ทีมพัฒนาตรวจสอบ"
        />
      ) : (
        <div className="overflow-hidden rounded-2xl border border-line bg-surface shadow-soft-sm">
          <ul className="divide-y divide-line">
            {rows.map((e) => (
              <li key={e.id} className="px-4 py-3.5 sm:px-5">
                <p className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-xs">
                  <span className="rounded-md bg-danger-soft px-2 py-0.5 font-mono font-bold text-danger">{e.route}</span>
                  <span className="text-muted">{formatDateTime(e.created_at)}</span>
                </p>
                <p className="mt-2 break-words font-mono text-xs leading-relaxed text-ink">{e.message}</p>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Container>
  );
}
