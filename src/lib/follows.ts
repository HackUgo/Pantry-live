// Tell me, server side. A student follows an Out item by CMU email or by a
// push subscription from a real browser push service. The Worker checks both
// before anything is stored, so nobody can make the pantry email strangers
// or make the Worker call an address of their choosing.

import type { SupabaseClient } from "@supabase/supabase-js";

// Browser push services. A subscription pointing anywhere else is refused.
const PUSH_HOSTS = [
  /^fcm\.googleapis\.com$/,
  /^updates\.push\.services\.mozilla\.com$/,
  /^web\.push\.apple\.com$/,
  /(^|\.)notify\.windows\.com$/,
];
const MAX_FOLLOWS_PER_ITEM = 200;

export class FollowError extends Error {
  constructor(message: string, public status: 400 | 404 | 409) {
    super(message);
  }
}

export function cleanSubscription(raw: any) {
  let url: URL;
  try {
    url = new URL(String(raw?.endpoint ?? ""));
  } catch {
    throw new FollowError("This browser sent a ping address that does not work. Use email instead.", 400);
  }
  if (url.protocol !== "https:" || !PUSH_HOSTS.some((h) => h.test(url.hostname))) {
    throw new FollowError("This browser sent a ping address that does not work. Use email instead.", 400);
  }
  const p256dh = String(raw?.keys?.p256dh ?? "");
  const auth = String(raw?.keys?.auth ?? "");
  if (!/^[A-Za-z0-9_-]{60,120}$/.test(p256dh) || !/^[A-Za-z0-9_-]{16,40}$/.test(auth)) {
    throw new FollowError("This browser sent a ping address that does not work. Use email instead.", 400);
  }
  return { endpoint: url.toString(), keys: { p256dh, auth } };
}

export function cleanFollowEmail(raw: unknown): string {
  const email = String(raw ?? "").trim().toLowerCase();
  if (!/^[^@\s]+@cmich\.edu$/.test(email) || email.length > 120) {
    throw new FollowError("Use your CMU email, the one ending in @cmich.edu.", 400);
  }
  return email;
}

export async function addFollow(db: SupabaseClient, body: any) {
  const itemId = String(body?.item_id ?? "").slice(0, 60);
  const { data: item, error } = await db.from("items").select("id, qty").eq("id", itemId).maybeSingle();
  if (error) throw new Error(`follow item read failed: ${error.message}`);
  if (!item) throw new FollowError("That item is not on the board.", 404);
  if ((Number(item.qty) || 0) > 0) throw new FollowError("That item is on the shelf now. Reserve it instead.", 409);

  const { count } = await db.from("follows").select("id", { count: "exact", head: true }).eq("item_id", itemId);
  if ((count ?? 0) >= MAX_FOLLOWS_PER_ITEM) throw new FollowError("The list for this item is full.", 409);

  const row: { item_id: string; channel: "email" | "push"; address?: string; subscription?: unknown } = body?.channel === "push"
    ? { item_id: itemId, channel: "push", subscription: cleanSubscription(body?.subscription) }
    : { item_id: itemId, channel: "email", address: cleanFollowEmail(body?.email) };
  const { error: addError } = await db.from("follows").insert(row);
  // Already on the list counts as on the list.
  if (addError && addError.code !== "23505") throw new Error(`follow insert failed: ${addError.message}`);
  return { ok: true, channel: row.channel };
}
