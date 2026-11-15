// Student routes. No sign in: a hold is proven by its code plus the email it
// was made with. Logic lives in src/lib/reservations.ts.
//   GET  /api/slots    pickup slots left today and whether reserving is open
//   POST /api/reserve  hold the bag under a new code
//   POST /api/release  give the items back (code and email, or code and the staff PIN)
//   POST /api/pickup   is this hold still standing (code and email)
//   POST /api/follow   Tell me: one message when an Out item is back
//   POST /api/join     onboarding: a school email for pantry news

import { Hono } from "hono";
import type { AppEnv } from "../env";
import { rateLimit } from "../lib/ratelimit";
import { adminDb } from "../lib/db";
import { isCode } from "../lib/codes";
import { checkPin } from "../lib/staff";
import { sendPickupMails } from "../lib/pickup-mail";
import { overLimit } from "../lib/limits";
import { addFollow, FollowError } from "../lib/follows";
import { joinList, JoinError } from "../lib/students";
import {
  ReservationError, cleanReserve, firstName, pickupStatus, release, reserve, slotsToday,
} from "../lib/reservations";

const student = new Hono<AppEnv>();

student.onError((err, c) => {
  if (err instanceof ReservationError || err instanceof FollowError || err instanceof JoinError) return c.json({ error: err.message }, err.status);
  console.error("student route failed", err.message);
  return c.json({ error: "Something went wrong on the server. Try again." }, 500);
});

function codeAndEmail(body: any) {
  const code = String(body?.code ?? "").trim().toUpperCase();
  const email = String(body?.email ?? "").trim().toLowerCase();
  if (!isCode(code) || !email) throw new ReservationError("No pickup is held under that code and email.", 404);
  return { code, email };
}

student.get("/slots", async (c) => {
  c.header("Cache-Control", "no-store");
  return c.json(await slotsToday(c.env, adminDb(c.env)));
});

student.post("/reserve", rateLimit("reserve"), async (c) => {
  const limited = await overLimit(c, "reserve", 30, 60);
  if (limited) return limited;
  const input = cleanReserve(await c.req.json().catch(() => null));
  const db = adminDb(c.env);
  const held = await reserve(c.env, db, input);
  // Emails go out after the answer, so Reserve never waits on Gmail.
  if (!held.repeat) {
    const slots = await slotsToday(c.env, db);
    c.executionCtx.waitUntil(sendPickupMails(c.env, db, new URL(c.req.url).origin, {
      code: held.code, name: held.name, email: input.email, closes: held.closes,
      items: held.items, left: slots.left, cap: slots.cap,
    }));
  }
  return c.json(held);
});

student.post("/release", rateLimit("reserve"), async (c) => {
  const limited = await overLimit(c, "lookup", 120, 60);
  if (limited) return limited;
  const body = await c.req.json().catch(() => null);
  // Staff with the PIN release a no show by code alone.
  const pin = c.req.header("x-staff-pin");
  if (pin !== undefined) {
    const refused = await checkPin(c);
    if (refused) return refused;
    const code = String(body?.code ?? "").trim().toUpperCase();
    if (!isCode(code)) throw new ReservationError("No pickup is held under that code.", 404);
    const by = String(body?.by_name ?? "").trim().slice(0, 40) || "Staff";
    return c.json(await release(adminDb(c.env), code, null, `Desk · ${by}`));
  }
  const { code, email } = codeAndEmail(body);
  const db = adminDb(c.env);
  const held = await pickupStatus(db, code, email);
  return c.json(await release(db, code, email, `Reserve · ${firstName(held.name)}`));
});

student.post("/pickup", rateLimit("reserve"), async (c) => {
  const limited = await overLimit(c, "lookup", 120, 60);
  if (limited) return limited;
  const { code, email } = codeAndEmail(await c.req.json().catch(() => null));
  return c.json(await pickupStatus(adminDb(c.env), code, email));
});

student.post("/follow", rateLimit("follow"), async (c) => {
  const limited = await overLimit(c, "follow", 30, 60);
  if (limited) return limited;
  return c.json(await addFollow(adminDb(c.env), await c.req.json().catch(() => null)));
});

student.post("/join", rateLimit("join"), async (c) => {
  const limited = await overLimit(c, "join", 30, 60);
  if (limited) return limited;
  const body = await c.req.json().catch(() => null);
  return c.json(await joinList(adminDb(c.env), body?.email));
});

export default student;
