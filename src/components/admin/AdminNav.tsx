"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { AlertTriangle, LayoutDashboard, LogIn, MessageSquareText, Upload, UserSearch } from "lucide-react";
import { cx } from "@/components/ui";

const TABS = [
  { href: "/admin", label: "ภาพรวม", Icon: LayoutDashboard },
  { href: "/admin/feedback", label: "ความคิดเห็น", Icon: MessageSquareText },
  { href: "/admin/errors", label: "ข้อผิดพลาด", Icon: AlertTriangle },
  { href: "/admin/logins", label: "การเข้าสู่ระบบ", Icon: LogIn },
  { href: "/admin/users", label: "ผู้ใช้", Icon: UserSearch },
  { href: "/admin/roster", label: "นำเข้ารายชื่อ", Icon: Upload },
];

/** Tabs across the top of every Developer Console page. */
export function AdminNav() {
  const path = usePathname();
  return (
    <nav
      aria-label="เมนูคอนโซลผู้พัฒนา"
      className="-mx-4 mb-6 overflow-x-auto px-4 sm:mx-0 sm:px-0 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
      <ul className="inline-flex min-w-full gap-1 rounded-2xl border border-line bg-surface p-1.5 shadow-soft-sm sm:min-w-0">
        {TABS.map(({ href, label, Icon }) => {
          const on = path === href;
          return (
            <li key={href} className="shrink-0">
              <Link
                href={href}
                aria-current={on ? "page" : undefined}
                className={cx(
                  "inline-flex h-10 items-center gap-2 whitespace-nowrap rounded-xl px-4 text-sm font-bold transition-all duration-150",
                  on ? "bg-brand text-white shadow-brand-glow" : "text-muted hover:bg-brand-soft hover:text-brand",
                )}
              >
                <Icon aria-hidden className="h-4 w-4" />
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
