"use client";

import { useState, useSyncExternalStore } from "react";
import { ShieldCheck } from "lucide-react";

const KEY = "ptn-guest-privacy-ack";

function subscribe(onChange: () => void) {
  window.addEventListener("storage", onChange);
  return () => window.removeEventListener("storage", onChange);
}
function readAck() {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

/** Short PDPA disclosure for visitors who aren't signed in. Nothing is collected from guests. */
export function GuestPrivacyBanner() {
  // On the server we pretend it's acknowledged, so the banner only appears in the browser.
  const ack = useSyncExternalStore(subscribe, readAck, () => "server");
  const [dismissed, setDismissed] = useState(false);
  if (ack || dismissed) return null;

  const dismiss = () => {
    try {
      localStorage.setItem(KEY, "1");
    } catch {}
    setDismissed(true);
  };

  return (
    <div className="fixed inset-x-0 bottom-0 z-30 p-3 sm:p-4">
      <div className="mx-auto flex max-w-3xl animate-rise flex-col gap-3 rounded-2xl border border-line bg-surface p-4 shadow-soft-lg sm:flex-row sm:items-center">
        <ShieldCheck aria-hidden className="hidden h-5 w-5 shrink-0 text-brand sm:block" />
        <p className="flex-1 text-sm leading-relaxed text-muted">
          เว็บไซต์นี้ไม่เก็บข้อมูลส่วนบุคคลของผู้เยี่ยมชม เมื่อคุณเข้าสู่ระบบ เราจะแจ้งรายละเอียดและขอความยินยอมตาม PDPA ก่อนเก็บข้อมูลใด ๆ
        </p>
        <button
          onClick={dismiss}
          className="h-10 shrink-0 rounded-xl border border-brand bg-brand px-5 text-sm font-bold text-white shadow-brand-glow transition-all duration-150 hover:-translate-y-0.5 hover:bg-brand-hot hover:shadow-brand-glow-lg active:translate-y-0 active:scale-[0.98] active:shadow-soft-sm"
        >
          รับทราบ
        </button>
      </div>
    </div>
  );
}
