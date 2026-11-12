"use client";

import type { ReactNode } from "react";
import { Check, X } from "lucide-react";
import { cx } from "@/components/ui";
import type { AnyBox, BoxData, BoxKind, KeyDate, PortfolioItem, RoadmapProgram, Term } from "@/lib/roadmap";
import type { DayKey } from "@/lib/calendar";

/** What every box body can read about the roadmap. */
export type BoxCtx = {
  program: RoadmapProgram;
  portfolio: PortfolioItem[];
  /** 1–5 from the student's saved calculator scores for this program, or null. */
  chance: number | null;
  /** The student's saved scores for this program (by exam code), or null when it isn't a saved target. */
  savedScores: Record<string, number> | null;
  targets: { programId: string; label: string; chance: number | null }[];
  keyDates: KeyDate[];
  today: DayKey;
  term: Term | null;
};

export type BodyProps<K extends BoxKind> = {
  boxId: string;
  data: BoxData[K];
  set: (data: BoxData[K]) => void;
  ctx: BoxCtx;
  replaceBox: (box: AnyBox) => void;
};

/** Small text box used inside boxes. */
export const fieldStyles =
  "h-10 w-full rounded-xl border border-line bg-surface px-3 text-sm text-ink placeholder:text-faint hover:border-line-strong focus:border-brand focus:shadow-brand-glow focus:outline-none";

/** A tickable row (quests, portfolio, study slots). */
export function CheckRow({
  done,
  onToggle,
  children,
  extra,
  onRemove,
  removeLabel,
  highlight,
}: {
  done: boolean;
  onToggle: () => void;
  children: ReactNode;
  extra?: ReactNode;
  onRemove?: () => void;
  removeLabel?: string;
  highlight?: boolean;
}) {
  return (
    <li
      className={cx(
        "group flex items-start gap-2 rounded-xl border px-2.5 py-2 transition-colors",
        done ? "border-success/25 bg-success/5" : highlight ? "border-brand/25 bg-brand-soft/60" : "border-line bg-surface",
      )}
    >
      <button
        type="button"
        role="checkbox"
        aria-checked={done}
        onClick={onToggle}
        className={cx(
          "mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-md border transition-[transform,background-color] active:scale-90",
          done ? "border-success bg-success text-white" : "border-line-strong bg-surface hover:border-brand",
        )}
      >
        {done && <Check aria-hidden className="h-3.5 w-3.5" strokeWidth={3} />}
        <span className="sr-only">ทำแล้ว</span>
      </button>
      <div className="min-w-0 flex-1 text-sm">
        <span className={cx("leading-snug", done ? "text-muted line-through decoration-success/50" : "text-ink")}>{children}</span>
        {extra}
      </div>
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          aria-label={removeLabel ?? "ลบ"}
          className="grid h-6 w-6 shrink-0 place-items-center rounded-md text-faint hover:bg-sunken hover:text-danger"
        >
          <X aria-hidden className="h-4 w-4" />
        </button>
      )}
    </li>
  );
}

/** A thin progress bar inside a box. */
export function Meter({ value, label, tone = "brand" }: { value: number; label: string; tone?: "brand" | "success" }) {
  const pct = Math.max(0, Math.min(100, value * 100));
  return (
    <div role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(pct)} className="h-2.5 overflow-hidden rounded-full bg-sunken">
      <div
        className={cx("h-full rounded-full transition-[width] duration-500", tone === "success" ? "bg-success" : "bg-brand-gradient")}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="rounded-xl border border-dashed border-line-strong px-3 py-3 text-center text-sm text-muted">{children}</p>;
}
