import type { Metadata } from "next";
import { GraduationCap } from "lucide-react";
import { Container, EmptyState, PageHeader } from "@/components/ui";
import { requireProfile } from "@/lib/auth";

export const metadata: Metadata = { title: "TCAS" };

export default async function TcasPage() {
  await requireProfile();
  return (
    <Container className="py-10">
      <PageHeader eyebrow="เร็วๆ นี้" title="TCASter" subtitle="ข้อมูล TCAS และเครื่องมือวางแผนเข้ามหาวิทยาลัย" />
      <EmptyState
        icon={<GraduationCap aria-hidden className="h-6 w-6" />}
        title="กำลังเตรียมข้อมูล TCAS"
        body="เกณฑ์รับสมัครรอบ 1 และรอบ 3 เครื่องคำนวณคะแนนเป้าหมาย และ Roadmap เตรียมตัวเข้ามหาวิทยาลัย"
      />
    </Container>
  );
}
