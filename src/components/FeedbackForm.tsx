"use client";

import { useActionState, useState } from "react";
import { Lock, MessageSquareHeart, Send } from "lucide-react";
import { sendFeedback, type FeedbackState } from "@/app/feedback/actions";
import { MAX_DESCRIPTION } from "@/lib/postForm";
import { Button, Notice, cx, inputStyles } from "@/components/ui";

/** The home page's feedback box (logged-in users). Messages go to the admin only. */
export function FeedbackForm() {
  // The text is kept in state so it survives an error; it's cleared only after a successful send.
  const [text, setText] = useState("");
  const [state, formAction, pending] = useActionState<FeedbackState, FormData>(async (prev, data) => {
    const result = await sendFeedback(prev, data);
    if (result.ok) setText("");
    return result;
  }, {});

  return (
    <form action={formAction} className="space-y-4">
      <div className="flex items-center gap-3">
        <span className="bg-brand-gradient grid h-10 w-10 shrink-0 place-items-center rounded-xl text-white shadow-brand-glow">
          <MessageSquareHeart aria-hidden className="h-5 w-5" />
        </span>
        <div>
          <h3 className="font-display text-lg font-bold text-ink">ส่งความคิดเห็นถึงทีมพัฒนา</h3>
          <p className="text-xs text-muted">เจอปัญหา อยากได้ฟีเจอร์ หรือมีคำแนะนำ บอกเราได้เลย</p>
        </div>
      </div>

      <label className="block">
        <span className="sr-only">ข้อความ</span>
        <textarea
          name="message"
          required
          rows={4}
          maxLength={MAX_DESCRIPTION}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="เช่น ปุ่มดาวน์โหลดในมือถือกดยาก หรืออยากให้ปฏิทินแสดงวันหยุด"
          className={cx(inputStyles, "min-h-28 w-full resize-y py-3 leading-relaxed")}
        />
        <span className="mt-1 flex items-center justify-between gap-3 text-xs text-muted">
          <span className="inline-flex items-center gap-1">
            <Lock aria-hidden className="h-3 w-3" />
            ผู้ดูแลระบบเท่านั้นที่เห็นข้อความนี้
          </span>
          <span className="tabular-nums">
            {text.length.toLocaleString("th-TH")}/{MAX_DESCRIPTION.toLocaleString("th-TH")}
          </span>
        </span>
      </label>

      {state.error && <Notice tone="error">{state.error}</Notice>}
      {state.ok && <Notice tone="success">ส่งแล้ว ขอบคุณสำหรับความคิดเห็น</Notice>}

      <Button type="submit" variant="primary" className="w-full sm:w-auto" disabled={pending || !text.trim()}>
        <Send aria-hidden className="h-4 w-4" />
        {pending ? "กำลังส่ง…" : "ส่งความคิดเห็น"}
      </Button>
    </form>
  );
}
