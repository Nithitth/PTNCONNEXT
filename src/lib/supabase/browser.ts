"use client";

import { createBrowserClient } from "@supabase/ssr";
import { SUPABASE_ANON_KEY, SUPABASE_URL } from "@/lib/env";

/**
 * Supabase client for the browser. Acts as the signed-in user (RLS applies).
 * Used only for uploading PDFs straight to Storage: files up to 10 MB are too
 * big to pass through a Next.js server action (1 MB limit).
 */
export function createBrowserSupabase() {
  return createBrowserClient(SUPABASE_URL, SUPABASE_ANON_KEY);
}
