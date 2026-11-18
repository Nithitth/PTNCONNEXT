import type { Metadata } from "next";
import Link from "next/link";
import { Prompt } from "next/font/google";
import { GuestPrivacyBanner } from "@/components/GuestPrivacyBanner";
import { Logo, NavBar } from "@/components/NavBar";
import { PasswordReminder } from "@/components/PasswordReminder";
import { TeacherGuide } from "@/components/teacher/TeacherGuide";
import { getCurrentProfile } from "@/lib/auth";
import "./globals.css";

// Prompt is used ONLY for the "PTN Connext" brand name (class: font-brand).
// Everything else uses "Cloud" (see @font-face in globals.css).
const prompt = Prompt({
  variable: "--font-prompt",
  subsets: ["thai", "latin"],
  weight: ["600", "700", "800"],
});

export const metadata: Metadata = {
  title: { default: "PTN Connext", template: "%s · PTN Connext" },
  description: "รวมงาน วันสอบ สื่อการสอน และข้อมูลเรียนต่อมหาวิทยาลัยของโรงเรียนไว้ในที่เดียว",
  // Google Search Console ownership check (the "HTML tag" method): set GOOGLE_SITE_VERIFICATION in Vercel, then redeploy.
  verification: process.env.GOOGLE_SITE_VERIFICATION ? { google: process.env.GOOGLE_SITE_VERIFICATION } : undefined,
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const profile = await getCurrentProfile();

  return (
    <html lang="th" className={`${prompt.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col font-sans">
        <div aria-hidden className="bg-brand-gradient h-1.5" />
        <NavBar />
        {profile?.must_change_password && <PasswordReminder />}
        <main className="flex-1">{children}</main>
        <footer className="border-t border-line bg-surface">
          <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-6 sm:px-6">
            <Logo size="sm" />
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted">
              <p>โครงการพัฒนาโดยนักเรียน เพื่อครูและนักเรียนของโรงเรียน</p>
              <Link href="/privacy" className="font-bold text-ink underline-offset-2 hover:text-brand hover:underline">
                นโยบายความเป็นส่วนตัว
              </Link>
            </div>
          </div>
        </footer>
        {!profile && <GuestPrivacyBanner />}
        {(profile?.role === "teacher" || profile?.role === "admin") && <TeacherGuide autoOpen={profile.role === "teacher"} />}
      </body>
    </html>
  );
}
