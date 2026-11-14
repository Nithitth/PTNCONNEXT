// Free-plan limits (Supabase Free + Vercel Hobby) for the Developer Console's "ขีดจำกัดระบบ" tab.
// Pure: shared numbers and formatting only. Sources and the reasoning: docs/CAPACITY.md
// (checked 2026-11-13). Free plans change: check the pricing pages and update these together.

export const MB = 1024 * 1024;
export const GB = 1024 * MB;

export const FREE_LIMITS = {
  /** Supabase: database size. */
  dbBytes: 500 * MB,
  /** Supabase: all storage buckets together. */
  storageBytes: 1 * GB,
  /** Supabase: monthly active users. */
  monthlyUsers: 50_000,
  /** Supabase Auth: sign-in requests per 5 minutes per IP (all our sign-ins come from Vercel's IP). */
  logins5min: 150,
  /** Supabase pauses a free project after this many days without use. */
  pauseDays: 7,
} as const;

/** Limits only the providers' own usage pages can show (not measurable from inside the app). */
export const PROVIDER_LIMITS = [
  {
    key: "egress",
    where: "supabase",
    label: "ดาวน์โหลดจาก Supabase ต่อเดือน",
    limit: "5 GB",
    note: "รวมการเปิดไฟล์ PDF ทุกครั้งและข้อมูลทุกหน้า หมดเป็นอย่างแรก ไฟล์ 3 MB ที่นักเรียน 200 คนเปิด ใช้ไป 600 MB",
    risk: "high",
  },
  {
    key: "invocations",
    where: "vercel",
    label: "Vercel function runs ต่อเดือน",
    limit: "1,000,000 ครั้ง",
    note: "1 หน้าใช้ประมาณ 2–4 ครั้ง รองรับประมาณ 250,000–480,000 หน้าต่อเดือน",
    risk: "medium",
  },
  {
    key: "cpu",
    where: "vercel",
    label: "Vercel CPU ต่อเดือน",
    limit: "4 ชั่วโมง",
    note: "1 หน้าใช้ประมาณ 30–50 มิลลิวินาที",
    risk: "medium",
  },
  {
    key: "bandwidth",
    where: "vercel",
    label: "Vercel traffic ต่อเดือน",
    limit: "100 GB",
    note: "ประมาณ 50 KB ต่อหน้า หรือราว 2 ล้านหน้า ไม่น่าเป็นปัญหา",
    risk: "low",
  },
] as const;

export type Level = "ok" | "watch" | "high";

/** Green under 60%, amber under 85%, red from 85%. */
export const usageLevel = (used: number, limit: number): Level => {
  const pct = limit > 0 ? used / limit : 0;
  return pct >= 0.85 ? "high" : pct >= 0.6 ? "watch" : "ok";
};

export function formatBytes(n: number): string {
  if (n >= GB) return `${(n / GB).toLocaleString("th-TH", { maximumFractionDigits: 2 })} GB`;
  if (n >= MB) return `${(n / MB).toLocaleString("th-TH", { maximumFractionDigits: 1 })} MB`;
  return `${Math.max(0, Math.round(n / 1024)).toLocaleString("th-TH")} KB`;
}

/** Supabase usage page for this project (the project ref is the first part of the public URL). */
export const supabaseUsageUrl = (supabaseUrl: string) => {
  const ref = /^https:\/\/([a-z0-9]+)\.supabase\.co/.exec(supabaseUrl)?.[1];
  return ref ? `https://supabase.com/dashboard/project/${ref}/usage` : "https://supabase.com/dashboard";
};
