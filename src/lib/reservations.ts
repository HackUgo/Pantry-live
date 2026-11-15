// Reservations: a student holds items at the desk under a 4 character code.
// The counting happens in Postgres (reserve_items, release_reservation) so the
// daily cap and the shelf counts hold even when phones race. This file turns
// requests into those calls, picks the code, logs the event and turns
// database refusals into plain sentences.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Env } from "../env";
import { dayStart } from "./day";
import { pickupWindow } from "./hours";
import { logEvents } from "./events";
import { newCode } from "./codes";

export const DAILY_CAP = 20;
const MAX_LINES = 15;
const MAX_EACH = 10;

export class ReservationError extends Error {
  constructor(message: string, public status: 400 | 404 | 409) {
    super(message);
  }
}

export type HeldItem = { id: string; name: string; category: string; unit: string; n: number; left?: number; after?: number };

// The log shows a first name only. Emails never go in the log.
export function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] || "Student";
}

export async function slotsToday(env: Env, db: SupabaseClient) {
  const { count, error } = await db
    .from("reservations")
    .select("id", { count: "exact", head: true })
    .gte("created_at", dayStart(env.TIME_ZONE))
    .neq("status", "released");
  if (error) throw new Error(`slots read failed: ${error.message}`);
  const taken = count ?? 0;
  const window = pickupWindow(env.PANTRY_HOURS, env.TIME_ZONE);
  return { cap: DAILY_CAP, taken, left: Math.max(0, DAILY_CAP - taken), open: window.ok, closes: window.closes, opens: window.opens };
}

type ReserveInput = { name: string; email: string; items: { id: string; n: number }[]; request: string | null };

export function cleanReserve(body: any): ReserveInput {
  const name = String(body?.name ?? "").replace(/\s+/g, " ").trim().slice(0, 40);
  const email = String(body?.email ?? "").trim().toLowerCase();
  if (!name) throw new ReservationError("Add your name, as the desk knows you.", 400);
  if (!/^[^@\s]+@cmich\.edu$/.test(email)) throw new ReservationError("Use your CMU email, the one ending in @cmich.edu.", 400);
  const merged = new Map<string, number>();
  for (const line of Array.isArray(body?.items) ? body.items : []) {
    const id = String(line?.id ?? "").slice(0, 60);
    const n = Number(line?.n);
    if (!id || !Number.isInteger(n) || n < 1 || n > MAX_EACH) continue;
    merged.set(id, (merged.get(id) ?? 0) + n);
  }
  if (!merged.size) throw new ReservationError("Your bag is empty.", 400);
  if (merged.size > MAX_LINES) throw new ReservationError(`At most ${MAX_LINES} items per pickup.`, 400);
  const request = typeof body?.request_id === "string" ? body.request_id.slice(0, 64) : null;
  return { name, email, items: [...merged].map(([id, n]) => ({ id, n })), request };
}

function refusal(message: string): ReservationError {
  if (message.includes("cap")) return new ReservationError(`All ${DAILY_CAP} pickup slots are taken today. You can still walk in.`, 409);
  const short = message.match(/short:(.+)/);
  if (short) return new ReservationError(`There is not enough ${short[1].trim().toLowerCase()} on the shelf now. Change your bag and try again.`, 409);
  const limit = message.match(/limit:(.+)/);
  if (limit) return new ReservationError(`That is more ${limit[1].trim().toLowerCase()} than one pickup allows.`, 409);
  if (message.includes("gone:")) return new ReservationError("Something in your bag is no longer on the board. Remove it and try again.", 409);
  if (message.includes("request mismatch")) return new ReservationError("That request was already used. Tap Reserve again.", 409);
  return new ReservationError("The hold did not go through. Try again.", 409);
}

export async function reserve(env: Env, db: SupabaseClient, input: ReserveInput) {
  const window = pickupWindow(env.PANTRY_HOURS, env.TIME_ZONE);
  if (!window.ok) {
    throw new ReservationError(window.opens ? `The pantry is closed now. Reserve again from ${window.opens}.` : "The pantry is closed now.", 409);
  }

  // A new code each try. A clash with an old code just draws again.
  for (let attempt = 0; attempt < 4; attempt++) {
    const code = newCode();
    const { data, error } = await db.rpc("reserve_items", {
      p_code: code, p_name: input.name, p_email: input.email, p_items: input.items,
      p_since: dayStart(env.TIME_ZONE), p_cap: DAILY_CAP, p_request: input.request,
    });
    if (error) {
      if (error.code === "23505" && /one_hold_per_email/.test(error.message)) {
        throw new ReservationError("This email already has items held. Pick them up or release them first.", 409);
      }
      if (error.code === "23505" && /code/.test(error.message)) continue;
      if (error.code === "P0001") throw refusal(error.message);
      throw new Error(`reserve_items failed: ${error.message}`);
    }
    const items: HeldItem[] = data.items;
    if (!data.repeat) {
      await logEvents(db, [{
        stage: "reserve",
        actor: `Reserve · ${firstName(input.name)}`,
        detail: `${firstName(input.name)} held ${items.map((i) => `${i.name} ${i.n}`).join(", ")}. Board shows ${items.map((i) => i.left).join(", ")}`,
      }]);
    }
    return {
      code: data.code as string, name: data.name as string, items, created_at: data.created_at as string,
      closes: window.closes, place: env.PLACE, repeat: Boolean(data.repeat),
    };
  }
  throw new Error("reserve_items kept drawing taken codes");
}

