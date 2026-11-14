"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { FileText, Upload, X } from "lucide-react";
import { ExpiryChip } from "@/components/FileExpiry";
import { GUIDE_CLOSED_EVENT } from "@/components/teacher/TeacherGuide";
import { cx } from "@/components/ui";
import { FILE_LIFETIME_DAYS } from "@/lib/postForm";
import type { ExpiringFile } from "@/lib/posts";

const SEEN_KEY = "ptn-expiring-files-seen";

/**
 * Pop-up window for teachers: "these PDFs will be deleted soon", once per visit (sessionStorage).
 * Rendered on the home page and the Teacher's Console. It waits while the teacher guide is open.
 */
export function ExpiringFilesWindow({ files }: { files: ExpiringFile[] }) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    if (files.length === 0) return;
    try {
      if (window.sessionStorage.getItem(SEEN_KEY)) return;
    } catch {}
    const show = () => {
      if (ref.current?.open || document.querySelector("dialog[open]")) return false;
      try {
        window.sessionStorage.setItem(SEEN_KEY, "1");
      } catch {}
      ref.current?.showModal();
      return true;
    };
    // Give the teacher guide a moment to open first; if it does, wait until it closes.
    const timer = window.setTimeout(() => {
      if (show()) return;
      window.addEventListener(GUIDE_CLOSED_EVENT, onGuideClosed);
    }, 400);
    function onGuideClosed() {
      window.setTimeout(() => {
        if (show()) window.removeEventListener(GUIDE_CLOSED_EVENT, onGuideClosed);
      }, 200);
    }
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener(GUIDE_CLOSED_EVENT, onGuideClosed);
    };
  }, [files.length]);

  if (files.length === 0) return null;
  const close = () => ref.current?.close();

  return (
    <dialog
      ref={ref}
      aria-labelledby="expiring-files-title"
      className={cx(
        "fixed m-0 max-h-none max-w-none overflow-hidden bg-surface p-0 text-ink shadow-soft-lg outline-none",
        "backdrop:bg-ink/45 backdrop:backdrop-blur-[2px]",
        "inset-x-0 bottom-0 top-auto w-full rounded-t-3xl open:animate-sheet-up",
        "sm:inset-0 sm:m-auto sm:h-fit sm:w-[34rem] sm:rounded-3xl sm:open:animate-pop",
      )}
    >
      <div className="flex max-h-[90dvh] flex-col">
        <div className="bg-brand-gradient speed-lines px-5 pb-5 pt-4 text-white">
          <span aria-hidden className="mx-auto mb-3 block h-1 w-10 rounded-full bg-white/50 sm:hidden" />
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 id="expiring-files-title" className="font-display text-2xl font-extrabold leading-snug">
                ไฟล์ที่จะถูกลบเร็ว ๆ นี้
              </h2>
              <p className="mt-1 text-base text-white/90">
                ไฟล์ PDF ดาวน์โหลดได้ {FILE_LIFETIME_DAYS} วัน แล้วระบบจะลบอัตโนมัติ ถ้ายังต้องใช้ ให้อัปโหลดใหม่เพื่อเริ่มนับใหม่
              </p>
            </div>
            <button
              type="button"
              aria-label="ปิด"
              onClick={close}
              className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-white/15 text-white hover:bg-white/25"
            >
              <X aria-hidden className="h-6 w-6" />
            </button>
          </div>
        </div>

        <ul className="flex-1 space-y-3 overflow-y-auto px-5 py-4">
          {files.map((f) => (
            <li key={f.attachmentId} className="rounded-2xl border border-line bg-surface p-3.5 shadow-soft-sm">
              <div className="flex items-start gap-3">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-brand-soft text-brand">
                  <FileText aria-hidden className="h-5 w-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="font-display text-base font-bold leading-snug text-ink">{f.postTitle}</p>
                  <p className="truncate text-sm text-muted">{f.fileName}</p>
                  <div className="mt-1.5">
                    <ExpiryChip expiresAt={f.expiresAt} />
                  </div>
                </div>
              </div>
              <Link
                href={`/teacher/posts/${f.postId}`}
                onClick={close}
                className="mt-3 flex h-12 w-full items-center justify-center gap-2 rounded-xl border border-brand bg-brand text-base font-bold text-white shadow-brand-glow transition-all hover:bg-brand-hot active:scale-[0.98]"
              >
                <Upload aria-hidden className="h-5 w-5" />
                อัปโหลดไฟล์ใหม่
              </Link>
            </li>
          ))}
        </ul>

        <div className="border-t border-line px-5 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3">
          <button
            type="button"
            onClick={close}
            className="flex h-12 w-full items-center justify-center rounded-xl border border-line-strong bg-surface text-base font-bold text-ink hover:bg-sunken"
          >
            ปิด
          </button>
        </div>
      </div>
    </dialog>
  );
}
