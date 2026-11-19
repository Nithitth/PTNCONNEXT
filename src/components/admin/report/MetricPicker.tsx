"use client";

import { useId, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, Search, Sparkles, TrendingDown, X } from "lucide-react";
import { cx } from "@/components/ui";
import { linePath } from "@/lib/chart";
import { CATEGORIES, METRICS, formatValue, metricOf, type Metric, type MetricCategory } from "@/lib/report";
import { CAT_LOOK } from "./metricLook";

/** What the picker shows next to each goal: its value this term and its last 8 weeks. */
export type MetricNow = Record<string, { value: number | null; spark: (number | null)[] }>;

function Spark({ values, className }: { values: (number | null)[]; className?: string }) {
  const d = linePath(values, 56, 18, { pad: 2 });
  if (!d) return <span aria-hidden className="inline-block h-[18px] w-14" />;
  return (
    <svg aria-hidden viewBox="0 0 56 18" className={cx("h-[18px] w-14 overflow-visible", className)}>
      <path d={d} fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

const norm = (s: string) => s.toLowerCase().replace(/\s+/g, "");

/**
 * The goal (metric) picker: a button showing the chosen goal and its live value, opening a searchable list
 * grouped like the catalogue (bottom sheet on phones, a centred panel from sm up). ↑/↓ + Enter, Esc closes.
 */
export function MetricPicker({ value, onChange, now }: { value: string; onChange: (m: Metric) => void; now: MetricNow }) {
  const ref = useRef<HTMLDialogElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const listId = useId();
  const [q, setQ] = useState("");
  const [cat, setCat] = useState<MetricCategory | "all">("all");
  const [active, setActive] = useState(0);
  // The list is only built while the window is open (a settings page has one picker per key result).
  const [isOpen, setIsOpen] = useState(false);
  const chosen = metricOf(value);

  const list = useMemo(() => {
    const n = norm(q);
    return METRICS.filter((m) => (cat === "all" || m.cat === cat) && (!n || norm(`${m.th}${m.en}${m.desc}`).includes(n)));
  }, [q, cat]);
  const groups = CATEGORIES.map((c) => ({ ...c, items: list.filter((m) => m.cat === c.key) })).filter((g) => g.items.length);
  const flat = groups.flatMap((g) => g.items);

  const open = () => {
    setQ("");
    setCat("all");
    setActive(
      Math.max(
        0,
        METRICS.findIndex((m) => m.key === value),
      ),
    );
    setIsOpen(true);
    ref.current?.showModal();
    requestAnimationFrame(() => {
      searchRef.current?.focus();
      document.getElementById(`${listId}-${value}`)?.scrollIntoView({ block: "center" });
    });
  };
  const pick = (m: Metric) => {
    onChange(m);
    ref.current?.close();
  };
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const next = Math.max(0, Math.min(flat.length - 1, active + (e.key === "ArrowDown" ? 1 : -1)));
      setActive(next);
      document.getElementById(`${listId}-${flat[next]?.key}`)?.scrollIntoView({ block: "nearest" });
    } else if (e.key === "Enter" && flat[active]) {
      e.preventDefault();
      pick(flat[active]);
    }
  };

  const look = chosen ? CAT_LOOK[chosen.cat] : null;
  const cur = chosen ? now[chosen.key] : undefined;

  return (
    <>
      <button
        type="button"
        onClick={open}
        aria-haspopup="dialog"
        className="group flex w-full items-center gap-3 rounded-xl border border-line bg-surface p-2.5 text-left shadow-soft-sm transition-all duration-150 hover:-translate-y-0.5 hover:border-line-strong hover:shadow-soft focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand/15"
      >
        {look && chosen ? (
          <span className={cx("grid h-10 w-10 shrink-0 place-items-center rounded-lg", look.tile)}>
            <look.Icon aria-hidden className="h-5 w-5" />
          </span>
        ) : (
          <span className="h-10 w-10 shrink-0 rounded-lg bg-sunken" />
        )}
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-bold text-ink">{chosen?.th ?? "เลือกตัวชี้วัด"}</span>
          <span className="block truncate text-xs text-muted">{chosen?.desc ?? "แตะเพื่อเลือกจากรายการ"}</span>
        </span>
        {chosen && (
          <span className="hidden shrink-0 flex-col items-end sm:flex">
            <span className="rounded-full bg-sunken px-2 py-0.5 text-xs font-bold tabular-nums text-ink">
              {formatValue(cur?.value ?? null, chosen.unit, "th")}
            </span>
            <span className="text-[10px] text-faint">ภาคเรียนนี้</span>
          </span>
        )}
        <ChevronDown aria-hidden className="h-4 w-4 shrink-0 text-muted transition-transform group-hover:translate-y-0.5" />
      </button>

      <dialog
        ref={ref}
        aria-label="เลือกตัวชี้วัด"
        onClose={() => setIsOpen(false)}
        onClick={(e) => {
          if (e.target === e.currentTarget) e.currentTarget.close();
        }}
        className={cx(
          "fixed m-0 max-h-none max-w-none overflow-hidden bg-surface p-0 text-ink shadow-soft-lg outline-none",
          "backdrop:bg-ink/35 backdrop:backdrop-blur-[2px]",
          "inset-x-0 bottom-0 top-auto h-[85dvh] w-full rounded-t-3xl open:animate-sheet-up",
          "sm:inset-0 sm:m-auto sm:h-[min(44rem,88dvh)] sm:w-[40rem] sm:rounded-3xl sm:open:animate-pop",
        )}
      >
        {isOpen && (
          <div className="flex h-full flex-col">
            <header className="border-b border-line px-4 pb-3 pt-4 sm:px-5">
              <div className="mb-3 flex items-center justify-between gap-3">
                <h2 className="font-display text-lg font-bold">เลือกตัวชี้วัด</h2>
                <button
                  type="button"
                  aria-label="ปิด"
                  onClick={() => ref.current?.close()}
                  className="grid h-9 w-9 place-items-center rounded-lg text-muted hover:bg-sunken hover:text-ink"
                >
                  <X aria-hidden className="h-5 w-5" />
                </button>
              </div>
              <label className="relative block">
                <Search aria-hidden className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-faint" />
                <input
                  ref={searchRef}
                  value={q}
                  onChange={(e) => {
                    setQ(e.target.value);
                    setActive(0);
                  }}
                  onKeyDown={onKey}
                  placeholder="ค้นหา เช่น เปิดดู ปฏิทิน ครู สอบ"
                  role="combobox"
                  aria-expanded="true"
                  aria-controls={listId}
                  aria-activedescendant={flat[active] ? `${listId}-${flat[active].key}` : undefined}
                  className="h-11 w-full rounded-xl border border-line bg-page pl-9 pr-3 text-sm transition-colors focus:border-brand focus:bg-surface focus:outline-none focus:ring-4 focus:ring-brand/10"
                />
              </label>
              <div className="-mx-4 mt-3 flex gap-1.5 overflow-x-auto px-4 pb-1 sm:-mx-5 sm:px-5" role="tablist" aria-label="กลุ่มตัวชี้วัด">
                {[{ key: "all" as const, th: "ทั้งหมด" }, ...CATEGORIES].map((c) => {
                  const on = cat === c.key;
                  const count = c.key === "all" ? METRICS.length : METRICS.filter((m) => m.cat === c.key).length;
                  return (
                    <button
                      key={c.key}
                      type="button"
                      role="tab"
                      aria-selected={on}
                      onClick={() => {
                        setCat(c.key);
                        setActive(0);
                      }}
                      className={cx(
                        "shrink-0 whitespace-nowrap rounded-full border px-3 py-1.5 text-xs font-bold transition-colors",
                        on ? "border-brand bg-brand text-white" : "border-line bg-surface text-muted hover:border-line-strong hover:text-ink",
                      )}
                    >
                      {c.th} <span className={cx("tabular-nums", on ? "text-white/80" : "text-faint")}>{count}</span>
                    </button>
                  );
                })}
              </div>
            </header>

            <div className="min-h-0 flex-1 overflow-y-auto px-2 py-2 sm:px-3">
              {flat.length === 0 && <p className="px-3 py-10 text-center text-sm text-muted">ไม่พบตัวชี้วัดที่ตรงกับ “{q}”</p>}
              <ul id={listId} role="listbox" aria-label="ตัวชี้วัด">
                {groups.map((g) => (
                  <li key={g.key} role="presentation" className="mb-2">
                    <p className={cx("sticky top-0 z-10 bg-surface/95 px-3 py-1.5 text-xs font-bold backdrop-blur", CAT_LOOK[g.key].text)}>{g.th}</p>
                    <ul role="presentation">
                      {g.items.map((m) => {
                        const i = flat.indexOf(m);
                        const sel = m.key === value;
                        const n = now[m.key];
                        const L = CAT_LOOK[m.cat];
                        return (
                          <li
                            key={m.key}
                            id={`${listId}-${m.key}`}
                            role="option"
                            aria-selected={sel}
                            onClick={() => pick(m)}
                            onMouseMove={() => setActive(i)}
                            className={cx(
                              "flex cursor-pointer items-center gap-3 rounded-xl px-3 py-2.5 transition-colors",
                              i === active ? "bg-sunken" : "hover:bg-sunken/60",
                              sel && "ring-1 ring-brand/40",
                            )}
                          >
                            <span className={cx("grid h-9 w-9 shrink-0 place-items-center rounded-lg", L.tile)}>
                              <L.Icon aria-hidden className="h-4 w-4" />
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="flex flex-wrap items-center gap-1.5 text-sm font-bold text-ink">
                                {m.th}
                                {m.lower && (
                                  <span className="inline-flex items-center gap-0.5 rounded-full bg-sunken px-1.5 py-px text-[10px] font-bold text-muted">
                                    <TrendingDown aria-hidden className="h-3 w-3" />
                                    ยิ่งน้อยยิ่งดี
                                  </span>
                                )}
                                {m.fresh && (
                                  <span className="inline-flex items-center gap-0.5 rounded-full bg-feature-soft px-1.5 py-px text-[10px] font-bold text-feature">
                                    <Sparkles aria-hidden className="h-3 w-3" />
                                    ข้อมูลใหม่
                                  </span>
                                )}
                              </span>
                              <span className="block text-xs leading-snug text-muted">{m.desc}</span>
                            </span>
                            <span className="flex shrink-0 flex-col items-end gap-0.5">
                              <span className="text-xs font-bold tabular-nums text-ink">{formatValue(n?.value ?? null, m.unit, "th")}</span>
                              <Spark values={n?.spark ?? []} className={L.text} />
                            </span>
                            <Check aria-hidden className={cx("h-4 w-4 shrink-0 text-brand", sel ? "opacity-100" : "opacity-0")} />
                          </li>
                        );
                      })}
                    </ul>
                  </li>
                ))}
              </ul>
            </div>
            <footer className="border-t border-line px-4 py-2.5 text-[11px] text-faint sm:px-5">
              ↑ ↓ เลือก · Enter ยืนยัน · Esc ปิด · ค่าและเส้นเล็กคือภาคเรียนนี้ 8 สัปดาห์ล่าสุด
            </footer>
          </div>
        )}
      </dialog>
    </>
  );
}
