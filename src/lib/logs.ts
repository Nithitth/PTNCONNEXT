import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

/** Records a login attempt for the Developer Console's login report. Never throws. */
export async function logLogin(loginId: string, success: boolean, userId: string | null) {
  try {
    await createAdminClient().from("login_events").insert({ login_id: loginId, success, user_id: userId });
  } catch (e) {
    console.error("logLogin failed", e);
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
