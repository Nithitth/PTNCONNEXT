"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import { cx, inputStyles } from "@/components/ui";

export type FacultyMenuItem = { anchor: string; label: string; hex: string; light: boolean };

/** "ไปที่คณะ" dropdown: colour-coded faculties that jump to their section in the list. */
export function FacultyMenu({ items }: { items: FacultyMenuItem[] }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === "Escape" : !ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", close);
    };
  }, [open]);

  if (items.length < 2) return null;
  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-expanded={open}
        aria-haspopup="true"
        onClick={() => setOpen((o) => !o)}
        className={cx(inputStyles, "inline-flex h-10 items-center gap-2 text-sm font-bold")}
      >
        <span aria-hidden className="flex -space-x-1">
          {items.slice(0, 4).map((i) => (
            <span
              key={i.anchor}
              className={cx("h-3 w-3 rounded-full ring-2 ring-white", i.light && "outline outline-1 outline-line-strong")}
              style={{ background: i.hex }}
            />
          ))}
        </span>
        ไปที่คณะ
        <ChevronDown aria-hidden className={cx("h-4 w-4 text-faint transition-transform", open && "rotate-180")} />
      </button>
      {open && (
        <ul className="absolute right-0 z-30 mt-1.5 max-h-80 w-72 max-w-[calc(100vw-2rem)] overflow-auto rounded-xl border border-line bg-surface p-1.5 shadow-soft-lg">
          {items.map((i) => (
            <li key={i.anchor}>
              <a
                href={`#${i.anchor}`}
                onClick={() => setOpen(false)}
                className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm text-ink transition-colors hover:bg-brand-soft"
              >
                <span
                  aria-hidden
                  className={cx("h-3 w-3 shrink-0 rounded-full", i.light && "ring-1 ring-line-strong")}
                  style={{ background: i.hex }}
                />
                {i.label}
              </a>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
