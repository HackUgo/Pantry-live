// The event log. One row per step. The system page and donor numbers read it.
// Logging never breaks the step it describes, so failures are only printed.
// Never put an email address or a push subscription in a detail.

import type { SupabaseClient } from "@supabase/supabase-js";

export type Stage = "scan" | "read" | "board" | "message" | "reserve" | "code" | "handover" | "log";
export type EventRow = { stage: Stage; actor: string; detail: string };

export async function logEvents(db: SupabaseClient, rows: EventRow[]): Promise<void> {
  if (!rows.length) return;
  const { error } = await db.from("events").insert(rows);
  if (error) console.error("event log failed", error.message);
}
