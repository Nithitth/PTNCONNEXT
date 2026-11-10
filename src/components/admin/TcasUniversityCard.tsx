"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, CloudDownload, Send } from "lucide-react";
import { publishUniversity, pullUniversity } from "@/app/admin/tcas/actions";
import { Notice, cx, smallButtonStyles } from "@/components/ui";

export type StagingSummary = {
  count: number;
  pulledAt: string;
  added: string[];
  changed: string[];
  removed: string[];
  problems: { name: string; reason: string }[];
};

type Props = {
  id: string;
  name: string;
  liveCount: number;
  lastPublish: { at: string; by: string | null; added: number; changed: number; removed: number } | null;
  staging: StagingSummary | null;
};

const SHOW = 20;

function NameList({ title, names, tone }: { title: string; names: string[]; tone: "success" | "brand" | "danger" }) {
  if (names.length === 0) return null;
  return (
    <details className="rounded-xl border border-line bg-sunken px-3 py-2 text-sm">
      <summary className="cursor-pointer font-bold text-ink">
        {title}{" "}
        <span className={cx("tabular-nums", tone === "success" && "text-success", tone === "brand" && "text-brand", tone === "danger" && "text-danger")}>
          {names.length.toLocaleString("th-TH")}
        </span>
      </summary>
      <ul className="mt-2 space-y-1 text-muted">
        {names.slice(0, SHOW).map((n, i) => (
          <li key={`${n}-${i}`} className="leading-snug">
            {n}
          </li>
        ))}
        {names.length > SHOW && <li>และอีก {(names.length - SHOW).toLocaleString("th-TH")} หลักสูตร</li>}
      </ul>
    </details>
  );
}

/** One university on the "ข้อมูล TCAS" tab: pull → review → publish. */
export function TcasUniversityCard({ id, name, liveCount, lastPublish, staging }: Props) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [busy, setBusy] = useState<"pull" | "publish" | null>(null);
  const [message, setMessage] = useState<{ tone: "success" | "error"; text: string } | null>(null);

  const run = (kind: "pull" | "publish") =>
    start(async () => {
      setBusy(kind);
      setMessage(null);
      const res = kind === "pull" ? await pullUniversity(id) : await publishUniversity(id);
      setBusy(null);
      if (res.error) setMessage({ tone: "error", text: res.error });
      else if (kind === "pull")
        setMessage({ tone: "success", text: `ดึงข้อมูลแล้ว ${res.pulled?.toLocaleString("th-TH")} หลักสูตร ตรวจรายการด้านล่างก่อนเผยแพร่` });
      else
        setMessage({
          tone: "success",
          text: `เผยแพร่แล้ว: ใหม่ ${res.added} · เปลี่ยน ${res.changed} · ไม่มีในข้อมูลล่าสุด ${res.removed}`,
        });
      router.refresh();
    });

  return (
    <section className="rounded-2xl border border-line bg-surface p-5 shadow-soft-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="font-display text-lg font-bold text-ink">{name}</h2>
          <p className="mt-0.5 text-sm text-muted">
            เผยแพร่อยู่ <b className="tabular-nums text-ink">{liveCount.toLocaleString("th-TH")}</b> หลักสูตร
            {lastPublish && (
              <>
                {" "}
                · ล่าสุด {lastPublish.at}
                {lastPublish.by && ` โดย ${lastPublish.by}`} (ใหม่ {lastPublish.added} · เปลี่ยน {lastPublish.changed} · ไม่มีในข้อมูลล่าสุด{" "}
                {lastPublish.removed})
              </>
            )}
          </p>
        </div>
        <div className="flex shrink-0 gap-1.5">
          <button type="button" disabled={pending} onClick={() => run("pull")} className={smallButtonStyles}>
            <CloudDownload aria-hidden className="h-4 w-4" />
            {busy === "pull" ? "กำลังดึง…" : "ดึงข้อมูลจาก TCAS"}
          </button>
          <button
            type="button"
            disabled={pending || !staging}
            onClick={() => run("publish")}
            className={cx(
              "inline-flex h-9 items-center gap-1.5 rounded-lg px-3 text-sm font-bold text-white transition-all duration-150 active:scale-[0.97] disabled:opacity-50",
              "bg-brand shadow-brand-glow hover:bg-brand-hover",
            )}
          >
            <Send aria-hidden className="h-4 w-4" />
            {busy === "publish" ? "กำลังเผยแพร่…" : "เผยแพร่"}
          </button>
        </div>
      </div>

      {message && (
        <div className="mt-3">
          <Notice tone={message.tone}>{message.text}</Notice>
        </div>
      )}

      {staging && (
        <div className="mt-4 space-y-2">
          <p className="text-sm font-bold text-ink">
            รอเผยแพร่ {staging.count.toLocaleString("th-TH")} หลักสูตร{" "}
            <span className="font-normal text-muted">(ดึงเมื่อ {staging.pulledAt})</span>
          </p>
          <NameList title="หลักสูตรใหม่" names={staging.added} tone="success" />
          <NameList title="ข้อมูลเปลี่ยน" names={staging.changed} tone="brand" />
          <NameList title="ไม่มีในข้อมูลล่าสุด (จะถูกซ่อน)" names={staging.removed} tone="danger" />
          {staging.problems.length > 0 && (
            <details className="rounded-xl border border-line bg-sunken px-3 py-2 text-sm">
              <summary className="cursor-pointer font-bold text-ink">
                <AlertTriangle aria-hidden className="mr-1 inline h-4 w-4 text-warning" />
                มีเกณฑ์พิเศษ (ไม่มีเครื่องคำนวณ){" "}
                <span className="tabular-nums text-muted">{staging.problems.length.toLocaleString("th-TH")}</span>
              </summary>
              <ul className="mt-2 space-y-1 text-muted">
                {staging.problems.slice(0, SHOW).map((p, i) => (
                  <li key={i} className="leading-snug">
                    {p.name} — <span className="text-ink">{p.reason}</span>
                  </li>
                ))}
                {staging.problems.length > SHOW && <li>และอีก {staging.problems.length - SHOW} หลักสูตร</li>}
              </ul>
            </details>
          )}
          {staging.added.length + staging.changed.length + staging.removed.length === 0 && (
            <p className="text-sm text-muted">ข้อมูลเหมือนกับที่เผยแพร่อยู่แล้ว</p>
          )}
        </div>
      )}
    </section>
  );
}
