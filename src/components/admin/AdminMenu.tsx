import type { ReactNode } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  ChevronDown,
  FileBarChart2,
  Gauge,
  GraduationCap,
  HardDrive,
  History,
  KeyRound,
  LayoutDashboard,
  Lightbulb,
  Map as MapIcon,
  MessageSquareText,
  QrCode,
  Sparkles,
  Upload,
  UserSearch,
  type LucideIcon,
} from "lucide-react";
import { cx } from "@/components/ui";
import type { AlertItem, MenuBox, MenuGroup, MenuIcon } from "@/lib/adminMenu";
import { formatTime } from "@/lib/calendar";

// The Developer Console's central menu: groups of boxes (bento: the most-used ones are big and red),
// the alert strip above it, and AdminSection, the fold-open block the crowded pages use.

const ICONS: Record<MenuIcon, LucideIcon> = {
  qr: QrCode,
  tcas: GraduationCap,
  roadmap: MapIcon,
  teacherCode: KeyRound,
  users: UserSearch,
  roster: Upload,
  overview: LayoutDashboard,
  history: History,
  feedback: MessageSquareText,
  errors: AlertTriangle,
  limits: Gauge,
  report: FileBarChart2,
  ideas: Lightbulb,
  drive: HardDrive,
};

const DELAYS = ["", "delay-1", "delay-2", "delay-3", "delay-4"];

