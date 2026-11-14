import { Clock, FileX2 } from "lucide-react";
import { expiryLabel } from "@/lib/postForm";
import { cx } from "@/components/ui";

/**
 * Countdown next to a teacher's PDF: "ดาวน์โหลดได้อีก 45 วัน" (grey), red in the last 14 days,
 * "ไฟล์หมดอายุแล้ว" after 180 days. Renders nothing for links. Works on server and client.
 */
export function ExpiryChip({
  expiresAt,
  expired = false,
  now = new Date(),
  compact,
}: {
  expiresAt: string | null;
  expired?: boolean;
  now?: Date;
  compact?: boolean;
}) {
  const label = expired ? { text: "ไฟล์หมดอายุแล้ว", soon: true, expired: true } : expiryLabel(expiresAt, now);
  if (!label) return null;
  const Icon = label.expired ? FileX2 : Clock;
  return (
    <span
      suppressHydrationWarning
      className={cx(
        "inline-flex items-center gap-1 rounded-lg px-2 font-bold whitespace-nowrap",
        compact ? "h-6 text-[11px]" : "h-7 text-xs",
        label.expired ? "bg-sunken text-muted" : label.soon ? "bg-urgent/10 text-urgent" : "bg-sunken text-muted",
      )}
    >
      <Icon aria-hidden className="h-3.5 w-3.5 shrink-0" />
      {label.text}
    </span>
  );
}

/** True when a PDF can no longer be opened (deleted by the clean-up, or its 180 days are over). */
export function isExpired(a: { expiresAt: string | null; expired: boolean }, now = new Date()) {
  return a.expired || (a.expiresAt !== null && Date.parse(a.expiresAt) <= now.getTime());
}
