import type { Metadata } from "next";
import Image from "next/image";
import { redirect } from "next/navigation";
import { CalendarDays, FileDown, GraduationCap } from "lucide-react";
import { LoginForm } from "@/components/LoginForm";
import { Brand, Notice } from "@/components/ui";
import { getCurrentProfile } from "@/lib/auth";
import { isSupabaseConfigured, NOT_CONFIGURED_MESSAGE } from "@/lib/env";

export const metadata: Metadata = { title: "เข้าสู่ระบบ" };

export default async function LoginPage() {
  if (await getCurrentProfile()) redirect("/calendar");

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 sm:py-14">
      <div className="grid overflow-hidden rounded-3xl border border-line bg-surface shadow-soft-lg lg:grid-cols-2">
        <aside className="bg-brand-gradient speed-lines relative hidden overflow-hidden p-10 text-white lg:flex lg:flex-col lg:justify-between">
          <Image
            src="/brand/arrow-white.png"
            alt=""
            aria-hidden
            width={185}
            height={272}
            className="animate-float pointer-events-none absolute -bottom-16 -right-10 w-72 opacity-15"
          />
          <div className="relative">
            <Image src="/brand/ptn-connext-white.png" alt="PTN Connext" width={230} height={33} className="h-auto w-[230px]" />
            <h2 className="mt-8 font-display text-4xl font-extrabold leading-tight">
              ทุกเรื่องเรียน
              <br />
              ในที่เดียว
            </h2>
            <p className="mt-4 max-w-sm text-balance leading-relaxed text-white/85">
              เข้าสู่ระบบเพื่อดูงาน วันสอบ และสื่อการสอนของห้องเรียนคุณ
            </p>
          </div>
          <ul className="relative space-y-3 text-sm font-bold">
            {[
              { Icon: CalendarDays, text: "ปฏิทินงานและวันสอบของห้องคุณ" },
              { Icon: FileDown, text: "สไลด์และเอกสารจากครู" },
              { Icon: GraduationCap, text: "ข้อมูล TCAS (เร็วๆ นี้)" },
            ].map(({ Icon, text }) => (
              <li key={text} className="flex items-center gap-3">
                <span className="grid h-9 w-9 place-items-center rounded-lg border border-white bg-white text-brand shadow-soft-sm">
                  <Icon aria-hidden className="h-4 w-4" strokeWidth={2.4} />
                </span>
                {text}
              </li>
            ))}
          </ul>
        </aside>

        <section className="p-6 sm:p-10">
          <div className="mx-auto max-w-sm">
            <h1 className="font-display text-3xl font-extrabold tracking-tight text-ink">
              เข้าสู่ระบบ <Brand className="text-brand">Connext</Brand>
            </h1>
            <p className="mb-7 mt-2 text-sm text-muted">สำหรับนักเรียนและครูของโรงเรียน</p>
            {!isSupabaseConfigured && (
              <div className="mb-5">
                <Notice tone="warning">{NOT_CONFIGURED_MESSAGE}</Notice>
              </div>
            )}
            <LoginForm />
            <p className="mt-7 border-t border-line pt-5 text-xs leading-relaxed text-muted">
              ลืมรหัสผ่าน? ติดต่อครูประจำชั้นหรือผู้ดูแลระบบเพื่อรีเซ็ตรหัสผ่าน
            </p>
          </div>
        </section>
      </div>
    </div>
  );
}
