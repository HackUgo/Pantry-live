// Walks every route of the live site, first as an attacker, then through the
// whole flow as staff and as a student, and prints one line per check.
// It writes real rows (an item called "Walk test beans", scans, holds, events)
// and ends by locking this address out of staff calls for 10 minutes, so run
// the demo reset afterwards (docs/LESSONS.md, "Demo reset"), which clears both.
//
//   WALK_URL=https://pantry-live.twokriks.workers.dev WALK_PIN=... WALK_EMAIL=you@cmich.edu node scripts/walk.mjs
//
// Push follows use a fake endpoint, so no real person is ever messaged.

const BASE = process.env.WALK_URL || "https://pantry-live.twokriks.workers.dev";
const PIN = process.env.WALK_PIN;
// Reserving now emails the student and the desk, so every hold the walk makes
// uses one address you own. Expect a handful of pickup emails there.
const EMAIL = (process.env.WALK_EMAIL || "").toLowerCase();
if (!PIN || !EMAIL.endsWith("@cmich.edu")) {
  console.error("Set WALK_PIN (the staff PIN) and WALK_EMAIL (a @cmich.edu address you own).");
  process.exit(1);
}
const results = [];

function check(name, ok, detail = "") {
  results.push({ name, ok });
  console.log(`${ok ? "pass" : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}`);
}

async function call(path, { method = "GET", body, pin, headers = {} } = {}) {
  const h = { ...headers };
  if (body !== undefined) h["content-type"] = "application/json";
  if (pin !== undefined) h["x-staff-pin"] = pin;
  const res = await fetch(`${BASE}${path}`, { method, headers: h, body: body === undefined ? undefined : JSON.stringify(body) });
  let data = null;
  try { data = await res.json(); } catch { data = null; }
  return { status: res.status, data };
}

const cfg = (await call("/api/config")).data;
const SB = cfg.supabaseUrl;
const KEY = cfg.supabaseKey;
const anon = (path, init = {}) => fetch(`${SB}${path}`, {
  ...init, headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, "content-type": "application/json", ...(init.headers || {}) },
});

// ---------------- As an attacker ----------------
console.log("\nAs an attacker");

check("config holds no secret key", !JSON.stringify(cfg).match(/sb_secret|service_role|eyJ/), "public key only");
for (const page of ["/", "/volunteer", "/system", "/sw.js", "/manifest.webmanifest", "/fonts/inter-latin.woff2"]) {
  const r = await fetch(`${BASE}${page}`);
  check(`page ${page} serves`, r.status === 200);
}

const staffRoutes = [
  ["/api/staff/check", "POST"], ["/api/staff/today", "GET"], ["/api/scan", "POST"], ["/api/publish", "POST"],
  ["/api/undo", "POST"], ["/api/staff/pickups", "GET"], ["/api/checkin", "POST"], ["/api/handover", "POST"],
];
// Each miss counts toward the lock (10 in 10 minutes), so this stays at 9.
for (const [path, method] of staffRoutes) {
  const none = await call(path, { method, body: method === "POST" ? {} : undefined });
  check(`${path} refuses a missing PIN`, none.status === 401, String(none.status));
}
const staffRelease = await call("/api/release", { method: "POST", body: { code: "ABCD" }, pin: "0000" });
check("a wrong PIN is refused", staffRelease.status === 401);

