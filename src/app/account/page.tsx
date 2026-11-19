import type { Metadata } from "next";
import Link from "next/link";
import { Cloud, KeyRound, LogOut, ShieldCheck } from "lucide-react";
import { logout } from "@/app/login/actions";
import { TwoStepAccount } from "@/components/TwoStepForm";
import { DriveAccountCard } from "@/components/teacher/DriveConnect";
import { Button, Card, Container, PageHeader, buttonStyles } from "@/components/ui";
import { requireProfile } from "@/lib/auth";
import { driveState } from "@/lib/drive";
import { formatClassroom } from "@/lib/roster";

export const metadata: Metadata = { title: "ข้อมูลบัญชี" };

const ROLE_LABEL = { student: "นักเรียน", teacher: "ครู", admin: "ผู้ดูแลระบบ" } as const;

export default async function AccountPage() {
  const profile = await requireProfile({ feature: "account" });
  const drive = profile.role === "student" ? null : await driveState(profile.id);

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
        {profile.role !== "student" && (
          <Card className="mt-6">
            <h2 className="flex items-center gap-2 font-display text-lg font-bold text-ink">
              <ShieldCheck aria-hidden className="h-5 w-5 text-brand" />
              การยืนยันตัวตนสองขั้นตอน
            </h2>
            <p className="mb-4 mt-1 text-sm leading-relaxed text-muted">
              นอกจากรหัสผ่าน ต้องกรอกรหัส 6 หลักจากแอปในโทรศัพท์ด้วย คนที่รู้รหัสผ่านของคุณก็เข้าบัญชีไม่ได้
              {profile.role === "teacher" && " (ไม่บังคับสำหรับครู แต่แนะนำ)"}
            </p>
            <TwoStepAccount on={profile.twoStepOn} canTurnOff={profile.role !== "admin"} />
          </Card>
        )}
        {drive?.configured && (
          <Card className="mt-6">
            <h2 className="flex items-center gap-2.5 font-display text-2xl font-bold text-ink">
              <Cloud aria-hidden className="h-7 w-7 text-brand" />
              Google Drive
            </h2>
            {!drive.school && (
              <p className="mb-5 mt-2 text-lg leading-relaxed text-muted">เก็บไฟล์ PDF ที่คุณแชร์ไว้ใน Google Drive ของคุณเอง ช่วยประหยัดพื้นที่ของโรงเรียน</p>
            )}
            <DriveAccountCard connected={drive.connected} school={drive.school} />
          </Card>
        )}
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
