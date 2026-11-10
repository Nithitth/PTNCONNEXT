"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CalendarDays, GraduationCap, Home, Presentation, Settings2, type LucideIcon } from "lucide-react";

const ICONS: Record<string, LucideIcon> = {
  home: Home,
  calendar: CalendarDays,
  tcas: GraduationCap,
  teacher: Presentation,
  admin: Settings2,
};

export type NavItem = { href: string; label: string; icon: keyof typeof ICONS; badge?: string };

export function NavLinks({ items }: { items: NavItem[] }) {
  const path = usePathname();
  const isActive = (href: string) => (href === "/" ? path === "/" : path === href || path.startsWith(href + "/"));

  return (
    <nav aria-label="เมนูหลัก" className="flex h-full items-center gap-1 overflow-x-auto py-2 md:py-0">
      {items.map((item) => {
        const active = isActive(item.href);
        const Icon = ICONS[item.icon] as LucideIcon | undefined;
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={`group relative flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-sm font-bold transition-all duration-150 ${
              active
                ? "border border-brand bg-brand text-white shadow-soft-sm"
                : "border border-transparent text-muted hover:text-brand"
            }`}
          >
            {Icon && (
              <Icon
                aria-hidden
                className={`h-4 w-4 transition-transform duration-200 ${active ? "" : "group-hover:-translate-y-0.5 group-hover:scale-110"}`}
                strokeWidth={2.4}
              />
            )}
            {item.label}
            {item.badge && (
              <span
                className={`rounded-md px-1.5 py-0.5 text-[11px] leading-none ${
                  active ? "bg-white/20 text-white" : "bg-sunken text-faint"
                }`}
              >
                {item.badge}
              </span>
            )}
            {!active && (
              <span
                aria-hidden
                className="absolute inset-x-3 -bottom-0.5 h-0.5 origin-left scale-x-0 bg-brand transition-transform duration-200 group-hover:scale-x-100"
              />
            )}
          </Link>
        );
      })}
    </nav>
  );
}
