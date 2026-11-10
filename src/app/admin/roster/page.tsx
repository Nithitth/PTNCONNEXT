import type { Metadata } from "next";
import Link from "next/link";
import { RosterImport } from "@/components/admin/RosterImport";
import { Card, Container, PageHeader } from "@/components/ui";
import { requireProfile } from "@/lib/auth";
import { currentAcademicYear } from "@/lib/roster";

export const metadata: Metadata = { title: "นำเข้ารายชื่อ" };

export default async function RosterPage() {
  await requireProfile({ roles: ["admin"] });
  return (
    <Container className="py-8">
      <Link href="/admin" className="text-sm text-brand hover:underline">
        ← คอนโซลผู้พัฒนา
      </Link>
      <div className="mt-2">
        <PageHeader
          title="นำเข้ารายชื่อจาก Excel"
          subtitle={`ปีการศึกษา ${currentAcademicYear()} · นำเข้านักเรียนก่อน แล้วจึงนำเข้าครู`}
        />
      </div>
      <Card>
        <RosterImport />
      </Card>
    </Container>
  );
}