// p_email null means staff (PIN already checked). A student must send the email it was held under.
export async function release(db: SupabaseClient, code: string, email: string | null, actor: string) {
  const { data, error } = await db.rpc("release_reservation", { p_code: code, p_email: email });
  if (error) {
    if (error.code === "P0002") throw new ReservationError("No pickup is held under that code and email.", 404);
    if (/closed:released/.test(error.message)) return { code, already: true, items: [] as HeldItem[] };
    if (/closed:done/.test(error.message)) throw new ReservationError("Those items were already handed over.", 409);
    throw new Error(`release_reservation failed: ${error.message}`);
  }
  const items: HeldItem[] = data.items;
  await logEvents(db, [{
    stage: email ? "reserve" : "handover",
    actor,
    detail: `${firstName(data.name)}'s hold released: ${items.map((i) => `${i.name} ${i.n}`).join(", ")} back on the board. Board shows ${items.map((i) => i.after).join(", ")}`,
  }]);
  return { code: data.code as string, already: false, items, name: data.name as string };
}

// The code screen asks whether its hold still stands. Only the right email gets an answer.
export async function pickupStatus(db: SupabaseClient, code: string, email: string) {
  const { data, error } = await db
    .from("reservations")
    .select("code, name, email, items, status, created_at, closed_at")
    .eq("code", code)
    .maybeSingle();
  if (error) throw new Error(`pickup read failed: ${error.message}`);
  if (!data || data.email !== email.toLowerCase()) throw new ReservationError("No pickup is held under that code and email.", 404);
  const { email: _hidden, ...rest } = data;
  return rest;
}

// The desk's list: today's holds, waiting first, then the ones handed over.
export async function pickupsToday(env: Env, db: SupabaseClient) {
  const { data, error } = await db
    .from("reservations")
    .select("code, name, items, status, created_at, closed_at")
    .gte("created_at", dayStart(env.TIME_ZONE))
    .in("status", ["held", "done"])
    .order("created_at", { ascending: false });
  if (error) throw new Error(`pickups read failed: ${error.message}`);
  return {
    waiting: (data ?? []).filter((r) => r.status === "held"),
    done: (data ?? []).filter((r) => r.status === "done")
      .sort((a, b) => Date.parse(b.closed_at ?? "") - Date.parse(a.closed_at ?? "")),
  };
}

// The public log names the student by first name only. Codes never go in it.
export async function checkIn(db: SupabaseClient, code: string, by: string) {
  const { data } = await db.from("reservations").select("name").eq("code", code).maybeSingle();
  await logEvents(db, [{ stage: "code", actor: `Desk · ${by}`, detail: `${firstName(data?.name ?? "")} checked in` }]);
}

// Staff tick what the student took. The rest goes back on the board.
export async function handOver(db: SupabaseClient, code: string, given: string[], by: string) {
  const { data, error } = await db.rpc("handover_reservation", { p_code: code, p_given: given });
  if (error) {
    if (error.code === "P0002") throw new ReservationError("No pickup is held under that code.", 404);
    if (/closed:done/.test(error.message)) throw new ReservationError("That pickup was already handed over.", 409);
    if (/closed:released/.test(error.message)) throw new ReservationError("Those items were released back to the board.", 409);
    throw new Error(`handover_reservation failed: ${error.message}`);
  }
  const back: HeldItem[] = data.back;
  const kept = (data.given as HeldItem[]).length;
  const extra = back.length ? `. ${back.map((i) => `${i.name} ${i.n}`).join(", ")} back on the board` : "";
  await logEvents(db, [{
    stage: "handover",
    actor: `Desk · ${by}`,
    detail: `${firstName(data.name)} handed over, ${kept} of ${data.total}${extra}`,
  }]);
  return { code: data.code as string, given: data.given as HeldItem[], back };
}
