// Staff PIN check. Every staff route runs this. The browser's own check is
// only for the sign in screen. The PIN arrives in the X-Staff-Pin header.
// Wrong PINs are recorded by hashed address in pin_failures: after 10 in
// 10 minutes that address is refused, right PIN or not, until the window
// passes. A right PIN clears the address's record.

import type { Context, MiddlewareHandler } from "hono";
import type { AppEnv } from "../env";
import { adminDb } from "./db";

const MAX_FAILURES = 10;
const WINDOW_MINUTES = 10;

function same(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function addressHash(c: Context<AppEnv>): Promise<string> {
  const ip = c.req.header("cf-connecting-ip") ?? "local";
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`pantry-pin:${ip}`));
  return [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

// Returns null when the PIN is right, or the response to send instead.
export async function checkPin(c: Context<AppEnv>): Promise<Response | null> {
  const db = adminDb(c.env);
  const ipHash = await addressHash(c);
  const since = new Date(Date.now() - WINDOW_MINUTES * 60_000).toISOString();
  const { count, error } = await db
    .from("pin_failures")
    .select("id", { count: "exact", head: true })
    .eq("ip_hash", ipHash)
    .gte("at", since);
  if (error) console.error("pin check read failed", error.message);
  if ((count ?? 0) >= MAX_FAILURES) {
    return c.json({ error: `Too many wrong PINs. Wait ${WINDOW_MINUTES} minutes and try again.` }, 429);
  }

  const pin = c.req.header("x-staff-pin") ?? "";
  if (!c.env.STAFF_PIN || !same(pin, c.env.STAFF_PIN)) {
    const { error: addError } = await db.from("pin_failures").insert({ ip_hash: ipHash });
    if (addError) console.error("pin failure write failed", addError.message);
    return c.json({ error: "That PIN did not work." }, 401);
  }
  if (count) await db.from("pin_failures").delete().eq("ip_hash", ipHash);
  return null;
}

export const requirePin: MiddlewareHandler<AppEnv> = async (c, next) => {
  const refused = await checkPin(c);
  if (refused) return refused;
  await next();
};
