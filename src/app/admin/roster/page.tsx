import type { Metadata } from "next";
import { AdminNav } from "@/components/admin/AdminNav";
import { RosterImport } from "@/components/admin/RosterImport";
import { Card, Container, PageHeader } from "@/components/ui";
import { requireProfile } from "@/lib/auth";
import { currentAcademicYear } from "@/lib/roster";

export const metadata: Metadata = { title: "นำเข้ารายชื่อ" };

export default async function RosterPage() {
  await requireProfile({ roles: ["admin"] });
  return (
    <Container className="py-10">
      <PageHeader
        eyebrow="ผู้ดูแลระบบ"
        title="นำเข้ารายชื่อจาก Excel"
        subtitle={`ปีการศึกษา ${currentAcademicYear()} · นำเข้านักเรียนก่อน แล้วจึงนำเข้าครู`}
      />
      <AdminNav />
      <Card>
        <RosterImport />
      </Card>
    </Container>
  );
}