let r = await anon("/rest/v1/items", { method: "POST", body: JSON.stringify({ id: "hack", name: "Hack" }) });
check("public key cannot add an item", r.status === 401 || r.status === 403);
r = await anon("/rest/v1/items?id=eq.milk", { method: "PATCH", headers: { Prefer: "return=representation" }, body: JSON.stringify({ qty: 999 }) });
check("public key cannot change a count", JSON.stringify(await r.json()) === "[]");
for (const t of ["reservations", "scans", "follows", "push_subscriptions"]) {
  r = await anon(`/rest/v1/${t}?select=*`);
  check(`public key reads nothing from ${t}`, JSON.stringify(await r.json()) === "[]");
}
const before = await (await anon("/rest/v1/events?select=id")).json();
await anon("/rest/v1/events?id=gt.0", { method: "DELETE" });
const after = await (await anon("/rest/v1/events?select=id")).json();
check("public key cannot delete the log", after.length === before.length);
for (const fn of ["scan_in", "reserve_items", "release_reservation", "handover_reservation", "undo_scan"]) {
  r = await anon(`/rest/v1/rpc/${fn}`, { method: "POST", body: "{}" });
  check(`public key cannot run ${fn}`, r.status === 401 || r.status === 403 || r.status === 404, String(r.status));
}
r = await anon("/storage/v1/object/scans/_walk/x.png", { method: "POST", headers: { "content-type": "image/png" }, body: "x" });
check("bucket refuses a non JPEG", r.status >= 400);
r = await anon(`/storage/v1/object/scans/_walk/${Date.now()}.jpg`, { method: "POST", headers: { "content-type": "image/jpeg" }, body: Buffer.from([0xff, 0xd8, 0xff, 0xd9]) });
check("public key cannot upload any photo", r.status >= 400, String(r.status));
r = await anon("/rest/v1/follows", { method: "POST", body: JSON.stringify({ item_id: "egg", channel: "email", address: "victim@cmich.edu" }) });
check("public key cannot add a follow", r.status === 401 || r.status === 403, String(r.status));
r = await anon("/rest/v1/push_subscriptions", { method: "POST", body: JSON.stringify({ subscription: { endpoint: "https://evil.example" } }) });
check("public key cannot add a push subscription", r.status === 401 || r.status === 403, String(r.status));

const page = await fetch(`${BASE}/`);
const csp = page.headers.get("content-security-policy") || "";
check("pages send a strict content policy", csp.includes("script-src 'self'") && csp.includes("frame-ancestors 'none'"));
check("pages refuse framing and sniffing", page.headers.get("x-frame-options") === "DENY" && page.headers.get("x-content-type-options") === "nosniff");
let leaked = false;
for (const f of ["/js/app.js", "/js/vendor/supabase.mjs", "/js/board.js", "/js/staff.js", "/js/staff-scan.js", "/js/staff-desk.js", "/js/bag.js", "/js/follow.js", "/sw.js"]) {
  const text = await (await fetch(`${BASE}${f}`)).text();
  // Real key shapes and the actual PIN, not a library's own mention of a key type.
  if (/sb_secret_[A-Za-z0-9_-]{20,}|sk-ant-[A-Za-z0-9_-]{20,}|eyJhbGciOi[A-Za-z0-9_-]{30,}/.test(text) || text.includes(`"${PIN}"`) || text.includes(EMAIL)) {
    leaked = true;
    console.log("  found in", f);
  }
}
check("no secret or PIN in any served script", !leaked);
check("follow refuses a non CMU email", (await call("/api/follow", { method: "POST", body: { item_id: "egg", channel: "email", email: "victim@gmail.com" } })).status === 400);
check("follow refuses a push address that is not a push service", (await call("/api/follow", { method: "POST", body: { item_id: "egg", channel: "push", subscription: { endpoint: "https://evil.example/hook", keys: { p256dh: "BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM", auth: "tBHItJI5svbpez7KI4CCXg" } } } })).status === 400);
check("follow refuses an item on the shelf", (await call("/api/follow", { method: "POST", body: { item_id: "peanut-butter", channel: "email", email: EMAIL } })).status === 409);

check("reserve refuses a non CMU email", (await call("/api/reserve", { method: "POST", body: { name: "A", email: "a@gmail.com", items: [{ id: "milk", n: 1 }] } })).status === 400);
check("pickup status needs the right email", (await call("/api/pickup", { method: "POST", body: { code: "ABCD", email: "x@cmich.edu" } })).status === 404);
check("publish refuses a photo from elsewhere", (await call("/api/publish", { method: "POST", pin: PIN, body: { photo_url: "https://evil.example/a.jpg", by_name: "Walk", items: [{ name: "Rice", count: 1 }] } })).status === 400);

// ---------------- As staff and a student ----------------
console.log("\nAs staff and a student");

