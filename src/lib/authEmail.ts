import "server-only";
import { hiddenEmailFor, lockKeyFor, loginEmailSecretFrom } from "@/lib/authEmailCore";

/** The hidden Supabase Auth email for a login ID (server only; see authEmailCore.ts). */
export const loginIdToEmail = (loginId: string) => hiddenEmailFor(loginId, loginEmailSecretFrom(process.env));

/** The lockout key for a typed log-in identifier. */
export const lockKey = (kind: string, value: string) => lockKeyFor(kind, value, loginEmailSecretFrom(process.env));
