import type { Metadata } from "next";
import { BookOpen, ClipboardList } from "lucide-react";
import { Card, Container, EmptyState, PageHeader } from "@/components/ui";
import { requireProfile } from "@/lib/auth";
import { formatClassroom } from "@/lib/roster";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "คอนโซลครู" };

type Teaching = {
  classroom: { grade: number; room: number } | null;
  subject: { code: string; name_th: string; color: string } | null;
};

// Week 2: assign homework, share documents, announce exams, my posts.
export default async function TeacherConsolePage() {
  const profile = await requireProfile({ roles: ["teacher", "admin"] });
  const supabase = await createClient();
  const { data } = await supabase
    .from("teaching_assignments")
    .select("classroom:classrooms(grade, room), subject:subjects(code, name_th, color)")
    .eq("teacher_id", profile.id);
  const teaching = (data ?? []) as unknown as Teaching[];

  return (
    <Container className="py-10">
      <PageHeader eyebrow={profile.display_name} title="คอนโซลครู" subtitle="มอบหมายงาน แชร์เอกสาร และประกาศวันสอบ" />
      <div className="grid gap-5 lg:grid-cols-[1.7fr_1fr]">
        <EmptyState
          icon={<ClipboardList aria-hidden className="h-6 w-6" />}
          title="เครื่องมือมอบหมายงานกำลังจะเปิดให้ใช้งาน"
          body="วางไฟล์ครั้งเดียว เลือกได้หลายห้อง และกำหนดส่งแต่ละห้องต่างกันได้"
        />
        <Card>
          <h2 className="flex items-center gap-2 font-display text-lg font-semibold text-ink">
            <BookOpen aria-hidden className="h-5 w-5 text-brand" />
            วิชาและห้องที่คุณสอน
          </h2>
          {teaching.length === 0 ? (
            <p className="mt-3 text-sm leading-relaxed text-muted">
              ยังไม่มีข้อมูล ผู้ดูแลระบบจะนำเข้าจากรายชื่อครูของโรงเรียน
            </p>
          ) : (
            <ul className="mt-4 divide-y divide-line text-sm">
              {teaching.map((t, i) => (
                <li key={i} className="flex items-center justify-between gap-3 py-2.5">
                  <span className="flex min-w-0 items-center gap-2.5 text-ink">
                    <span aria-hidden className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: t.subject?.color }} />
                    <span className="truncate">{t.subject ? `${t.subject.code} ${t.subject.name_th}` : "-"}</span>
                  </span>
                  <span className="shrink-0 rounded-lg bg-sunken px-2 py-0.5 text-xs font-medium text-muted">
                    {t.classroom ? formatClassroom(t.classroom) : "-"}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </Container>
  );
}
