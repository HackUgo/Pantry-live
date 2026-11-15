// Supabase client for the Worker. Uses the service role key, so it bypasses
// RLS: every write in the app comes through here and nowhere else.

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Env } from "../env";

export function adminDb(env: Env): SupabaseClient {
  return createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