// A real JPEG goes up the way the phone sends it: to /api/scan, which stores it.
const jpeg = "/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==";
check("scan refuses something that is not a JPEG", (await call("/api/scan", { method: "POST", pin: PIN, body: { image_base64: Buffer.from("x".repeat(2000)).toString("base64"), width: 10, height: 10 } })).status === 400);
// Padded past the size check; still a JPEG by its first bytes.
const padded = Buffer.concat([Buffer.from(jpeg, "base64"), Buffer.alloc(1200)]).toString("base64");
const scanned = await call("/api/scan", { method: "POST", pin: PIN, body: { image_base64: padded, width: 1, height: 1, existing_items: [] } });
const photo = scanned.data?.photo_url;
check("scan stores the photo in the bucket", scanned.status === 200 && typeof photo === "string" && photo.startsWith(`${SB}/storage/v1/object/public/scans/`), String(scanned.status));
r = await anon(photo.slice(SB.length).replace("/object/public/", "/object/"), { method: "PUT", headers: { "content-type": "image/jpeg" }, body: Buffer.from(jpeg, "base64") });
check("a stored photo cannot be overwritten", r.status >= 400);

const itemQty = async (id) => (await (await anon(`/rest/v1/items?select=qty,out_at&id=eq.${id}`)).json())[0];
const ITEM = "walk-test-bean";

let pub = await call("/api/publish", { method: "POST", pin: PIN, body: { photo_url: photo, by_name: "Walk", request_id: `walk-${Date.now()}`, items: [{ name: "Walk test beans", category: "Canned", unit: "cans", count: 2 }] } });
check("publish puts a new item on the board", pub.status === 200 && pub.data.items[0].qty === 2, JSON.stringify(pub.data?.items?.[0]));
const req = `walk-retry-${Date.now()}`;
const p1 = await call("/api/publish", { method: "POST", pin: PIN, body: { photo_url: photo, by_name: "Walk", request_id: req, items: [{ name: "Walk test beans", count: 1 }] } });
const p2 = await call("/api/publish", { method: "POST", pin: PIN, body: { photo_url: photo, by_name: "Walk", request_id: req, items: [{ name: "Walk test beans", count: 1 }] } });
check("a retried publish adds once", p1.data.scan_id === p2.data.scan_id && (await itemQty(ITEM)).qty === 3);

let res = await call("/api/reserve", { method: "POST", body: { name: "Walk Student", email: EMAIL, request_id: `wr-${Date.now()}`, items: [{ id: ITEM, n: 3 }] } });
check("reserve refuses more than the per pickup limit", res.status === 409);
const rreq = `wr2-${Date.now()}`;
res = await call("/api/reserve", { method: "POST", body: { name: "Walk Student", email: EMAIL, request_id: rreq, items: [{ id: ITEM, n: 2 }] } });
check("reserve holds items under a code", res.status === 200 && /^[2-9A-HJ-NP-Z]{4}$/.test(res.data.code), res.data?.code);
const code1 = res.data.code;
const again = await call("/api/reserve", { method: "POST", body: { name: "Walk Student", email: EMAIL, request_id: rreq, items: [{ id: ITEM, n: 2 }] } });
check("a retried reserve returns the same code", again.data?.code === code1);
check("reserving took the items off the board", (await itemQty(ITEM)).qty === 1);
const slots = (await call("/api/slots")).data;
check("slots count the hold", slots.taken >= 1 && slots.left === slots.cap - slots.taken);

const status = await call("/api/pickup", { method: "POST", body: { code: code1, email: EMAIL.toUpperCase() } });
check("the student sees their hold, without the email", status.data?.status === "held" && !("email" in status.data));
check("the desk sees it waiting", (await call("/api/staff/pickups", { pin: PIN })).data.waiting.some((x) => x.code === code1));
check("check in logs", (await call("/api/checkin", { method: "POST", pin: PIN, body: { code: code1, by_name: "Walk" } })).status === 200);
check("hand over with nothing ticked is refused", (await call("/api/handover", { method: "POST", pin: PIN, body: { code: code1, by_name: "Walk", given: [] } })).status === 400);
const ho = await call("/api/handover", { method: "POST", pin: PIN, body: { code: code1, by_name: "Walk", given: [ITEM] } });
check("hand over closes the hold and leaves the count", ho.status === 200 && (await itemQty(ITEM)).qty === 1);
check("a second hand over is refused", (await call("/api/handover", { method: "POST", pin: PIN, body: { code: code1, given: [ITEM] } })).status === 409);
check("the hold shows as done", (await call("/api/staff/pickups", { pin: PIN })).data.done.some((x) => x.code === code1));

