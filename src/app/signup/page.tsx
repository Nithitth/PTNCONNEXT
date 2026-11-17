import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ShieldCheck } from "lucide-react";
import { SignupForm } from "@/components/SignupForm";
import { Brand, Notice } from "@/components/ui";
import { getCurrentProfile } from "@/lib/auth";
import { isSupabaseConfigured, NOT_CONFIGURED_MESSAGE } from "@/lib/env";
import { SUBJECTS } from "@/lib/school";
import { cleanCode } from "@/lib/signup";
import { isSignupOpen } from "@/lib/signupServer";
import { createAdminClient } from "@/lib/supabase/admin";

export const metadata: Metadata = { title: "ลงทะเบียน" };

/** Sign-up, separate from log-in. A room QR opens this page with ?room=CODE already filled in. */
export default async function SignupPage({ searchParams }: PageProps<"/signup">) {
  if (await getCurrentProfile()) redirect("/calendar");
  const room = (await searchParams).room;
  const roomCode = typeof room === "string" ? cleanCode(room).slice(0, 9) : "";
  const open = isSupabaseConfigured && (await isSignupOpen(createAdminClient()));

  return (
    <div className="mx-auto w-full max-w-xl px-4 py-8 sm:py-14">
      <div className="rounded-3xl border border-line bg-surface p-6 shadow-soft-lg sm:p-10">
        <h1 className="font-display text-3xl font-extrabold tracking-tight text-ink">
          ลงทะเบียน <Brand className="text-brand">Connext</Brand>
        </h1>
        <p className="mb-7 mt-2 text-sm text-muted">สร้างบัญชีครั้งแรก สำหรับนักเรียนและครูของโรงเรียน (1 คน 1 บัญชี)</p>

        {!isSupabaseConfigured ? (
          <Notice tone="warning">{NOT_CONFIGURED_MESSAGE}</Notice>
        ) : open ? (
          <SignupForm subjects={SUBJECTS.map((s) => ({ code: s.code, name: s.name }))} roomCode={roomCode} />
        ) : (
          <Notice tone="info">ขณะนี้ปิดรับลงทะเบียน ติดต่อผู้ดูแลระบบหรือครูประจำชั้น</Notice>
        )}

        <p className="mt-7 flex items-start gap-2 border-t border-line pt-5 text-xs leading-relaxed text-muted">
          <ShieldCheck aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-brand" />
          แต่ละคนลงทะเบียนได้บัญชีเดียว และเข้าได้เฉพาะบัญชีของตัวเอง การลงทะเบียนแทนผู้อื่นจะถูกบันทึกและยกเลิกได้ทันที
        </p>
        <p className="mt-3 text-sm text-muted">
          มีบัญชีแล้ว?{" "}
          <Link href="/login" className="font-bold text-brand hover:underline">
            เข้าสู่ระบบ
          </Link>
        </p>
      </div>
    </div>
  );
}
