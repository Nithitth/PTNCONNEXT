// Small shared building blocks so every page looks the same.
// Style: clean — thin light-grey borders, soft shadows, gentle lift-and-press motion.
import type { ComponentProps, ReactNode } from "react";
import { AlertTriangle, CheckCircle2, Info, XCircle } from "lucide-react";

export const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(" ");

type ButtonProps = ComponentProps<"button"> & { variant?: keyof typeof buttonStyles };

// Hover: lifts slightly and the shadow grows. Press: settles back and shrinks a touch.
const PRESS =
  "transition-[transform,box-shadow,background-color,color,border-color] duration-150 ease-out hover:-translate-y-0.5 active:translate-y-0 active:scale-[0.98] active:shadow-soft-sm";

const BUTTON_BASE =
  "inline-flex h-11 items-center justify-center gap-2 rounded-xl px-5 text-sm font-bold disabled:pointer-events-none disabled:opacity-60";

/** White button with a thin grey border that turns light red on hover. */
const SECONDARY = `${PRESS} border border-line bg-surface text-ink shadow-soft-sm hover:border-brand/30 hover:bg-brand-soft hover:text-brand hover:shadow-soft`;

export const buttonStyles = {
  primary: `${BUTTON_BASE} ${PRESS} border border-brand bg-brand text-white shadow-brand-glow hover:bg-brand-hot hover:shadow-brand-glow-lg active:bg-brand-deep`,
  secondary: `${BUTTON_BASE} ${SECONDARY}`,
  /** White button for use on red backgrounds. */
  inverse: `${BUTTON_BASE} ${PRESS} border border-white bg-white text-brand shadow-soft hover:bg-ink hover:text-white hover:shadow-soft-lg`,
  ghost: `${BUTTON_BASE} text-muted transition-colors hover:bg-sunken hover:text-brand`,
  danger: `${BUTTON_BASE} ${PRESS} border border-line bg-surface text-danger shadow-soft-sm hover:bg-danger hover:text-white hover:shadow-soft`,
};

/** Smaller secondary button (lists, toolbars). Don't shrink buttonStyles with extra classes — they clash. */
export const smallButtonStyles = `inline-flex h-9 items-center justify-center gap-1.5 rounded-lg px-3 text-sm font-bold ${SECONDARY}`;

/** Square icon-only button (e.g. ‹ ›). Always give it an aria-label. */
export const iconButtonStyles = `inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${SECONDARY}`;

export function Button({ variant = "secondary", className, ...props }: ButtonProps) {
  return <button className={cx(buttonStyles[variant], className)} {...props} />;
}

/** The brand name, always in Prompt. */
export function Brand({ className, children = "PTN Connext" }: { className?: string; children?: ReactNode }) {
  return <span className={cx("font-brand font-bold tracking-tight", className)}>{children}</span>;
}

export function Card({ className, children, bold }: { className?: string; children: ReactNode; bold?: boolean }) {
  return (
    <div
      className={cx(
        "rounded-2xl bg-surface p-5 sm:p-7",
        bold ? "border border-line shadow-soft-lg" : "border border-line",
        className,
      )}
    >
      {children}
    </div>
  );
}

/** Shared look for text boxes, selects and textareas. Add a width (w-full, w-24…) where used. */
export const inputStyles =
  "rounded-xl border border-line bg-surface px-3.5 text-base text-ink transition-[border-color,box-shadow] duration-150 placeholder:text-faint hover:border-line-strong focus:border-brand focus:shadow-brand-glow focus:outline-none disabled:bg-sunken disabled:text-faint";

export function Field({
  label,
  hint,
  ...input
}: ComponentProps<"input"> & { label: string; hint?: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-bold text-ink">{label}</span>
      <input className={cx(inputStyles, "h-12 w-full")} {...input} />
      {hint && <span className="mt-1.5 block text-xs leading-relaxed text-muted">{hint}</span>}
    </label>
  );
}

const NOTICE = {
  info: { icon: Info, box: "border-line bg-sunken text-ink", iconColor: "text-muted" },
  error: { icon: XCircle, box: "border-danger/25 bg-danger-soft text-danger", iconColor: "text-danger" },
  success: { icon: CheckCircle2, box: "border-success/25 bg-success-soft text-success", iconColor: "text-success" },
  warning: { icon: AlertTriangle, box: "border-[#e2b65c]/50 bg-warning-soft text-warning", iconColor: "text-warning" },
};

export function Notice({ tone = "info", children }: { tone?: keyof typeof NOTICE; children: ReactNode }) {
  const t = NOTICE[tone];
  const Icon = t.icon;
  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      className={cx("flex animate-rise gap-2.5 rounded-xl border px-3.5 py-3 text-sm leading-relaxed", t.box)}
    >
      <Icon aria-hidden className={cx("mt-0.5 h-4 w-4 shrink-0", t.iconColor)} strokeWidth={2.4} />
      <div className="min-w-0">{children}</div>
    </div>
  );
}

/** Small red label above a heading. */
export function Eyebrow({ children, className, light }: { children: ReactNode; className?: string; light?: boolean }) {
  return (
    <p className={cx("flex items-center gap-2 text-sm font-bold", light ? "text-white/85" : "text-brand", className)}>
      <span aria-hidden className={cx("h-1 w-6 -skew-x-[30deg]", light ? "bg-white" : "bg-brand")} />
      {children}
    </p>
  );
}

export function PageHeader({
  title,
  eyebrow,
  subtitle,
  children,
  as: Heading = "h1",
}: {
  title: string;
  eyebrow?: string;
  subtitle?: ReactNode;
  children?: ReactNode;
  /** Use "h2" when the page already has its own h1 (e.g. a hero above). */
  as?: "h1" | "h2";
}) {
  return (
    <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
      <div>
        {eyebrow && <Eyebrow className="mb-2">{eyebrow}</Eyebrow>}
        <Heading className="font-display text-3xl font-extrabold tracking-tight text-ink sm:text-4xl">{title}</Heading>
        {subtitle && <p className="mt-1.5 text-sm text-muted">{subtitle}</p>}
      </div>
      {children}
    </div>
  );
}

export function Container({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cx("mx-auto w-full max-w-6xl px-4 sm:px-6", className)}>{children}</div>;
}

/** Friendly placeholder for sections that have no content yet. */
export function EmptyState({ icon, title, body }: { icon: ReactNode; title: string; body: ReactNode }) {
  return (
    <div className="flex flex-col items-center rounded-2xl border border-dashed border-line-strong bg-surface px-6 py-14 text-center">
      <div className="bg-brand-gradient mb-4 grid h-14 w-14 place-items-center rounded-2xl text-white shadow-soft">
        {icon}
      </div>
      <p className="font-display text-lg font-bold text-ink">{title}</p>
      <p className="mt-1 max-w-md text-sm leading-relaxed text-muted">{body}</p>
    </div>
  );
}