function Box({ box, index }: { box: MenuBox; index: number }) {
  const Icon = ICONS[box.icon];
  const big = box.big;
  return (
    <li
      className={cx(
        "group relative flex min-w-0 animate-rise flex-col rounded-2xl p-4 transition-[transform,box-shadow,border-color] duration-200 ease-out hover:-translate-y-0.5 sm:p-5",
        DELAYS[Math.min(index, DELAYS.length - 1)],
        box.tall && "lg:row-span-2",
        big
          ? "bg-brand-gradient speed-lines col-span-2 text-white shadow-brand-glow hover:shadow-brand-glow-lg"
          : "border border-line bg-surface text-ink shadow-soft-sm hover:border-brand/30 hover:shadow-soft",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <span className={cx("grid shrink-0 place-items-center rounded-xl", big ? "h-12 w-12 bg-white/15 text-white" : "h-10 w-10 bg-brand-soft text-brand")}>
          <Icon aria-hidden className={big ? "h-6 w-6" : "h-5 w-5"} />
        </span>
        {box.badge && (
          <span className={cx("rounded-full px-2.5 py-1 text-xs font-bold", big ? "bg-white text-brand shadow-soft" : "bg-brand text-white shadow-brand-glow")}>
            {box.badge}
          </span>
        )}
      </div>
      <h3 className={cx("mt-3 min-w-0 font-display font-bold leading-snug", big ? "text-xl sm:text-2xl" : "text-base sm:text-lg")}>
        {/* The whole box is the link (stretched over it); the action button sits above it. */}
        <Link
          href={box.href}
          className="outline-none after:absolute after:inset-0 after:rounded-2xl focus-visible:after:ring-2 focus-visible:after:ring-brand focus-visible:after:ring-offset-2"
        >
          {box.label}
        </Link>
      </h3>
      <p className={cx("mt-1 hidden text-sm leading-relaxed sm:block", big ? "text-white/80" : "text-muted")}>{box.hint}</p>
      <div className="mt-auto flex flex-wrap items-end justify-between gap-2 pt-3">
        {box.stat ? <p className={cx("min-w-0 text-xs font-bold tabular-nums sm:text-sm", big ? "text-white" : "text-ink")}>{box.stat}</p> : <span />}
        {box.action ? (
          <Link
            href={box.action.href}
            className="relative z-10 inline-flex h-9 items-center gap-1.5 rounded-lg bg-white px-3 text-sm font-bold text-brand shadow-soft transition-transform hover:-translate-y-0.5 active:scale-[0.98]"
          >
            <Sparkles aria-hidden className="h-4 w-4" />
            {box.action.label}
          </Link>
        ) : (
          <ArrowRight
            aria-hidden
            className={cx("h-4 w-4 shrink-0 transition-transform group-hover:translate-x-0.5", big ? "text-white/80" : "text-faint group-hover:text-brand")}
          />
        )}
      </div>
    </li>
  );
}

/** The box menu, one heading per group. Two per row on phones, three on computers; big boxes span two. */
export function AdminMenu({ groups }: { groups: MenuGroup[] }) {
  let i = 0;
  return (
    <div className="space-y-8">
      {groups.map((g) => (
        <section key={g.title} aria-labelledby={`menu-${g.title}`}>
          <div className="mb-3 flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
            <h2 id={`menu-${g.title}`} className="font-display text-lg font-bold text-ink">
              {g.title}
            </h2>
            <p className="text-sm text-muted">{g.note}</p>
          </div>
          <ul className="grid grid-flow-dense grid-cols-2 gap-3 lg:grid-cols-3 lg:gap-4">
            {g.boxes.map((b) => (
              <Box key={b.href} box={b} index={i++} />
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

/** Above the menu: what needs a look, or a calm "all clear" with the time it was checked. */
export function AdminAlerts({ items, checkedAt }: { items: AlertItem[]; checkedAt: string }) {
  if (items.length === 0) {
    return (
      <p className="mb-8 flex items-center gap-2 rounded-2xl border border-line bg-surface px-4 py-3 text-sm text-muted shadow-soft-sm">
        <CheckCircle2 aria-hidden className="h-4 w-4 shrink-0 text-success" />
        ทุกอย่างปกติ · ตรวจล่าสุด {formatTime(checkedAt)} น.
      </p>
    );
  }
  return (
    <section
      aria-label="ควรตรวจดู"
      className="mb-8 flex flex-col gap-2 rounded-2xl border border-brand/25 bg-brand-soft/60 px-4 py-3 sm:flex-row sm:flex-wrap sm:items-center"
    >
      <span className="flex items-center gap-2 text-sm font-bold text-brand">
        <AlertTriangle aria-hidden className="h-4 w-4 shrink-0" />
        ควรตรวจดู
      </span>
      <ul className="flex flex-wrap gap-2">
        {items.map((a) => (
          <li key={a.href + a.label}>
            <Link
              href={a.href}
              className="inline-flex items-center gap-1.5 rounded-full border border-brand/20 bg-surface px-3 py-1 text-sm font-bold text-ink shadow-soft-sm transition-colors hover:border-brand hover:text-brand"
            >
              {a.label}
              <span className="rounded-full bg-brand px-1.5 text-xs text-white tabular-nums">{a.count.toLocaleString("th-TH")}</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

/**
 * A block that folds open and shut (native <details>, so it works without JavaScript).
 * Used to split the crowded console pages into clear sections.
 */
export function AdminSection({
  title,
  icon: Icon,
  count,
  open = false,
  tone = "brand",
  children,
}: {
  title: string;
  icon: LucideIcon;
  count?: ReactNode;
  open?: boolean;
  tone?: "brand" | "danger";
  children: ReactNode;
}) {
  return (
    <details open={open} className="group mb-4 rounded-2xl border border-line bg-surface shadow-soft-sm">
      <summary className="flex cursor-pointer list-none items-center gap-3 rounded-2xl px-4 py-4 transition-colors hover:bg-sunken/60 sm:px-5 [&::-webkit-details-marker]:hidden">
        <Icon aria-hidden className={cx("h-5 w-5 shrink-0", tone === "danger" ? "text-danger" : "text-brand")} />
        <h2 className="min-w-0 flex-1 font-display text-lg font-bold text-ink">{title}</h2>
        {count !== undefined && <span className="rounded-full bg-sunken px-2.5 py-0.5 text-xs font-bold tabular-nums text-muted">{count}</span>}
        <ChevronDown aria-hidden className="h-5 w-5 shrink-0 text-faint transition-transform duration-200 group-open:rotate-180" />
      </summary>
      <div className="border-t border-line px-4 py-4 sm:px-5">{children}</div>
    </details>
  );
}
