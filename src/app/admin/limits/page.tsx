import type { Metadata } from "next";
import { Database, ExternalLink, HardDrive, LogIn, PauseCircle, Users } from "lucide-react";
import { AdminNav } from "@/components/admin/AdminNav";
import { Container, Notice, PageHeader, cx } from "@/components/ui";
import { requireProfile } from "@/lib/auth";
import { formatDateTime } from "@/lib/calendar";
import { SUPABASE_URL } from "@/lib/env";
import { logError } from "@/lib/logs";
import { createClient } from "@/lib/supabase/server";
import { FREE_LIMITS, PROVIDER_LIMITS, formatBytes, supabaseUsageUrl, usageLevel, type Level } from "@/lib/usage";

export const metadata: Metadata = { title: "ขีดจำกัดระบบ · คอนโซลผู้พัฒนา" };

type Usage = {
  db_bytes: number;
  buckets: { bucket: string; files: number; bytes: number }[];
  accounts: number;
  peak_logins_5min: number;
  logins_30d: number;
  last_login: string | null;
  /** Whole days since the last sign-in (null when there is none). */
  idle_days: number | null;
};

const BUCKET_NAMES: Record<string, string> = { materials: "PDF ของครู", "roadmap-proofs": "หลักฐาน Roadmap" };

const BAR: Record<Level, string> = { ok: "bg-success", watch: "bg-exam", high: "bg-brand" };
const TAG: Record<Level, { text: string; className: string }> = {
  ok: { text: "ยังเหลือเยอะ", className: "bg-success-soft text-success" },
  watch: { text: "เริ่มใกล้เต็ม", className: "bg-warning-soft text-warning" },
  high: { text: "ใกล้เต็มแล้ว", className: "bg-brand-soft text-brand" },
};

/** One measured limit: a bar from 0 to the free-plan limit. */
function Meter({
  Icon,
  label,
  used,
  limit,
  usedText,
  limitText,
  note,
  children,
}: {
  Icon: typeof Database;
  label: string;
  used: number;
  limit: number;
  usedText: string;
  limitText: string;
  note: string;
  children?: React.ReactNode;
}) {
  const level = usageLevel(used, limit);
  const pct = Math.min(100, (used / limit) * 100);
  return (
    <li className="rounded-2xl border border-line bg-surface p-5 shadow-soft-sm">
      <div className="flex items-start gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-brand-soft text-brand">
          <Icon aria-hidden className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="font-display text-base font-bold text-ink">{label}</h3>
            <span className={cx("rounded-full px-2.5 py-0.5 text-xs font-bold", TAG[level].className)}>{TAG[level].text}</span>
          </div>
          <p className="mt-1 text-sm text-muted">
            <b className="font-display text-xl font-extrabold tabular-nums text-ink">{usedText}</b> จาก {limitText}
            <span className="ml-1.5 tabular-nums">({pct < 1 && used > 0 ? "<1" : Math.round(pct)}%)</span>
          </p>
        </div>
      </div>
      <div
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(pct)}
        className="relative mt-4 h-3 overflow-hidden rounded-full bg-sunken"
      >
        <div className={cx("h-full rounded-full transition-[width] duration-700", BAR[level])} style={{ width: `${Math.max(pct, used > 0 ? 1 : 0)}%` }} />
        {[60, 85].map((m) => (
          <span key={m} aria-hidden className="absolute inset-y-0 w-px bg-ink/15" style={{ left: `${m}%` }} />
        ))}
      </div>
      <p className="mt-2 text-xs leading-relaxed text-muted">{note}</p>
      {children}
    </li>
  );
}

