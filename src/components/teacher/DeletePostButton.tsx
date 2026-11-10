"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { deletePost } from "@/app/teacher/actions";
import { cx } from "@/components/ui";

/** Two taps to delete: "ลบ" → "ยืนยันลบ?" (so a slip of the finger doesn't lose work). */
export function DeletePostButton({ postId, title }: { postId: string; title: string }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <span className="inline-flex flex-col items-end gap-1">
      <span className="inline-flex gap-1.5">
        {confirming && (
          <button
            type="button"
            onClick={() => setConfirming(false)}
            className="h-9 rounded-lg px-3 text-sm font-bold text-muted transition-colors hover:bg-sunken"
          >
            ไม่ลบ
          </button>
        )}
        <button
          type="button"
          disabled={pending}
          aria-label={confirming ? `ยืนยันลบ ${title}` : `ลบ ${title}`}
          onClick={() => {
            if (!confirming) return setConfirming(true);
            startTransition(async () => {
              const res = await deletePost(postId);
              if (res.error) {
                setError(res.error);
                setConfirming(false);
              } else router.refresh();
            });
          }}
          className={cx(
            "inline-flex h-9 items-center gap-1.5 rounded-lg border px-3 text-sm font-bold transition-all duration-150 active:scale-[0.97] disabled:opacity-60",
            confirming
              ? "border-danger bg-danger text-white"
              : "border-line bg-surface text-danger hover:border-danger/30 hover:bg-danger-soft",
          )}
        >
          <Trash2 aria-hidden className="h-4 w-4" />
          {pending ? "กำลังลบ…" : confirming ? "ยืนยันลบ" : "ลบ"}
        </button>
      </span>
      {error && <span role="alert" className="text-xs text-danger">{error}</span>}
    </span>
  );
}
