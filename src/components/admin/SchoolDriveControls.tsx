"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { FolderOpen, PlugZap, Unplug } from "lucide-react";
import { chooseSchoolDrive, disconnectSchoolDriveAction, testSchoolDriveAction, type SchoolDriveResult } from "@/app/admin/drive/actions";
import { Notice, buttonStyles, cx } from "@/components/ui";

function useRun() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const run = (fn: () => Promise<SchoolDriveResult>, okText: string) =>
    start(async () => {
      setMsg(null);
      const r = await fn();
      setMsg(r.error ? { tone: "error", text: r.error } : { tone: "success", text: okText });
      router.refresh();
    });
  return { pending, msg, run };
}

/** The list of Shared Drives to choose from (after signing in). */
export function SharedDrivePicker({ drives }: { drives: { id: string; name: string; canUse: boolean }[] }) {
  const { pending, msg, run } = useRun();
  return (
    <div className="space-y-3">
      <ul className="grid gap-2 sm:grid-cols-2">
        {drives.map((d) => (
          <li key={d.id}>
            <button
              type="button"
              disabled={pending || !d.canUse}
              onClick={() => run(() => chooseSchoolDrive(d.id), `ใช้ “${d.name}” แล้ว`)}
              className={cx(
                "flex w-full items-center gap-3 rounded-2xl border p-4 text-left transition-[transform,box-shadow,border-color] duration-150",
                d.canUse
                  ? "border-line bg-surface shadow-soft-sm hover:-translate-y-0.5 hover:border-brand/40 hover:shadow-soft"
                  : "cursor-not-allowed border-line bg-sunken opacity-70",
              )}
            >
              <span className={cx("grid h-11 w-11 shrink-0 place-items-center rounded-xl", d.canUse ? "bg-brand-soft text-brand" : "bg-surface text-faint")}>
                <FolderOpen aria-hidden className="h-5 w-5" />
              </span>
              <span className="min-w-0">
                <span className="block truncate font-bold text-ink">{d.name}</span>
                <span className="block text-xs text-muted">{d.canUse ? "กดเพื่อใช้ Shared Drive นี้" : "บัญชีนี้ไม่ใช่ผู้จัดการ (Manager) จึงใช้ไม่ได้"}</span>
              </span>
            </button>
          </li>
        ))}
      </ul>
      {msg && <Notice tone={msg.tone}>{msg.text}</Notice>}
    </div>
  );
}

/** "ทดสอบการเชื่อมต่อ" and "ยกเลิกการเชื่อมต่อ" (two taps). */
export function SchoolDriveActions() {
  const { pending, msg, run } = useRun();
  const [armed, setArmed] = useState(false);
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <button type="button" disabled={pending} onClick={() => run(testSchoolDriveAction, "เชื่อมต่อได้ปกติ")} className={buttonStyles.secondary}>
          <PlugZap aria-hidden className="h-4 w-4" />
          {pending ? "กำลังตรวจ…" : "ทดสอบการเชื่อมต่อ"}
        </button>
        <button
          type="button"
          disabled={pending}
          onBlur={() => setArmed(false)}
          onClick={() => {
            if (!armed) return setArmed(true);
            setArmed(false);
            run(disconnectSchoolDriveAction, "ยกเลิกแล้ว PDF ใหม่จะเก็บในระบบ Connext");
          }}
          className={buttonStyles.danger}
        >
          <Unplug aria-hidden className="h-4 w-4" />
          {armed ? "กดอีกครั้งเพื่อยกเลิกการเชื่อมต่อ" : "ยกเลิกการเชื่อมต่อ"}
        </button>
      </div>
      {msg && <Notice tone={msg.tone}>{msg.text}</Notice>}
    </div>
  );
}
