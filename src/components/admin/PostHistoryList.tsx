import { cx } from "@/components/ui";
import type { HistoryRow } from "@/lib/activityData";
import { formatDateTime } from "@/lib/calendar";

const POST_ACTION: Record<HistoryRow["action"], { text: string; tone: string }> = {
  create: { text: "สร้าง", tone: "bg-success-soft text-success" },
  edit: { text: "แก้ไข", tone: "bg-warning-soft text-warning" },
  delete: { text: "ลบ", tone: "bg-danger-soft text-danger" },
};
/** Post history rows, shared with ประวัติ. */
export function PostHistoryList({ rows, showWho = true }: { rows: HistoryRow[]; showWho?: boolean }) {
  if (!rows.length) return <p className="text-sm text-muted">ยังไม่มีรายการ</p>;
  return (
    <ul className="-mx-4 -my-4 divide-y divide-line text-sm sm:-mx-5">
      {rows.map((h) => (
        <li key={h.id} className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 gap-y-1 px-4 py-3 sm:px-5">
          <span className="min-w-0">
            <span className={cx("mr-2 rounded-full px-2 py-0.5 text-xs font-bold", POST_ACTION[h.action].tone)}>{POST_ACTION[h.action].text}</span>
            <span className="font-bold text-ink">{h.title || "(ไม่มีชื่อ)"}</span>
            {showWho && <span className="ml-2 text-muted">โดย {h.who}</span>}
          </span>
          <span className="text-xs text-muted">{formatDateTime(h.at)}</span>
          {h.lines.length > 0 && (
            <ul className="col-span-2 space-y-0.5 text-xs text-muted">
              {h.lines.map((l, i) => (
                <li key={i}>• {l}</li>
              ))}
            </ul>
          )}
        </li>
      ))}
    </ul>
  );
}
