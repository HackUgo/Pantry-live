// The Worker. Static pages in ./public are served by the assets binding;
// only /api/* reaches this code. Routes stay thin and call into src/lib.

import { Hono } from "hono";
import type { AppEnv } from "./env";
import { CATEGORIES } from "../public/js/catalog.js";
import staff from "./routes/staff";
import publish from "./routes/publish";
import student from "./routes/student";
import desk from "./routes/desk";
import { ReservationError } from "./lib/reservations";
import { FollowError } from "./lib/follows";
import { releaseNoShows } from "./lib/closing";
import { adminDb } from "./lib/db";
import type { Env } from "./env";

const app = new Hono<AppEnv>().basePath("/api");

// Every API answer: never sniffed as another type, never cached unless a route says so.
app.use("*", async (c, next) => {
  await next();
  c.header("X-Content-Type-Options", "nosniff");
  if (!c.res.headers.get("Cache-Control")) c.header("Cache-Control", "no-store");
});

// Public settings the pages need to start: the Supabase URL and publishable
// key for reads and realtime, the push public key, hours, place, categories.
app.get("/config", (c) => {
  const e = c.env;
  let hours: unknown = {};
  try {
    hours = JSON.parse(e.PANTRY_HOURS || "{}");
  } catch {
    hours = {};
  }
  c.header("Cache-Control", "public, max-age=60");
  return c.json({
    supabaseUrl: e.SUPABASE_URL,
    supabaseKey: e.SUPABASE_PUBLISHABLE_KEY,
    vapidPublicKey: e.VAPID_PUBLIC_KEY,
    timeZone: e.TIME_ZONE,
    place: e.PLACE,
    hours,
    categories: CATEGORIES,
  });
});

app.route("/", staff);
app.route("/", publish);
app.route("/", student);
app.route("/", desk);

app.notFound((c) => c.json({ error: "Not found" }, 404));
app.onError((err, c) => {
  if (err instanceof ReservationError || err instanceof FollowError) return c.json({ error: err.message }, err.status);
  console.error("api error", err.message);
  return c.json({ error: "Something went wrong on the server. Try again." }, 500);
});

// Every 15 minutes: once the pantry has closed, release the day's no shows.
export default {
  fetch: app.fetch,
  async scheduled(_event: ScheduledController, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(releaseNoShows(env, adminDb(env), env.SITE_URL).then(
      (r) => { if (r.released) console.log("released at closing", r.released); },
      (err) => console.error("closing run failed", (err as Error).message),
    ));
  },
};
