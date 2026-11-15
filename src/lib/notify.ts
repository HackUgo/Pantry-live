// Telling students. When a scan takes an item from Out to a number, everyone
// following that item gets exactly one message (email or push), and their
// follow is deleted. The list of who was told is returned so the scan can
// keep it. If the scan is undone, they get a correction and their follow is
// put back, so they still hear when the item really arrives.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Env } from "../env";
import { sendMail, type Mail } from "./email";
import { sendPush, type PushPayload } from "./push";
import { amount, clock, closesToday } from "./hours";

export type Arrival = { id: string; name: string; unit: string; after: number };
export type Told = { item_id: string; name: string; channel: "email" | "push"; address: string | null; subscription: unknown };
export type TellResult = { told: Told[]; students: number; emailsSent: number; pingsSent: number; sent: number; failed: number };

function arrivalText(env: Env, a: Arrival, at: Date) {
  const close = closesToday(env.PANTRY_HOURS, env.TIME_ZONE, at);
  const when = close ? `before ${close}, ` : "when the pantry opens, ";
  return {
    title: `${a.name} just arrived`,
    body: `${amount(a.after, a.unit)} on the shelf at ${clock(at, env.TIME_ZONE)}. Reserve or walk in ${when}${env.PLACE}.`,
  };
}

async function deliver(env: Env, origin: string, list: { follow: Told; title: string; body: string }[]) {
  const mails: Mail[] = list
    .filter((x) => x.follow.channel === "email" && x.follow.address)
    .map((x) => ({ to: x.follow.address as string, subject: x.title, text: `${x.body}\n\n${origin}` }));
  const pushes = list.filter((x) => x.follow.channel === "push");

  const [mailResult, pushResults] = await Promise.all([
    sendMail(env, mails),
    Promise.all(pushes.map((x) => sendPush(env, x.follow.subscription, {
      title: x.title, body: x.body, url: `${origin}/`, tag: `item-${x.follow.item_id}`,
    } satisfies PushPayload))),
  ]);
  const pushSent = pushResults.filter((r) => r === "sent").length;
  return {
    emailsSent: mailResult.sent,
    pingsSent: pushSent,
    sent: mailResult.sent + pushSent,
    failed: mailResult.failed + (pushes.length - pushSent),
  };
}

export async function tellFollowers(env: Env, db: SupabaseClient, origin: string, arrivals: Arrival[]): Promise<TellResult> {
  const empty = { told: [], students: 0, emailsSent: 0, pingsSent: 0, sent: 0, failed: 0 };
  if (!arrivals.length) return empty;
  const byId = new Map(arrivals.map((a) => [a.id, a]));

  const { data: follows, error } = await db
    .from("follows")
    .select("id, item_id, channel, address, subscription")
    .in("item_id", [...byId.keys()]);
  if (error) {
    console.error("follows read failed", error.message);
    return empty;
  }
  if (!follows?.length) return empty;

  const at = new Date();
  const list = follows.map((f) => {
    const a = byId.get(f.item_id)!;
    const text = arrivalText(env, a, at);
    const follow: Told = { item_id: f.item_id, name: a.name, channel: f.channel, address: f.address, subscription: f.subscription };
    return { follow, ...text };
  });

  const result = await deliver(env, origin, list);

  // One message per follow, then the follow ends, whether or not it got through.
  const { error: delError } = await db.from("follows").delete().in("id", follows.map((f) => f.id));
  if (delError) console.error("follows delete failed", delError.message);

  return { told: list.map((x) => x.follow), students: follows.length, ...result };
}

export async function sendCorrections(env: Env, db: SupabaseClient, origin: string, told: Told[]) {
  if (!told.length) return { sent: 0, failed: 0 };
  const list = told.map((follow) => ({
    follow,
    title: `${follow.name} is not on the shelf yet`,
    body: `The last message was sent by mistake. You will hear from us again the moment ${follow.name.toLowerCase()} arrive.`,
  }));
  const result = await deliver(env, origin, list);

  const { error } = await db.from("follows").insert(told.map((t) => ({
    item_id: t.item_id, channel: t.channel, address: t.address, subscription: t.subscription,
  })));
  if (error) console.error("follows restore failed", error.message);
  return { sent: result.sent, failed: result.failed };
}
