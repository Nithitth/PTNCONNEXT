"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { KeyRound } from "lucide-react";

/** Shown on every page while the user is still using their birthdate as the password. */
export function PasswordReminder() {
  const path = usePathname();
  if (path === "/change-password" || path === "/pdpa") return null;

  return (
    <div className="border-b border-[#f1dfb4] bg-warning-soft">
      <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-x-4 gap-y-1 px-4 py-2 text-sm text-warning sm:px-6">
        <span className="flex items-center gap-2">
          <KeyRound aria-hidden className="h-4 w-4 shrink-0" />
          คุณยังใช้วันเกิดเป็นรหัสผ่าน ซึ่งคนอื่นอาจเดาได้
        </span>
        <Link href="/change-password" className="font-semibold underline underline-offset-2 hover:no-underline">
          ตั้งรหัสผ่านใหม่
        </Link>
      </div>
    </div>
  );
}
