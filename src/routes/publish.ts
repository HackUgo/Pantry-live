// Put on the board, and take it back.
//   POST /api/publish  staff confirmed the review: add the counts, attach the
//                      photo, log scan, read and board, tell followers
//   POST /api/undo     within 60 seconds: reverse the scan, send corrections
// Both check the PIN in the Worker. The count changes run in Postgres
// functions (scan_in, undo_scan) so two phones never trample each other.

import { Hono } from "hono";
import type { AppEnv } from "../env";
import { requirePin } from "../lib/staff";
import { rateLimit } from "../lib/ratelimit";
import { adminDb } from "../lib/db";
import { logEvents, type EventRow } from "../lib/events";
import { tellFollowers, sendCorrections, type Told } from "../lib/notify";
import { cleanPublish, cleanName, PublishError } from "../lib/scanin";

type ScanItem = {
  id: string; name: string; unit: string; count: number; before: number; after: number; created: boolean;
  best_by: string | null;
};

function plural(n: number, one: string, many = `${one}s`) {
  return `${n} ${n === 1 ? one : many}`;
}

const publish = new Hono<AppEnv>();

publish.post("/publish", rateLimit("publish"), requirePin, async (c) => {
  let input;
  try {
    input = cleanPublish(await c.req.json().catch(() => null), c.env.SUPABASE_URL);
  } catch (err) {
    if (err instanceof PublishError) return c.json({ error: err.message }, 400);
    throw err;
  }
  const { photo, by, items, request } = input;
  const db = adminDb(c.env);
  const { data, error } = await db.rpc("scan_in", { p_items: items, p_photo: photo, p_by: by, p_request: request });
  if (error || !data) {
    console.error("scan_in failed", error?.message);
    return c.json({ error: "The board did not take it. Try again." }, 500);
  }
  const scanId: number = data.scan_id;
  const done: ScanItem[] = data.items;

  // A retried tap: the first one already counted and told. Same answer, nothing new.
  if (data.repeat) {
    const toldBefore: Told[] = Array.isArray(data.told) ? data.told : [];
    return c.json({
      scan_id: scanId, at: data.at, by,
      items: done.map((i) => ({ id: i.id, name: i.name, unit: i.unit, qty: i.after, before: i.before })),
      told: { students: toldBefore.length, about: [...new Set(toldBefore.map((t) => t.name))], sent: toldBefore.length, failed: 0 },
    });
  }

  const dayLabel = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
  const list = done.map((i) => `${i.name} ${i.count}${i.best_by ? ` (best by ${dayLabel(i.best_by)})` : ""}`).join(", ");
  const moves = done.map((i) => `${i.name} ${i.before > 0 ? i.before : i.created ? "0" : "Out"} → ${i.after}`).join(", ");
  const events: EventRow[] = [
    { stage: "scan", actor: `Phone · ${by}`, detail: `Photographed ${plural(done.length, "item")}, scan in` },
    { stage: "read", actor: "Reader", detail: `${list}. Confirmed by ${by}` },
    { stage: "board", actor: "Board", detail: `${moves}, photo attached` },
  ];

  // Items that were Out and now have a number: their followers hear now.
  const arrivals = done.filter((i) => i.before <= 0 && i.after > 0)
    .map((i) => ({ id: i.id, name: i.name, unit: i.unit, after: i.after }));
  const origin = new URL(c.req.url).origin;
  const told = await tellFollowers(c.env, db, origin, arrivals);

  if (told.students) {
    const parts = [
      told.emailsSent ? plural(told.emailsSent, "email") : "",
      told.pingsSent ? plural(told.pingsSent, "ping") : "",
    ].filter(Boolean);
    const about = [...new Set(told.told.map((t) => t.name))].join(", ");
    events.push({
      stage: "message",
      actor: "Messages",
      detail: `${parts.length ? parts.join(" and ") : "Nothing"} sent: ${about} just arrived. ${told.failed} failed`,
    });
    const { error: keepError } = await db.from("scans").update({ told: told.told }).eq("id", scanId);
    if (keepError) console.error("scan told save failed", keepError.message);
  }
  await logEvents(db, events);

  return c.json({
    scan_id: scanId,
    at: data.at,
    by,
    items: done.map((i) => ({ id: i.id, name: i.name, unit: i.unit, qty: i.after, before: i.before })),
    told: { students: told.students, about: [...new Set(told.told.map((t) => t.name))], sent: told.sent, failed: told.failed },
  });
});

publish.post("/undo", rateLimit("publish"), requirePin, async (c) => {
  const body = await c.req.json().catch(() => null);
  const scanId = Number(body?.scan_id);
  const by = cleanName(body?.by_name) || "Staff";
  if (!Number.isInteger(scanId) || scanId < 1) return c.json({ error: "Which scan?" }, 400);

  const db = adminDb(c.env);
  const { data, error } = await db.rpc("undo_scan", { p_scan: scanId });
  if (error) {
    if (/too late/.test(error.message)) return c.json({ error: "The 60 seconds are up. Scan again to fix the count." }, 409);
    if (/already undone/.test(error.message)) return c.json({ error: "That scan is already pulled back." }, 409);
    if (/not found/.test(error.message)) return c.json({ error: "That scan is not on record." }, 404);
    console.error("undo_scan failed", error.message);
    return c.json({ error: "The undo did not go through. Try again." }, 500);
  }

  const told: Told[] = Array.isArray(data.told) ? data.told : [];
  const fix = await sendCorrections(c.env, db, new URL(c.req.url).origin, told);
  const moves = (data.items as { name: string; qty: number | null; removed: boolean }[])
    .map((i) => `${i.name} ${i.removed ? "off the board" : i.qty ? `→ ${i.qty}` : "→ Out"}`).join(", ");
  const events: EventRow[] = [{ stage: "board", actor: `Phone · ${by}`, detail: `Scan pulled back: ${moves}` }];
  if (told.length) {
    events.push({ stage: "message", actor: "Messages", detail: `${plural(fix.sent, "correction")} sent. ${fix.failed} failed` });
  }
  await logEvents(db, events);
  return c.json({ ok: true, items: data.items, corrections: fix.sent });
});

export default publish;
