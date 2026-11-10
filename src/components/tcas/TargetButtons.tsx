"use client";

import { useState, useTransition } from "react";
import { Star, Trash2 } from "lucide-react";
import { removeTarget, saveTarget } from "@/app/tcas/actions";
import { Notice, buttonStyles, smallButtonStyles } from "@/components/ui";

/**
 * "Save as target" / "remove" for one program. The calculator passes its slider scores;
 * programs without a calculator save the program alone.
 */
export function TargetButtons({
  programId,
  initiallySaved,
  getScores,
  position = 0,
  removeOnly = false,
}: {
  programId: string;
  initiallySaved: boolean;
  getScores?: () => Record<string, number>;
  position?: number;
  /** Only offer removal (the program is no longer in the TCAS data). */
  removeOnly?: boolean;
}) {
  const [saved, setSaved] = useState(initiallySaved);
  const [message, setMessage] = useState<{
    tone: "success" | "error";
    text: string;
  } | null>(null);
  const [pending, start] = useTransition();

  const save = () =>
    start(async () => {
      setMessage(null);
      const res = await saveTarget(programId, position, getScores?.() ?? {});
      if (res.error) setMessage({ tone: "error", text: res.error });
      else {
        setSaved(true);
        setMessage({
          tone: "success",
          text: "บันทึกเป้าหมายแล้ว ดูได้ที่หน้า TCASter",
        });
      }
    });
  const remove = () =>
    start(async () => {
      setMessage(null);
      const res = await removeTarget(programId);
      if (res.error) setMessage({ tone: "error", text: res.error });
      else {
        setSaved(false);
        setMessage({ tone: "success", text: "เอาออกจากเป้าหมายแล้ว" });
      }
    });

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        {!removeOnly && (
          <button
            type="button"
            onClick={save}
            disabled={pending}
            className={buttonStyles.primary}
          >
            <Star aria-hidden className="h-4 w-4" />
            {pending
              ? "กำลังบันทึก…"
              : saved && getScores
                ? "บันทึกคะแนนล่าสุด"
                : saved
                  ? "บันทึกแล้ว"
                  : "บันทึกเป็นเป้าหมาย"}
          </button>
        )}
        {saved && (
          <button
            type="button"
            onClick={remove}
            disabled={pending}
            className={smallButtonStyles}
          >
            <Trash2 aria-hidden className="h-4 w-4" />
            เอาออกจากเป้าหมาย
          </button>
        )}
      </div>
      {message && <Notice tone={message.tone}>{message.text}</Notice>}
    </div>
  );
}
