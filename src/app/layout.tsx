import type { Metadata } from "next";
import { Prompt } from "next/font/google";
import { GuestPrivacyBanner } from "@/components/GuestPrivacyBanner";
import { Logo, NavBar } from "@/components/NavBar";
import { PasswordReminder } from "@/components/PasswordReminder";
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
            <p className="text-xs text-muted">โครงการพัฒนาโดยนักเรียน เพื่อครูและนักเรียนของโรงเรียน</p>
          </div>
        </footer>
        {!profile && <GuestPrivacyBanner />}
      </body>
    </html>
  );
}