/** Developer Console → ขีดจำกัดระบบ: how close the site is to the free plans' limits. */
export default async function LimitsPage() {
  await requireProfile({ roles: ["admin"] });
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("admin_usage");
  if (error) await logError("admin/limits", error);
  const u = (data ?? null) as Usage | null;

  const storageBytes = (u?.buckets ?? []).reduce((n, b) => n + Number(b.bytes), 0);
  const idleDays = u?.idle_days ?? null;
  const supabaseUsage = supabaseUsageUrl(SUPABASE_URL);

  return (
    <Container className="py-10">
      <PageHeader eyebrow="ผู้ดูแลระบบ" title="ขีดจำกัดระบบ" subtitle="เว็บใช้แพ็กเกจฟรีของ Supabase และ Vercel หน้านี้บอกว่าใช้ไปเท่าไรแล้ว" />
      <AdminNav />

      {!u ? (
        <Notice tone="error">
          อ่านข้อมูลการใช้งานไม่ได้ ถ้ายังไม่ได้รัน migration 0015_admin_usage.sql ใน Supabase ให้รันก่อน แล้วรีเฟรชหน้านี้
        </Notice>
      ) : (
        <>
          <h2 className="mb-1 font-display text-lg font-bold text-ink">วัดจากระบบตอนนี้</h2>
          <p className="mb-4 text-sm text-muted">สีเขียว = ต่ำกว่า 60% · สีเหลือง = 60–85% · สีแดง = เกิน 85% ของแพ็กเกจฟรี</p>
          <ul className="grid gap-3 md:grid-cols-2 md:gap-4">
            <Meter
              Icon={HardDrive}
              label="พื้นที่เก็บไฟล์"
              used={storageBytes}
              limit={FREE_LIMITS.storageBytes}
              usedText={formatBytes(storageBytes)}
              limitText="1 GB"
              note="PDF ของครูและหลักฐาน Roadmap ใช้พื้นที่ร่วมกัน PDF ของครูถูกลบอัตโนมัติหลัง 180 วัน"
            >
              {u.buckets.length > 0 && (
                <ul className="mt-3 space-y-1 border-t border-line pt-3 text-xs text-muted">
                  {u.buckets.map((b) => (
                    <li key={b.bucket} className="flex justify-between gap-2">
                      <span>{BUCKET_NAMES[b.bucket] ?? b.bucket}</span>
                      <span className="tabular-nums">
                        {Number(b.files).toLocaleString("th-TH")} ไฟล์ · {formatBytes(Number(b.bytes))}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </Meter>
            <Meter
              Icon={Database}
              label="ขนาดฐานข้อมูล"
              used={u.db_bytes}
              limit={FREE_LIMITS.dbBytes}
              usedText={formatBytes(u.db_bytes)}
              limitText="500 MB"
              note="รวมระบบพื้นฐานของ Supabase ด้วย ประวัติการเข้าสู่ระบบโตปีละประมาณ 60 MB"
            />
            <Meter
              Icon={LogIn}
              label="เข้าสู่ระบบพร้อมกันสูงสุด (ใน 5 นาที)"
              used={u.peak_logins_5min}
              limit={FREE_LIMITS.logins5min}
              usedText={`${u.peak_logins_5min.toLocaleString("th-TH")} ครั้ง`}
              limitText="150 ครั้ง / 5 นาที"
              note={`ช่วงที่คนเข้าสู่ระบบมากที่สุดใน 7 วันที่ผ่านมา ถ้าเกินขีดนี้ คนที่เหลือจะต้องรอ ระวังวันเปิดใช้ครั้งแรก (30 วันที่ผ่านมา: ${u.logins_30d.toLocaleString("th-TH")} ครั้ง)`}
            />
            <Meter
              Icon={Users}
              label="บัญชีผู้ใช้"
              used={u.accounts}
              limit={FREE_LIMITS.monthlyUsers}
              usedText={`${u.accounts.toLocaleString("th-TH")} บัญชี`}
              limitText="50,000 คนต่อเดือน"
              note="ทั้งโรงเรียนใช้ได้สบาย"
            />
            <Meter
              Icon={PauseCircle}
              label="ไม่มีคนใช้งานติดต่อกัน"
              used={idleDays ?? 0}
              limit={FREE_LIMITS.pauseDays}
              usedText={idleDays === null ? "ยังไม่มีข้อมูล" : `${idleDays.toLocaleString("th-TH")} วัน`}
              limitText="7 วัน"
              note={`Supabase หยุดโปรเจกต์ฟรีเมื่อไม่มีใครใช้ 7 วัน (เช่น ช่วงปิดเทอม) ต้องกด Restore ในหน้า Supabase${
                u.last_login ? ` · เข้าสู่ระบบล่าสุด ${formatDateTime(u.last_login)}` : ""
              }`}
            />
          </ul>
        </>
      )}

      <h2 className="mb-1 mt-10 font-display text-lg font-bold text-ink">ต้องดูในหน้าของผู้ให้บริการ</h2>
      <p className="mb-4 text-sm text-muted">ตัวเลขเหล่านี้เว็บอ่านเองไม่ได้ กดลิงก์เพื่อดูกราฟการใช้งานจริงของเดือนนี้</p>
      <ul className="grid gap-3 md:grid-cols-2 md:gap-4">
        {PROVIDER_LIMITS.map((p) => (
          <li key={p.key} className="flex flex-col rounded-2xl border border-line bg-surface p-5 shadow-soft-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="font-display text-base font-bold text-ink">{p.label}</h3>
              <span
                className={cx(
                  "rounded-full px-2.5 py-0.5 text-xs font-bold",
                  p.risk === "high" ? "bg-brand-soft text-brand" : p.risk === "medium" ? "bg-warning-soft text-warning" : "bg-success-soft text-success",
                )}
              >
                {p.risk === "high" ? "หมดก่อนอย่างอื่น" : p.risk === "medium" ? "ควรดูทุกเดือน" : "ไม่น่าห่วง"}
              </span>
            </div>
            <p className="mt-1 text-sm text-muted">
              ขีดจำกัด <b className="text-ink">{p.limit}</b>
            </p>
            <p className="mt-2 flex-1 text-xs leading-relaxed text-muted">{p.note}</p>
            <a
              href={p.where === "supabase" ? supabaseUsage : "https://vercel.com/dashboard"}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-3 inline-flex items-center gap-1.5 text-sm font-bold text-brand hover:underline"
            >
              <ExternalLink aria-hidden className="h-4 w-4" />
              {p.where === "supabase" ? "เปิดหน้า Usage ของ Supabase" : "เปิด Vercel แล้วเลือกเมนู Usage"}
            </a>
          </li>
        ))}
      </ul>

      <p className="mt-8 text-xs text-faint">ตัวเลขขีดจำกัดตรวจสอบเมื่อ 13 พ.ย. 2569 แพ็กเกจฟรีอาจเปลี่ยนได้ รายละเอียดอยู่ใน docs/CAPACITY.md</p>
    </Container>
  );
}
