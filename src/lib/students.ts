// The board's one onboarding step: a student gives their school email so the
// pantry can email them news. Any .edu address. Stored once per address,
// readable only by the Worker.

import type { SupabaseClient } from "@supabase/supabase-js";

export class JoinError extends Error {
  status = 400 as const;
}

export function cleanSchoolEmail(v: unknown): string {
  const email = String(v ?? "").trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.edu$/.test(email) || email.length > 120) {
    throw new JoinError("Use your school email, the one ending in .edu.");
  }
  return email;
}

export async function joinList(db: SupabaseClient, raw: unknown) {
  const email = cleanSchoolEmail(raw);
  const { error } = await db.from("students").insert({ email });
  // Already on the list is fine.
  if (error && error.code !== "23505") throw new Error(`join failed: ${error.message}`);
  return { ok: true };
}
