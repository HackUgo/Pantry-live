// Limits a route to 20 requests a minute per client IP.
// Uses the RATE_LIMITER binding and a small in memory window per isolate
// together. Either one can refuse. Each isolate keeps its own counts, so the
// memory window is a floor, not the whole limit.

import type { MiddlewareHandler } from "hono";
import type { AppEnv } from "../env";

const LIMIT = 20;
const WINDOW_MS = 60_000;
const hits = new Map<string, number[]>();

function memoryAllows(key: string): boolean {
  const now = Date.now();
  const recent = (hits.get(key) ?? []).filter((t) => now - t < WINDOW_MS);
  if (recent.length >= LIMIT) {
    hits.set(key, recent);
    return false;
  }
  recent.push(now);
  hits.set(key, recent);
  if (hits.size > 5000) hits.clear();
  return true;
}

export function rateLimit(route: string): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const ip = c.req.header("cf-connecting-ip") ?? "local";
    const key = `${route}:${ip}`;
    // Cloudflare's counter is approximate and per location, so the isolate's
    // own count is checked too: a request over either limit is refused.
    let allowed = memoryAllows(key);
    try {
      if (c.env.RATE_LIMITER) allowed = (await c.env.RATE_LIMITER.limit({ key })).success && allowed;
    } catch {
      /* the binding is down: the in memory count still applies */
    }
    if (!allowed) return c.json({ error: "Too many requests. Wait a minute and try again." }, 429);
    await next();
  };
}