res = await call("/api/reserve", { method: "POST", body: { name: "Walk Student", email: EMAIL, request_id: `wr3-${Date.now()}`, items: [{ id: ITEM, n: 1 }] } });
const code2 = res.data.code;
check("one waiting hold per email", (await call("/api/reserve", { method: "POST", body: { name: "Walk Student", email: EMAIL, request_id: `wr3b-${Date.now()}`, items: [{ id: "cereal", n: 1 }] } })).status === 409);
check("the student cannot release with another email", (await call("/api/release", { method: "POST", body: { code: code2, email: "x@cmich.edu" } })).status === 404);
const rel = await call("/api/release", { method: "POST", pin: PIN, body: { code: code2, by_name: "Walk" } });
check("the desk releases a no show", rel.status === 200 && (await itemQty(ITEM)).qty === 1);

// Out, a follower, then back in: one message, then the follow ends.
res = await call("/api/reserve", { method: "POST", body: { name: "Walk Two", email: EMAIL, request_id: `wr4-${Date.now()}`, items: [{ id: ITEM, n: 1 }] } });
const code3 = res.data.code;
await call("/api/handover", { method: "POST", pin: PIN, body: { code: code3, by_name: "Walk", given: [ITEM] } });
const out = await itemQty(ITEM);
check("the item is Out with a time", out.qty === 0 && Boolean(out.out_at));
const waitingBefore = (await call("/api/staff/today", { pin: PIN })).data.followers[ITEM] ?? 0;
const sub = { endpoint: `https://fcm.googleapis.com/fcm/send/walk-fake-${Date.now()}`, keys: { p256dh: "BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM", auth: "tBHItJI5svbpez7KI4CCXg" } };
r = await call("/api/follow", { method: "POST", body: { item_id: ITEM, channel: "push", subscription: sub } });
check("a student can follow an Out item", r.status === 200);
await call("/api/follow", { method: "POST", body: { item_id: ITEM, channel: "push", subscription: sub } });
check("the same follow twice is kept once", (await call("/api/staff/today", { pin: PIN })).data.followers[ITEM] === waitingBefore + 1);
pub = await call("/api/publish", { method: "POST", pin: PIN, body: { photo_url: photo, by_name: "Walk", request_id: `walk-back-${Date.now()}`, items: [{ name: "Walk test beans", count: 4 }] } });
check("back in tells each follower once", pub.data?.told?.students === waitingBefore + 1, `sent ${pub.data?.told?.sent}, failed ${pub.data?.told?.failed} (fake endpoint)`);
check("the follow ended", (await call("/api/staff/today", { pin: PIN })).data.followers[ITEM] === undefined);

const undo = await call("/api/undo", { method: "POST", pin: PIN, body: { scan_id: pub.data.scan_id, by_name: "Walk" } });
check("undo takes the scan back", undo.status === 200 && (await itemQty(ITEM)).qty === 0);
check("followers are back on the list after the correction", (await call("/api/staff/today", { pin: PIN })).data.followers[ITEM] === waitingBefore + 1);
check("a second undo is refused", (await call("/api/undo", { method: "POST", pin: PIN, body: { scan_id: pub.data.scan_id } })).status === 409);

const events = await (await anon("/rest/v1/events?select=stage,actor,detail&order=id")).json();
const stages = new Set(events.map((e) => e.stage));
check("the log has every stage", ["scan", "read", "board", "message", "reserve", "code", "handover"].every((s) => stages.has(s)), [...stages].join(", "));
check("the log holds no email address", !JSON.stringify(events).includes("@"));
check("the log holds no pickup code", ![code1, code2, code3].some((c) => JSON.stringify(events).includes(c)));

// Last, because it locks this address out of staff calls for 10 minutes.
let lockedAt = 0;
for (let i = 1; i <= 12 && !lockedAt; i++) if ((await call("/api/staff/check", { method: "POST", pin: "9999" })).status === 429) lockedAt = i;
check("PIN guessing locks out after 10 misses", lockedAt === 11, `locked on try ${lockedAt}`);
check("the lock holds even with the right PIN", (await call("/api/staff/check", { method: "POST", pin: PIN })).status === 429);

const failed = results.filter((x) => !x.ok);
console.log(`\n${results.length - failed.length} of ${results.length} checks passed.`);
process.exit(failed.length ? 1 : 0);
