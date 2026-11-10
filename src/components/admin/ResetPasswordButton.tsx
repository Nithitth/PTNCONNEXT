"use client";

import { useActionState } from "react";
import { resetPassword, type ResetState } from "@/app/admin/actions";
import { Button } from "@/components/ui";

export function ResetPasswordButton({ userId, name }: { userId: string; name: string }) {
  const [state, formAction, pending] = useActionState<ResetState, FormData>(resetPassword, {});

  if (state.tempPassword) {
    return (
      <div className="text-right text-sm">
        <div className="text-muted">รหัสชั่วคราว (แสดงครั้งเดียว)</div>
        <div className="font-mono text-base font-semibold tracking-wider text-ink">{state.tempPassword}</div>
      </div>
    );
  }

  return (
    <form
      action={formAction}
      onSubmit={(e) => {
        if (!confirm(`รีเซ็ตรหัสผ่านของ ${name}? รหัสเดิมจะใช้ไม่ได้อีก`)) e.preventDefault();
      }}
      className="text-right"
    >
      <input type="hidden" name="userId" value={userId} />
      <Button type="submit" disabled={pending}>
        {pending ? "กำลังรีเซ็ต…" : "รีเซ็ตรหัสผ่าน"}
      </Button>
      {state.error && <p className="mt-1 text-xs text-danger">{state.error}</p>}
    </form>
  );
}
