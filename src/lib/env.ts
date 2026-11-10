// Public values (safe to send to the browser). Set them in .env.local — see .env.example.
export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
export const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

export const isSupabaseConfigured = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);

export const NOT_CONFIGURED_MESSAGE =
  "ระบบยังไม่ได้เชื่อมต่อฐานข้อมูล (ยังไม่ได้ตั้งค่า Supabase ใน .env.local)";
