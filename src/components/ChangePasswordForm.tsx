"use client";

import { useActionState } from "react";
import { changePassword, type ChangePasswordState } from "@/app/change-password/actions";
import { Button, Field, Notice } from "@/components/ui";

export function ChangePasswordForm({ firstLogin }: { firstLogin: boolean }) {
  const [state, formAction, pending] = useActionState<ChangePasswordState, FormData>(changePassword, {});

  return (
    <form action={formAction} className="space-y-4">
      <Field
        label={firstLogin ? "รหัสผ่านปัจจุบัน (วันเกิด วว ดด ปปปป)" : "รหัสผ่านปัจจุบัน"}
        name="current"
        type="password"
        autoComplete="current-password"
        required
      />
      <Field
        label="รหัสผ่านใหม่"
        name="next"
        type="password"
        autoComplete="new-password"
        minLength={8}
        required
        hint="อย่างน้อย 8 ตัวอักษร ผสมตัวอักษรกับตัวเลข และไม่ใช้วันเกิด"
      />
      <Field label="ยืนยันรหัสผ่านใหม่" name="confirm" type="password" autoComplete="new-password" required />

      {state.error && <Notice tone="error">{state.error}</Notice>}
      {state.done && <Notice tone="success">เปลี่ยนรหัสผ่านแล้ว</Notice>}

      <Button type="submit" variant="primary" className="w-full" disabled={pending}>
        {pending ? "กำลังบันทึก…" : "บันทึกรหัสผ่านใหม่"}
      </Button>
    </form>
  );
}
