import type { Metadata } from "next";
import { MessageSquareText } from "lucide-react";
import { AdminNav } from "@/components/admin/AdminNav";
import { Container, EmptyState, PageHeader } from "@/components/ui";
import { requireProfile } from "@/lib/auth";
import { formatDateTime } from "@/lib/calendar";
import { formatClassroom } from "@/lib/roster";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "ความคิดเห็น" };

const LIMIT = 200;
const ROLE: Record<string, string> = { student: "นักเรียน", teacher: "ครู", admin: "ผู้ดูแลระบบ" };

type Row = {
  id: string;
  message: string;
  created_at: string;
  sender: {
    display_name: string;
    login_id: string;
    role: string;
    classroom: { grade: number; room: number } | null;
  } | null;
};

/** Feedback inbox: every message from the home page's feedback box, newest first. */
export default async function FeedbackInboxPage() {
  await requireProfile({ roles: ["admin"] });
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("feedback")
    .select(
      "id, message, created_at, sender:profiles(display_name, login_id, role, classroom:classrooms!profiles_classroom_id_fkey(grade, room))",
    )
    .order("created_at", { ascending: false })
    .limit(LIMIT);
  if (error) throw error;
  const rows = (data ?? []) as unknown as Row[];

  return (
    <Container className="py-10">
      <PageHeader
        eyebrow="ผู้ดูแลระบบ"
        title="ความคิดเห็น"
        subtitle={`ข้อความจากกล่องความคิดเห็นในหน้าแรก · แสดงล่าสุด ${LIMIT} รายการ`}
      />
      <AdminNav />

      {rows.length === 0 ? (
        <EmptyState
          icon={<MessageSquareText aria-hidden className="h-6 w-6" />}
          title="ยังไม่มีความคิดเห็น"
          body="เมื่อนักเรียนหรือครูส่งข้อความจากหน้าแรก จะแสดงที่นี่"
        />
      ) : (
        <ul className="space-y-3">
          {rows.map((f) => (
            <li key={f.id} className="rounded-2xl border border-line bg-surface p-4 shadow-soft-sm sm:p-5">
              <p className="whitespace-pre-line break-words text-sm leading-relaxed text-ink">{f.message}</p>
              <p className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-line pt-3 text-xs text-muted">
                {f.sender ? (
                  <>
                    <b className="font-bold text-ink">{f.sender.display_name}</b>
                    <span>
                      {ROLE[f.sender.role] ?? f.sender.role}
                      {f.sender.classroom && ` ${formatClassroom(f.sender.classroom)}`}
                    </span>
                    <span className="font-mono">{f.sender.login_id}</span>
                  </>
                ) : (
                  <span>ผู้ใช้ที่ถูกลบแล้ว</span>
                )}
                <span className="ml-auto">{formatDateTime(f.created_at)}</span>
              </p>
            </li>
          ))}
        </ul>
      )}
    </Container>
  );
}
