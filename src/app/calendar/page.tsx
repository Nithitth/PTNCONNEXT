import type { Metadata } from "next";
import Link from "next/link";
import { Plus } from "lucide-react";
import { CalendarView } from "@/components/calendar/CalendarView";
import { Container, PageHeader, buttonStyles } from "@/components/ui";
import { requireProfile } from "@/lib/auth";
import { addDays, dayKey, monthGrid, parseMonth } from "@/lib/calendar";
import { loadDatedItems, loadMaterials } from "@/lib/posts";
import { formatClassroom } from "@/lib/roster";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "ปฏิทิน" };

export default async function CalendarPage({ searchParams }: PageProps<"/calendar">) {
  const profile = await requireProfile();
  const { m } = await searchParams;
  const now = new Date();
  const month = parseMonth(typeof m === "string" ? m : undefined, now);
  const days = monthGrid(month);

  // Load the visible weeks plus the next 14 days (for "ใกล้ถึงกำหนด").
  const today = dayKey(now);
  const soonEnd = addDays(today, 14);
  const from = days[0] < today ? days[0] : today;
  const to = days[41] > soonEnd ? days[41] : soonEnd;

  const supabase = await createClient();
  const [items, materials] = await Promise.all([
    loadDatedItems(supabase, profile, from, to),
    loadMaterials(supabase, profile),
  ]);

  const isStaff = profile.role !== "student";

  return (
    <Container className="py-10">
      <PageHeader
        eyebrow={profile.classroom ? `ห้อง ${formatClassroom(profile.classroom)}` : profile.display_name}
        title="ปฏิทิน"
        subtitle={isStaff ? "งาน วันสอบ และกิจกรรมที่คุณโพสต์ รวมถึงกิจกรรมของโรงเรียน" : "งาน วันสอบ และสื่อการสอนของห้องคุณ"}
      >
        {isStaff && (
          <Link href="/teacher" className={buttonStyles.primary}>
            <Plus aria-hidden className="h-4 w-4" />
            โพสต์งานใหม่
          </Link>
        )}
      </PageHeader>
      <CalendarView month={month} days={days} items={items} materials={materials} nowIso={now.toISOString()} />
    </Container>
  );
}
