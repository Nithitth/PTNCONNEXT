import Link from "next/link";
import { ArrowLeft, ChevronRight } from "lucide-react";
import { smallButtonStyles } from "@/components/ui";

/**
 * Top of every inner Developer Console page: back to the box menu (/admin), plus an optional middle
 * step for pages that sit under another one (e.g. one room → ห้องเรียน & QR).
 */
export function AdminBack({ parent }: { parent?: { href: string; label: string } }) {
  return (
    <nav aria-label="กลับไปเมนู" className="mb-5 flex flex-wrap items-center gap-1.5">
      <Link href="/admin" className={smallButtonStyles}>
        <ArrowLeft aria-hidden className="h-4 w-4" />
        เมนูผู้ดูแล
      </Link>
      {parent && (
        <>
          <ChevronRight aria-hidden className="h-4 w-4 text-faint" />
          <Link href={parent.href} className={smallButtonStyles}>
            {parent.label}
          </Link>
        </>
      )}
    </nav>
  );
}
