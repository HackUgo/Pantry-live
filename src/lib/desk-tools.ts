// Two staff tools from Today: taking items off the board, and emailing
// students. Both run only behind the staff PIN (src/routes/desk.ts).
//
// Remove: deletes items from the board entirely (count, photo, and anyone
// following them, by cascade). Either chosen items, or everything that was
// scanned in today.
//
// Email: one message, written by staff, sent from the pantry's Gmail to
// students with a pickup today, students waiting on an item, or everyone
// (those two plus every student who signed up on the board). Each
// student gets their own copy so nobody sees another address. The public log
// records only how many were sent, never addresses or the message.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Env } from "../env";
import { dayStart } from "./day";
import { logEvents } from "./events";
import { sendMail, type Mail } from "./email";

export class DeskError extends Error {
  constructor(message: string, public status: 400 | 404 | 409) {
    super(message);
  }
}

export async function removeItems(env: Env, db: SupabaseClient, body: any, by: string) {
  let query = db.from("items").select("id, name");
  if (body?.today === true) {
    query = query.gte("arrived_at", dayStart(env.TIME_ZONE));
  } else {
    const ids = Array.isArray(body?.ids) ? body.ids.map((x: unknown) => String(x).slice(0, 60)).slice(0, 50) : [];
    if (!ids.length) throw new DeskError("Pick an item to remove.", 400);
    query = query.in("id", ids);
  }
  const { data, error } = await query;
  if (error) throw new Error(`remove read failed: ${error.message}`);
  if (!data?.length) throw new DeskError(body?.today ? "Nothing was scanned in today." : "That item is not on the board.", 404);

  const { error: delError } = await db.from("items").delete().in("id", data.map((i) => i.id));
  if (delError) throw new Error(`remove failed: ${delError.message}`);
  const names = data.map((i) => i.name).join(", ");
  await logEvents(db, [{ stage: "board", actor: `Desk · ${by}`, detail: `Taken off the board: ${names}` }]);
  return { removed: data.map((i) => i.name) };
}

export type Audience = "pickups" | "waiting" | "both";
const MAX_RECIPIENTS = 200;

export function cleanAudience(v: unknown): Audience {
  return v === "pickups" || v === "waiting" ? v : "both";
}

export async function recipients(env: Env, db: SupabaseClient, audience: Audience): Promise<string[]> {
  const emails = new Set<string>();
  if (audience !== "waiting") {
    const { data, error } = await db.from("reservations").select("email")
      .gte("created_at", dayStart(env.TIME_ZONE)).in("status", ["held", "done"]);
    if (error) throw new Error(`recipients read failed: ${error.message}`);
    for (const r of data ?? []) if (r.email) emails.add(String(r.email).toLowerCase());
  }
  if (audience !== "pickups") {
    const { data, error } = await db.from("follows").select("address").eq("channel", "email");
    if (error) throw new Error(`recipients read failed: ${error.message}`);
    for (const f of data ?? []) if (f.address) emails.add(String(f.address).toLowerCase());
  }
  if (audience === "both") {
    const { data, error } = await db.from("students").select("email");
    if (error) throw new Error(`recipients read failed: ${error.message}`);
    for (const s of data ?? []) if (s.email) emails.add(String(s.email).toLowerCase());
  }
  return [...emails].filter((e) => /^[^@\s]+@[^@\s]+\.edu$/.test(e)).slice(0, MAX_RECIPIENTS);
}

export function cleanMessage(v: unknown): string {
  const text = String(v ?? "").replace(/\r\n?/g, "\n").trim();
  if (!text) throw new DeskError("Write the message first.", 400);
  if (text.length > 1000) throw new DeskError("Keep it under 1,000 characters.", 400);
  return text;
}

export function broadcastMail(env: Env, origin: string, to: string, message: string): Mail {
  return {
    to,
    subject: "A message from the Student Food Pantry",
    text: `${message}\n\nStudent Food Pantry, ${env.PLACE}\n${origin}\n\nTo stop these emails, reply to this one and say stop.`,
  };
}

export async function sendBroadcast(env: Env, db: SupabaseClient, origin: string, body: any, by: string) {
  const audience = cleanAudience(body?.audience);
  const message = cleanMessage(body?.message);
  const list = await recipients(env, db, audience);
  if (!list.length) throw new DeskError("Nobody to send to yet for that choice.", 409);
  const result = await sendMail(env, list.map((to) => broadcastMail(env, origin, to, message)));
  const who = audience === "pickups" ? "students with a pickup today" : audience === "waiting" ? "students waiting on an item" : "every student on the list";
  await logEvents(db, [{ stage: "message", actor: `Desk · ${by}`, detail: `Email to ${who}: ${result.sent} sent, ${result.failed} failed` }]);
  return { sent: result.sent, failed: result.failed, total: list.length };
}
