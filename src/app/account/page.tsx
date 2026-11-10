import type { Metadata } from "next";
import Link from "next/link";
import { KeyRound, LogOut } from "lucide-react";
import { logout } from "@/app/login/actions";
import { Button, Card, Container, PageHeader, buttonStyles } from "@/components/ui";
import { requireProfile } from "@/lib/auth";
import { formatClassroom } from "@/lib/roster";

export const metadata: Metadata = { title: "ข้อมูลบัญชี" };

const ROLE_LABEL = { student: "นักเรียน", teacher: "ครู", admin: "ผู้ดูแลระบบ" } as const;

export default async function AccountPage() {
  const profile = await requireProfile();

  const rows: [string, string][] = [
    [profile.role === "student" ? "เลขประจำตัว" : "ชื่อผู้ใช้", profile.login_id],
    ["สถานะ", ROLE_LABEL[profile.role]],
  ];
  if (profile.classroom) rows.push(["ห้องเรียน", formatClassroom(profile.classroom)]);

  return (
    <Container className="py-10">
      <div className="max-w-2xl">
        <PageHeader eyebrow="บัญชีของฉัน" title={profile.display_name} />
        <Card bold className="p-0 sm:p-0">
          <dl className="divide-y divide-line">
            {rows.map(([k, v]) => (
              <div key={k} className="flex justify-between gap-4 px-5 py-4 text-sm sm:px-7">
                <dt className="text-muted">{k}</dt>
                <dd className="text-right font-semibold text-ink">{v}</dd>
              </div>
            ))}
          </dl>
        </Card>
        <p className="mt-3 text-xs text-muted">ข้อมูลไม่ถูกต้อง? แจ้งผู้ดูแลระบบของโรงเรียนให้แก้ไข</p>
        <div className="mt-6 flex flex-col gap-3 sm:flex-row">
          <Link href="/change-password" className={buttonStyles.secondary}>
            <KeyRound aria-hidden className="h-4 w-4" />
            เปลี่ยนรหัสผ่าน
          </Link>
          <form action={logout}>
            <Button type="submit" variant="danger" className="w-full sm:w-auto">
              <LogOut aria-hidden className="h-4 w-4" />
              ออกจากระบบ
            </Button>
          </form>
        </div>
      </div>
    </Container>
  );
}
