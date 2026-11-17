import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ShieldCheck } from "lucide-react";
import { TwoStepSetup, TwoStepVerify } from "@/components/TwoStepForm";
import { Card, Container } from "@/components/ui";
import { getCurrentProfile, needsTwoStep } from "@/lib/auth";
import { maskEmail } from "@/lib/signup";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { passedEmailCheck, verifiedFactor } from "@/lib/twoStep";

export const metadata: Metadata = { title: "ยืนยันตัวตนสองขั้นตอน" };

/** Log-in step 2 (code from the authenticator app), or an admin's first set-up. */
export default async function TwoStepPage() {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");
  if (!needsTwoStep(profile)) redirect("/calendar");

  const factor = await verifiedFactor(await createClient());
  let email: string | null = null;
  if (!factor) {
    const { data } = await createAdminClient().from("profiles").select("email, email_verified_at").eq("id", profile.id).single();
    email = data?.email && data.email_verified_at ? maskEmail(data.email) : null;
  }

  return (
    <Container className="flex justify-center py-10 sm:py-16">
      <Card bold className="w-full max-w-md">
        <span className="bg-brand-gradient grid h-12 w-12 place-items-center rounded-xl text-white shadow-soft-sm">
          <ShieldCheck aria-hidden className="h-6 w-6" />
        </span>
        <h1 className="mt-5 font-display text-2xl font-extrabold tracking-tight text-ink">
          {factor ? "ยืนยันตัวตนอีกขั้น" : "ตั้งค่าการยืนยันสองขั้นตอน"}
        </h1>
        <p className="mb-6 mt-2 text-sm leading-relaxed text-muted">
          {factor
            ? "เปิดแอปยืนยันตัวตนในโทรศัพท์ (เช่น Google Authenticator) แล้วกรอกรหัส 6 หลักของ PTN Connext"
            : "บัญชีผู้ดูแลระบบต้องใช้รหัสจากโทรศัพท์ทุกครั้งที่เข้าสู่ระบบ ตั้งค่าครั้งเดียว ใช้เวลาประมาณ 2 นาที"}
        </p>
        {factor ? <TwoStepVerify /> : <TwoStepSetup email={email} emailChecked={await passedEmailCheck(profile.id)} needsEmail />}
      </Card>
    </Container>
  );
}
