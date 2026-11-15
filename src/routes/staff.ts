// Staff routes under /api. Each one checks the PIN in the Worker.
//   POST /api/staff/check   the sign in screen asks if a PIN is right
//   GET  /api/staff/today   pickups waiting, reservations today, followers per item
//   POST /api/scan          photo in, items with boxes and counts out

import { Hono } from "hono";
import type { AppEnv } from "../env";
import { requirePin } from "../lib/staff";
import { rateLimit } from "../lib/ratelimit";
import { adminDb } from "../lib/db";
import { dayStart } from "../lib/day";
import { readPhoto, ReaderError } from "../lib/reader";
import { DAILY_CAP } from "../lib/reservations";

const MAX_IMAGE_CHARS = 4_000_000; // about 3 MB of JPEG once decoded

const staff = new Hono<AppEnv>();

staff.post("/staff/check", rateLimit("pin"), requirePin, (c) => c.json({ ok: true }));

staff.get("/staff/today", requirePin, async (c) => {
  const db = adminDb(c.env);
  const since = dayStart(c.env.TIME_ZONE);
  const [res, fol] = await Promise.all([
    db.from("reservations").select("status").gte("created_at", since),
    db.from("follows").select("item_id"),
  ]);
  if (res.error || fol.error) {
    console.error("today read failed", res.error?.message ?? fol.error?.message);
    return c.json({ error: "Could not read today's pickups." }, 500);
  }
  const rows = res.data ?? [];
  const followers: Record<string, number> = {};
  for (const f of fol.data ?? []) followers[f.item_id] = (followers[f.item_id] ?? 0) + 1;
  return c.json({
    waiting: rows.filter((r) => r.status === "held").length,
    today: rows.filter((r) => r.status !== "released").length,
    cap: DAILY_CAP,
    followers,
  });
});

staff.post("/scan", rateLimit("scan"), requirePin, async (c) => {
  const body = await c.req.json().catch(() => null);
  const image = body?.image_base64;
  if (typeof image !== "string" || image.length < 1000) {
    return c.json({ error: "No photo came through. Take it again." }, 400);
  }
  if (image.length > MAX_IMAGE_CHARS) {
    return c.json({ error: "That photo is too large. Take it again." }, 413);
  }

  const existing = Array.isArray(body?.existing_items)
    ? body.existing_items.map((n: unknown) => String(n).slice(0, 40)).slice(0, 300)
    : [];
  const width = Math.round(Number(body?.width));
  const height = Math.round(Number(body?.height));
  if (!(width > 0 && width <= 4000 && height > 0 && height <= 4000)) {
    return c.json({ error: "The photo size did not come through. Take it again." }, 400);
  }

  // Only a real JPEG is stored, and only by the Worker: nobody else can write to the bucket.
  let bytes: Uint8Array;
  try {
    bytes = Uint8Array.from(atob(image), (ch) => ch.charCodeAt(0));
  } catch {
    return c.json({ error: "That photo did not come through. Take it again." }, 400);
  }
  if (bytes.length > 5 * 1024 * 1024 || bytes[0] !== 0xff || bytes[1] !== 0xd8 || bytes[2] !== 0xff) {
    return c.json({ error: "That photo did not come through. Take it again." }, 400);
  }
  const path = `${new Date().toISOString().slice(0, 10)}/${crypto.randomUUID()}.jpg`;
  const bucket = adminDb(c.env).storage.from("scans");

  try {
    const [items, stored] = await Promise.all([
      readPhoto(c.env, image, existing, width, height),
      bucket.upload(path, bytes, { contentType: "image/jpeg", cacheControl: "31536000", upsert: false }),
    ]);
    if (stored.error) {
      console.error("photo store failed", stored.error.message);
      return c.json({ error: "The photo did not save. Take it again." }, 502);
    }
    return c.json({ items, photo_url: bucket.getPublicUrl(path).data.publicUrl });
  } catch (err) {
    if (err instanceof ReaderError) return c.json({ error: err.message }, 502);
    throw err;
  }
});

export default staff;
