"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BarChart3, Search } from "lucide-react";
import { cx } from "@/components/ui";

const TABS = [
  { href: "/tcas", label: "ค้นหาหลักสูตร", Icon: Search, match: (p: string) => !p.startsWith("/tcas/stats") },
  { href: "/tcas/stats", label: "สถิตินักเรียน", Icon: BarChart3, match: (p: string) => p.startsWith("/tcas/stats") },
];

/**
 * The TCAS section's tabs for staff (search programs, anonymous student stats), under the main nav.
 * Students don't get it: their Roadmap is its own main-menu section (/roadmap).
 */
export function TcasTabs() {
  const path = usePathname();
  return (
    <div className="border-b border-line bg-surface">
      <nav aria-label="เมนู TCAS" className="mx-auto flex w-full max-w-6xl items-center gap-1 overflow-x-auto px-4 py-2 sm:px-6">
        <span className="mr-2 hidden text-xs font-bold tracking-wide text-faint sm:inline">TCAS</span>
        {TABS.map(({ href, label, Icon, match }) => {
          const on = match(path);
          return (
            <Link
              key={href}
              href={href}
              aria-current={on ? "page" : undefined}
              className={cx(
                "flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm font-bold transition-colors",
                on ? "bg-brand-soft text-brand" : "text-muted hover:bg-sunken hover:text-ink",
              )}
            >
              <Icon aria-hidden className="h-4 w-4" />
              {label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
