import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Records a login attempt for the Developer Console's login report and the lockout. Never throws.
 * `identifier` is the scrambled key of what was typed (lockKey); `reason` says why it failed.
 */
export async function logLogin(
  loginId: string,
  success: boolean,
  userId: string | null,
  extra: { identifier?: string; reason?: string } = {},
) {
  try {
    await createAdminClient()
      .from("login_events")
      .insert({ login_id: loginId, success, user_id: userId, identifier: extra.identifier ?? null, reason: extra.reason ?? null });
  } catch (e) {
    console.error("logLogin failed", e);
  }
}

/**
 * Records a sign-up event for the Developer Console's sign-up dashboard. Never throws.
 * Never pass passwords, codes or full emails in `detail` (mask them with maskEmail/maskPhone).
 */
export async function logSignup(
  kind: string,
  outcome: "ok" | "fail" | "info",
  extra: { classroomId?: string | null; registrationId?: string | null; actorId?: string | null; detail?: string } = {},
) {
  try {
    await createAdminClient()
      .from("signup_events")
      .insert({
        kind,
        outcome,
        classroom_id: extra.classroomId ?? null,
        registration_id: extra.registrationId ?? null,
        actor_id: extra.actorId ?? null,
        detail: extra.detail?.slice(0, 300) ?? null,
      });
  } catch (e) {
    console.error("logSignup failed", e);
  }
}

/**
 * Records what an admin (or a user, for their own two-step) did, for the Developer Console's audit list.
 * Never throws. Never pass passwords, codes or full emails (mask them with maskEmail/maskPhone).
 */
export async function logAudit(actorId: string | null, action: string, target?: string | null, detail?: Record<string, unknown>) {
  try {
    await createAdminClient()
      .from("audit_events")
      .insert({ actor_id: actorId, action, target: target?.slice(0, 200) ?? null, detail: detail ?? null });
  } catch (e) {
    console.error("logAudit failed", e);
  }
}

/** Records a server error for the Developer Console's error list. Never throws. */
export async function logError(route: string, error: unknown) {
  let message = String(error);
  if (error instanceof Error) {
    message = `${error.name}: ${error.message}`;
  } else if (error && typeof error === "object" && "message" in error) {
    // Supabase errors are plain objects like { code, message }, not Error instances.
    const code = "code" in error ? `${String(error.code)}: ` : "";
    message = `${code}${String(error.message)}`;
  }
  console.error(`[${route}]`, error);
  try {
    await createAdminClient().from("error_logs").insert({ route, message: message.slice(0, 2000) });
  } catch (e) {
    console.error("logError failed", e);
  }
}
