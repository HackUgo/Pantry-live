// The desk, for staff with the PIN. Logic lives in src/lib/reservations.ts.
//   GET  /api/staff/pickups  today's holds: waiting, then done
//   POST /api/checkin        a student gave their code or name at the desk
//   POST /api/handover       tick what they took. The rest goes back
//   POST /api/staff/release-waiting  every hold still waiting goes back, students emailed
//   POST /api/staff/remove   take items off the board (chosen ones, or all scanned today)
//   GET  /api/staff/recipients, POST /api/staff/broadcast  email students
// No shows use POST /api/release with the PIN (src/routes/student.ts).

import { Hono } from "hono";
import type { AppEnv } from "../env";
import { requirePin } from "../lib/staff";
import { rateLimit } from "../lib/ratelimit";
import { adminDb } from "../lib/db";
import { isCode } from "../lib/codes";
import { ReservationError, checkIn, handOver, pickupsToday } from "../lib/reservations";
import { releaseNoShows } from "../lib/closing";
import { overLimit } from "../lib/limits";
import { DeskError, cleanAudience, recipients, removeItems, sendBroadcast } from "../lib/desk-tools";

const desk = new Hono<AppEnv>();

function staffName(v: unknown): string {
  return String(v ?? "").replace(/\s+/g, " ").trim().slice(0, 40) || "Staff";
}

function codeFrom(body: any): string {
  const code = String(body?.code ?? "").trim().toUpperCase();
  if (!isCode(code)) throw new ReservationError("No pickup is held under that code.", 404);
  return code;
}

desk.get("/staff/pickups", requirePin, async (c) => {
  c.header("Cache-Control", "no-store");
  return c.json(await pickupsToday(c.env, adminDb(c.env)));
});

desk.post("/checkin", rateLimit("desk"), requirePin, async (c) => {
  const body = await c.req.json().catch(() => null);
  await checkIn(adminDb(c.env), codeFrom(body), staffName(body?.by_name));
  return c.json({ ok: true });
});

desk.post("/handover", rateLimit("desk"), requirePin, async (c) => {
  const body = await c.req.json().catch(() => null);
  const given = Array.isArray(body?.given) ? body.given.map((g: unknown) => String(g).slice(0, 60)).slice(0, 20) : [];
  if (!given.length) throw new ReservationError("Tick what they took. If they took nothing, use Did not come.", 400);
  return c.json(await handOver(adminDb(c.env), codeFrom(body), given, staffName(body?.by_name)));
});

desk.post("/staff/release-waiting", rateLimit("desk"), requirePin, async (c) => {
  const body = await c.req.json().catch(() => null);
  const out = await releaseNoShows(c.env, adminDb(c.env), new URL(c.req.url).origin, { force: true, by: staffName(body?.by_name) });
  return c.json(out);
});

desk.onError((err, c) => {
  if (err instanceof DeskError || err instanceof ReservationError) return c.json({ error: err.message }, err.status);
  console.error("desk route failed", err.message);
  return c.json({ error: "Something went wrong on the server. Try again." }, 500);
});

// Take items off the board: { ids: [...] } or { today: true }.
desk.post("/staff/remove", rateLimit("desk"), requirePin, async (c) => {
  const body = await c.req.json().catch(() => null);
  return c.json(await removeItems(c.env, adminDb(c.env), body, staffName(body?.by_name)));
});

// How many students a message would reach, before it is sent.
desk.get("/staff/recipients", requirePin, async (c) => {
  const list = await recipients(c.env, adminDb(c.env), cleanAudience(c.req.query("audience")));
  return c.json({ count: list.length });
});

// Email students. At most 5 sends an hour from one connection.
desk.post("/staff/broadcast", rateLimit("desk"), requirePin, async (c) => {
  const limited = await overLimit(c, "broadcast", 5, 60);
  if (limited) return limited;
  const body = await c.req.json().catch(() => null);
  return c.json(await sendBroadcast(c.env, adminDb(c.env), new URL(c.req.url).origin, body, staffName(body?.by_name)));
});

export default desk;
