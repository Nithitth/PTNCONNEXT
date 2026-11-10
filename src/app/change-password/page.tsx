import type { Metadata } from "next";
import Link from "next/link";
import { KeyRound } from "lucide-react";
import { ChangePasswordForm } from "@/components/ChangePasswordForm";
import { Card, Container, Notice, buttonStyles } from "@/components/ui";
import { requireProfile } from "@/lib/auth";

export const metadata: Metadata = { title: "เปลี่ยนรหัสผ่าน" };

export default async function ChangePasswordPage() {
  const profile = await requireProfile();
  const first = profile.must_change_password;

  return (
    <Container className="flex justify-center py-10 sm:py-16">
      <Card bold className="w-full max-w-md">
        <span className="bg-brand-gradient grid h-12 w-12 place-items-center rounded-xl text-white shadow-soft-sm">
          <KeyRound aria-hidden className="h-6 w-6" />
        </span>
        <h1 className="mt-5 font-display text-2xl font-extrabold tracking-tight text-ink">
          {first ? "ตั้งรหัสผ่านใหม่" : "เปลี่ยนรหัสผ่าน"}
        </h1>
        <div className="mb-6 mt-3">
          {first ? (
            <Notice tone="info">
              ตอนนี้รหัสผ่านของคุณคือวันเกิด ซึ่งเพื่อนร่วมชั้นอาจรู้ แนะนำให้ตั้งรหัสผ่านใหม่ หรือจะข้ามไปก่อนแล้วตั้งทีหลังก็ได้
            </Notice>
          ) : (
            <p className="text-sm text-muted">{profile.display_name}</p>
          )}
        </div>
        <ChangePasswordForm firstLogin={first} />
        {first && (
          <Link href="/calendar" className={`${buttonStyles.ghost} mt-2 w-full`}>
            ข้ามไปก่อน
          </Link>
        )}
      </Card>
    </Container>
  );
}
