"use client";

import { useActionState, useState } from "react";
import { GraduationCap, Presentation } from "lucide-react";
import { login, type LoginKind, type LoginState } from "@/app/login/actions";
import { Button, Field, Notice } from "@/components/ui";

const COPY: Record<LoginKind, { label: string; idLabel: string; idPlaceholder: string }> = {
  student: { label: "นักเรียน", idLabel: "เลขประจำตัวนักเรียน หรืออีเมล", idPlaceholder: "12345 หรือ name@gmail.com" },
  teacher: { label: "ครู", idLabel: "อีเมล หรือเบอร์โทร", idPlaceholder: "name@gmail.com หรือ 081-234-5678" },
};

export function LoginForm() {
  const [state, formAction, pending] = useActionState<LoginState, FormData>(login, {});
  const [kind, setKind] = useState<LoginKind>(state.kind ?? "student");
  const copy = COPY[kind];

  return (
    <form action={formAction} className="space-y-5">
      <fieldset>
        <legend className="mb-2 text-sm font-medium text-ink">เข้าสู่ระบบในฐานะ</legend>
        <div className="grid grid-cols-2 gap-1.5 rounded-xl border border-line bg-sunken p-1">
          {(["student", "teacher"] as const).map((k) => {
            const Icon = k === "student" ? GraduationCap : Presentation;
            const on = kind === k;
            return (
              <label
                key={k}
                className={`flex cursor-pointer items-center justify-center gap-2 rounded-lg border py-2.5 text-sm font-bold transition-all duration-150 has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-brand ${
                  on ? "border-brand bg-brand text-white shadow-soft-sm" : "border-transparent text-muted hover:text-brand"
                }`}
              >
                <input type="radio" name="kind" value={k} checked={on} onChange={() => setKind(k)} className="sr-only" />
                <Icon aria-hidden className="h-4 w-4" />
                {COPY[k].label}
              </label>
            );
          })}
        </div>
      </fieldset>

      <Field
        key={kind}
        label={copy.idLabel}
        name="loginId"
        autoComplete="username"
        placeholder={copy.idPlaceholder}
        defaultValue={state.kind === kind ? state.loginId : ""}
        required
      />
      <Field
        label="รหัสผ่าน"
        name="password"
        type="password"
        autoComplete="current-password"
        required
      />

      {state.error && <Notice tone="error">{state.error}</Notice>}

      <Button type="submit" variant="primary" className="h-12 w-full" disabled={pending}>
        {pending ? "กำลังเข้าสู่ระบบ…" : "เข้าสู่ระบบ"}
      </Button>
    </form>
  );
}
