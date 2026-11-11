"use client";

import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import {
  ArrowDown01,
  ArrowDown10,
  Briefcase,
  Check,
  ChevronDown,
  Cog,
  DraftingCompass,
  FlaskConical,
  Gauge,
  GraduationCap,
  HeartPulse,
  LayoutGrid,
  Laptop,
  Layers,
  Palette,
  PawPrint,
  Pill,
  Plane,
  School,
  Smile,
  Sprout,
  Stethoscope,
  Users,
  type LucideIcon,
} from "lucide-react";
import { cx } from "@/components/ui";

type Option = { value: string; label: string; hint?: string; icon: LucideIcon };

/**
 * A styled dropdown for the TCAS filter bar. It keeps a hidden input so the surrounding <form> still
 * submits it, and submits the form as soon as a choice is picked.
 * Keyboard: ↑/↓, Home/End, Enter/Space to pick, Esc to close.
 */
function FilterSelect({
  name,
  caption,
  value,
  options,
  className,
}: {
  name: string;
  caption: string;
  value: string;
  options: Option[];
  className?: string;
}) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const root = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const current = options.find((o) => o.value === value) ?? options[0];
  const CurrentIcon = current.icon;

  // Close when clicking anywhere else.
  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [open]);

  // Keep the highlighted option in view.
  useEffect(() => {
    if (open) list.current?.children[active]?.scrollIntoView({ block: "nearest" });
  }, [open, active]);

  const show = () => {
    setActive(Math.max(0, options.indexOf(current)));
    setOpen(true);
  };

  const pick = (o: Option) => {
    setOpen(false);
    if (o.value === value || !input.current) return;
    input.current.value = o.value;
    input.current.form?.requestSubmit();
  };

  const onKey = (e: KeyboardEvent) => {
    const keys: Record<string, () => void> = {
      ArrowDown: () => (open ? setActive((i) => Math.min(i + 1, options.length - 1)) : show()),
      ArrowUp: () => (open ? setActive((i) => Math.max(i - 1, 0)) : show()),
      Home: () => setActive(0),
      End: () => setActive(options.length - 1),
      Enter: () => (open ? pick(options[active]) : show()),
      " ": () => (open ? pick(options[active]) : show()),
      Escape: () => setOpen(false),
      Tab: () => setOpen(false),
    };
    const run = keys[e.key];
    if (!run) return;
    if (e.key !== "Tab") e.preventDefault();
    run();
  };

  return (
    // On phones the panel spans the whole two-column row (the parent is relative); from sm it sits under its button.
    <div ref={root} className={cx("sm:relative", className)}>
      <input ref={input} type="hidden" name={name} defaultValue={value} />
      <button
        type="button"
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={`${id}-list`}
        aria-activedescendant={open ? `${id}-${active}` : undefined}
        aria-label={`${caption}: ${current.label}`}
        onClick={() => (open ? setOpen(false) : show())}
        onKeyDown={onKey}
        className={cx(
          "group flex h-11 w-full items-center gap-2.5 rounded-xl border bg-surface pl-2 pr-3 text-left transition-[border-color,box-shadow] duration-150 focus:outline-none",
          open ? "border-brand shadow-brand-glow" : "border-line hover:border-line-strong focus-visible:border-brand focus-visible:shadow-brand-glow",
        )}
      >
        <span
          aria-hidden
          className={cx(
            "grid h-7 w-7 shrink-0 place-items-center rounded-lg transition-colors",
            current.value && current !== options[0] ? "bg-brand text-white" : "bg-brand-soft text-brand",
          )}
        >
          <CurrentIcon className="h-4 w-4" />
        </span>
        <span className="min-w-0 flex-1 leading-tight">
          <span className="block text-[11px] font-bold text-muted">{caption}</span>
          <span className="block truncate text-sm font-bold text-ink">{current.label}</span>
        </span>
        <ChevronDown aria-hidden className={cx("h-4 w-4 shrink-0 text-faint transition-transform duration-200", open && "rotate-180 text-brand")} />
      </button>

      {open && (
        <ul
          ref={list}
          id={`${id}-list`}
          role="listbox"
          aria-label={caption}
          className="animate-dropdown absolute left-0 right-0 z-30 mt-2 max-h-[min(24rem,60vh)] overflow-y-auto overscroll-contain rounded-2xl border border-line bg-surface p-1.5 shadow-soft-lg sm:right-auto sm:w-80"
        >
          {options.map((o, i) => {
            const Icon = o.icon;
            const selected = o === current;
            return (
              <li
                key={o.value || "all"}
                id={`${id}-${i}`}
                role="option"
                aria-selected={selected}
                onPointerEnter={() => setActive(i)}
                onClick={() => pick(o)}
                className={cx(
                  "flex cursor-pointer items-center gap-3 rounded-xl px-2.5 py-2 transition-colors",
                  i === active && "bg-brand-soft/60",
                )}
              >
                <span
                  aria-hidden
                  className={cx(
                    "grid h-8 w-8 shrink-0 place-items-center rounded-lg transition-colors",
                    selected ? "bg-brand text-white shadow-brand-glow" : "bg-sunken text-muted",
                    i === active && !selected && "bg-surface text-brand",
                  )}
                >
                  <Icon className="h-4 w-4" />
                </span>
                <span className="min-w-0 flex-1 leading-snug">
                  <span className={cx("block text-sm font-bold", selected ? "text-brand" : "text-ink")}>{o.label}</span>
                  {o.hint && <span className="mt-0.5 block text-xs text-muted">{o.hint}</span>}
                </span>
                {selected && <Check aria-hidden className="h-4 w-4 shrink-0 text-brand" />}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

/** Short names and icons for TCAS's long field-group names (matched from the start of the name). */
const GROUP_LOOK: [RegExp, string, LucideIcon][] = [
  [/^การท่องเที่ยว/, "ท่องเที่ยวและการโรงแรม", Plane],
  [/^เกษตร/, "เกษตรศาสตร์ วนศาสตร์", Sprout],
  [/^ครุ/, "ครุศาสตร์ ศึกษาศาสตร์", School],
  [/^ทันต/, "ทันตแพทยศาสตร์", Smile],
  [/^เทคโนโลยีสารสนเทศ/, "เทคโนโลยีสารสนเทศ", Laptop],
  [/^นิเทศ/, "มนุษยศาสตร์ สังคมศาสตร์ นิติ นิเทศ", Users],
  [/^บริหาร/, "บริหาร บัญชี เศรษฐศาสตร์", Briefcase],
  [/^แพทย/, "แพทยศาสตร์", Stethoscope],
  [/^เภสัช/, "เภสัชศาสตร์", Pill],
  [/^วิจิตร/, "ศิลปะและการออกแบบ", Palette],
  [/^วิทยาศาสตร์/, "วิทยาศาสตร์", FlaskConical],
  [/^วิศวกรรม/, "วิศวกรรมศาสตร์", Cog],
  [/^สถาปัตย/, "สถาปัตยกรรมศาสตร์", DraftingCompass],
  [/^สหเวช/, "สหเวช พยาบาล สาธารณสุข", HeartPulse],
  [/^สัตวแพทย/, "สัตวแพทยศาสตร์", PawPrint],
];

function groupOption(group: string): Option {
  const look = GROUP_LOOK.find(([re]) => re.test(group));
  const label = look?.[1] ?? group;
  return { value: group, label, hint: label === group ? undefined : group, icon: look?.[2] ?? GraduationCap };
}

export function GroupSelect({ groups, value, className }: { groups: string[]; value: string; className?: string }) {
  const options = [{ value: "", label: "ทุกกลุ่มสาขา", icon: LayoutGrid }, ...groups.map(groupOption)];
  return <FilterSelect name="g" caption="กลุ่มสาขา" value={value} options={options} className={className} />;
}

const SORT_OPTIONS: Option[] = [
  { value: "faculty", label: "ตามคณะ", hint: "จัดกลุ่มตามมหาวิทยาลัยและคณะ", icon: Layers },
  { value: "low", label: "คะแนนต่ำสุดน้อย → มาก", hint: "คะแนนต่ำสุดที่ติดปีที่แล้ว", icon: ArrowDown01 },
  { value: "high", label: "คะแนนต่ำสุดมาก → น้อย", hint: "คะแนนต่ำสุดที่ติดปีที่แล้ว", icon: ArrowDown10 },
  { value: "competition", label: "แข่งขันน้อย → มาก", hint: "จำนวนผู้สมัครต่อที่นั่งปีที่แล้ว", icon: Gauge },
];

export function SortSelect({ value, className }: { value: string; className?: string }) {
  return <FilterSelect name="s" caption="เรียงตาม" value={value} options={SORT_OPTIONS} className={className} />;
}
