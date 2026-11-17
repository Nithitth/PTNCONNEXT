import "server-only";
import { countedFailures, LOCK_MINUTES, type LockEvent } from "@/lib/signup";
import { createAdminClient } from "@/lib/supabase/admin";

export const LOCKED_MESSAGE = `ใส่รหัสผ่านผิดหลายครั้ง กรุณารอ ${LOCK_MINUTES} นาที หรือติดต่อผู้ดูแลระบบ`;
export const TWO_STEP_LOCKED_MESSAGE = `ใส่รหัสยืนยันผิดหลายครั้ง กรุณารอ ${LOCK_MINUTES} นาทีแล้วเข้าสู่ระบบใหม่`;

/** Wrong tries for this lockout key in the last LOCK_MINUTES that still count (see countedFailures). */
export async function failuresFor(key: string): Promise<number> {
  const admin = createAdminClient();
  const since = new Date(Date.now() - LOCK_MINUTES * 60_000).toISOString();
  const [events, unlock] = await Promise.all([
    admin
      .from("login_events")
      .select("success, reason, created_at")
      .eq("identifier", key)
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(50),
    admin.from("login_unlocks").select("created_at").eq("identifier", key).gte("created_at", since).order("created_at", { ascending: false }).limit(1),
  ]);
  if (events.error) throw events.error;
  return countedFailures((events.data ?? []) as LockEvent[], (unlock.data?.[0]?.created_at as string | undefined) ?? null);
}
