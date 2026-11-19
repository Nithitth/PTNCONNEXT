import { ChevronDown, Eye, EyeOff, FileText } from "lucide-react";
import { Card, cx } from "@/components/ui";
import { formatDateTime } from "@/lib/calendar";
import { seenLabel, type SeenRoom } from "@/lib/seen";

/** "ใครเปิดดูแล้ว": per room, the students who haven't opened the post yet (first), then who did and when. */
export function SeenBy({ rooms }: { rooms: SeenRoom[] }) {
  if (!rooms.length) return null;
  const total = rooms.reduce((n, r) => n + r.total, 0);
  const seen = rooms.reduce((n, r) => n + r.seen, 0);
  return (
    <section id="seen" className="mx-auto mt-6 max-w-3xl scroll-mt-24">
      <Card>
        <h2 className="flex flex-wrap items-center gap-2.5 font-display text-xl font-bold text-ink">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-brand-soft text-brand">
            <Eye aria-hidden className="h-4 w-4" />
          </span>
          ใครเปิดดูแล้ว
          <span className="ml-auto rounded-full bg-sunken px-3 py-1 text-sm font-bold tabular-nums text-ink">{seenLabel(seen, total)}</span>
        </h2>
        <p className="mt-1 text-sm text-muted">นับเมื่อนักเรียนเปิดวันนั้นในปฏิทิน หรือเปิดไฟล์ของโพสต์นี้</p>

        <div className="mt-4 space-y-3">
          {rooms.map((r, i) => {
            const pct = r.total ? Math.round((r.seen / r.total) * 100) : 0;
            return (
              <details key={r.id ?? "school"} open={i === 0} className="group rounded-2xl border border-line bg-page">
                <summary className="flex cursor-pointer list-none items-center gap-3 p-4 [&::-webkit-details-marker]:hidden">
                  <span className="w-24 shrink-0 font-display text-lg font-bold text-ink">{r.label}</span>
                  <span className="relative h-3 min-w-0 flex-1 overflow-hidden rounded-full bg-sunken" aria-hidden>
                    <span
                      className={cx("absolute inset-y-0 left-0 rounded-full", pct >= 80 ? "bg-success" : "bg-brand-gradient")}
                      style={{ width: `${pct}%` }}
                    />
                  </span>
                  <span className="shrink-0 text-sm font-bold tabular-nums text-ink">
                    {r.seen}/{r.total}
                  </span>
                  <ChevronDown aria-hidden className="h-4 w-4 shrink-0 text-muted transition-transform group-open:rotate-180" />
                </summary>
                <div className="space-y-4 border-t border-line p-4">
                  {r.total === 0 && <p className="text-sm text-muted">ยังไม่มีนักเรียนห้องนี้ในระบบ</p>}
                  {r.notSeen.length > 0 && (
                    <div>
                      <p className="mb-2 flex items-center gap-1.5 text-sm font-bold text-danger">
                        <EyeOff aria-hidden className="h-4 w-4" />
                        ยังไม่เปิด ({r.notSeen.length})
                      </p>
                      <ul className="flex flex-wrap gap-1.5">
                        {r.notSeen.map((s) => (
                          <li key={s.id} className="rounded-full bg-danger-soft px-3 py-1 text-sm text-ink">
                            {s.name}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {r.opened.length > 0 && (
                    <div>
                      <p className="mb-2 flex items-center gap-1.5 text-sm font-bold text-success">
                        <Eye aria-hidden className="h-4 w-4" />
                        เปิดแล้ว ({r.opened.length})
                      </p>
                      <ul className="divide-y divide-line rounded-xl border border-line bg-surface text-sm">
                        {r.opened.map((s) => (
                          <li key={s.id} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-0.5 px-3 py-2">
                            <span className="flex items-center gap-1.5 text-ink">
                              {s.name}
                              {s.fileFirst && (
                                <span title={`เปิดไฟล์ ${formatDateTime(s.fileFirst)}`} className="inline-flex items-center gap-0.5 text-xs text-success">
                                  <FileText aria-hidden className="h-3.5 w-3.5" />
                                  เปิดไฟล์
                                </span>
                              )}
                            </span>
                            <span className="text-xs text-muted">{formatDateTime(s.first)}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              </details>
            );
          })}
        </div>
      </Card>
    </section>
  );
}
