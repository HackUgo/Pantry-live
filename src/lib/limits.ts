// Per address limits that hold across every copy of the Worker: each call
// records a hit (hashed address, never the address itself) in api_hits, and
// over the limit the caller gets a 429. Used for the routes anyone can call.

import type { Context } from "hono";
import type { AppEnv } from "../env";
import { adminDb } from "./db";

async function addressHash(c: Context<AppEnv>, bucket: string): Promise<string> {
  const ip = c.req.header("cf-connecting-ip") ?? "local";
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`pantry-${bucket}:${ip}`));
  return [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

// Returns null when the call may go ahead, or the 429 to send instead.
export async function overLimit(c: Context<AppEnv>, bucket: string, max: number, minutes: number): Promise<Response | null> {
  const db = adminDb(c.env);
  const ipHash = await addressHash(c, bucket);
  const since = new Date(Date.now() - minutes * 60_000).toISOString();
  const { count, error } = await db
    .from("api_hits")
    .select("id", { count: "exact", head: true })
    .eq("bucket", bucket)
    .eq("ip_hash", ipHash)
    .gte("at", since);
  if (error) console.error("limit read failed", bucket, error.message);
  if ((count ?? 0) >= max) {
    return c.json({ error: `Too many tries from this connection. Wait ${minutes >= 60 ? `${minutes / 60} hour` : `${minutes} minutes`} and try again.` }, 429);
  }
  const { error: addError } = await db.from("api_hits").insert({ bucket, ip_hash: ipHash });
  if (addError) console.error("limit write failed", bucket, addError.message);
  return null;
}
