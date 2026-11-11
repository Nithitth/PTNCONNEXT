"use client";

import { useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { ArrowRight, Columns3, X } from "lucide-react";
import { buttonStyles, cx } from "@/components/ui";

// Programs ticked for comparison, kept in this browser only (localStorage) so the tray survives page changes.
export type CompareItem = { id: string; name: string; uni: string };

const KEY = "tcas-compare";
const EVENT = "tcas-compare-change";
export const MAX_COMPARE = 3;
const EMPTY: CompareItem[] = [];

let cache: { raw: string | null; items: CompareItem[] } = { raw: null, items: EMPTY };

function read(): CompareItem[] {
  let raw: string | null = null;
  try {
    raw = window.localStorage.getItem(KEY);
  } catch {
    return EMPTY;
  }
  if (raw === cache.raw) return cache.items;
  let items: CompareItem[] = EMPTY;
  try {
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    if (Array.isArray(parsed)) items = parsed.filter((x) => x && typeof x.id === "string").slice(0, MAX_COMPARE);
  } catch {
    items = EMPTY;
  }
  cache = { raw, items };
  return items;
}

function write(items: CompareItem[]) {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(items));
  } catch {
    // Private mode etc.: the tray just won't persist.
  }
  window.dispatchEvent(new Event(EVENT));
}

function subscribe(cb: () => void) {
  window.addEventListener(EVENT, cb);
  window.addEventListener("storage", cb);
  return () => {
    window.removeEventListener(EVENT, cb);
    window.removeEventListener("storage", cb);
  };
}

const useCompare = () => useSyncExternalStore(subscribe, read, () => EMPTY);

/** The "เปรียบเทียบ" tick on a program row. Refuses a 4th program with a short message. */
export function CompareToggle({ item }: { item: CompareItem }) {
  const items = useCompare();
  const [full, setFull] = useState(false);
  const on = items.some((x) => x.id === item.id);
  return (
    <label className="relative inline-flex shrink-0 cursor-pointer items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-bold text-muted hover:bg-brand-soft hover:text-brand">
      <input
        type="checkbox"
        checked={on}
        onChange={() => {
          if (on) return write(items.filter((x) => x.id !== item.id));
          if (items.length >= MAX_COMPARE) {
            setFull(true);
            setTimeout(() => setFull(false), 2500);
            return;
          }
          write([...items, item]);
        }}
        className="h-4 w-4 accent-brand"
      />
      เปรียบเทียบ
      {full && (
        <span role="status" className="absolute right-0 top-full z-10 mt-1 whitespace-nowrap rounded-lg bg-ink px-2 py-1 text-[11px] text-white shadow-soft">
          เลือกได้สูงสุด {MAX_COMPARE} หลักสูตร
        </span>
      )}
    </label>
  );
}

/** Bottom bar listing the ticked programs, with a link to the side-by-side page. */
export function CompareTray() {
  const items = useCompare();
  if (items.length === 0) return null;
  return (
    <div className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface/95 shadow-soft-lg backdrop-blur supports-[backdrop-filter]:bg-surface/85">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-2 px-4 py-3 sm:px-6">
        <span className="flex items-center gap-1.5 text-sm font-bold text-ink">
          <Columns3 aria-hidden className="h-4 w-4 text-brand" />
          เปรียบเทียบ ({items.length}/{MAX_COMPARE})
        </span>
        <ul className="flex min-w-0 flex-1 flex-wrap gap-1.5">
          {items.map((x) => (
            <li key={x.id} className="flex max-w-[16rem] items-center gap-1 rounded-full border border-line bg-sunken py-0.5 pl-2.5 pr-1 text-xs">
              <span className="truncate">
                <b className="font-bold">{x.uni}</b> {x.name}
              </span>
              <button
                type="button"
                aria-label={`เอา ${x.name} ออก`}
                onClick={() => write(items.filter((y) => y.id !== x.id))}
                className="grid h-5 w-5 shrink-0 place-items-center rounded-full text-muted hover:bg-line hover:text-ink"
              >
                <X aria-hidden className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
        </ul>
        <Link
          href={`/tcas/compare?ids=${items.map((x) => x.id).join(",")}`}
          aria-disabled={items.length < 2}
          className={cx(buttonStyles.primary, items.length < 2 && "pointer-events-none opacity-50")}
        >
          ดูเปรียบเทียบ
          <ArrowRight aria-hidden className="h-4 w-4" />
        </Link>
      </div>
    </div>
  );
}
