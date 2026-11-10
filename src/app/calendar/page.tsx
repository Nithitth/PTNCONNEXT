import type { Metadata } from "next";
import { CalendarDays } from "lucide-react";
import { Container, EmptyState, PageHeader } from "@/components/ui";
import { requireProfile } from "@/lib/auth";
import { formatClassroom } from "@/lib/roster";

export const metadata: Metadata = { title: "ปฏิทิน" };

// Week 2: month grid, deadline dots, exam bands, day drawer and side panel.
export default async function CalendarPage() {
  const profile = await requireProfile();

  return (
    <Container className="py-10">
      <PageHeader
        eyebrow={profile.classroom ? `ห้อง ${formatClassroom(profile.classroom)}` : profile.display_name}
        title="ปฏิทิน"
        subtitle="งาน วันสอบ และสื่อการสอนของห้องคุณ"
      />
      <EmptyState
        icon={<CalendarDays aria-hidden className="h-6 w-6" />}
        title="ปฏิทินกำลังจะเปิดให้ใช้งาน"
        body="เมื่อครูมอบหมายงานหรือประกาศวันสอบ จะแสดงที่นี่ทันที"
      />
    </Container>
  );
}
