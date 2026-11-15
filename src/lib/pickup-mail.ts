// Emails for a new pickup: one to the desk (STAFF_ALERT_EMAIL) so staff know
// it is coming, one to the student with their code so it cannot get lost.
// Sent after the hold is made, in the background, through src/lib/email.ts.
// The log gets one line with how many went out. No address goes in the log.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Env } from "../env";
import { sendMail, type Mail } from "./email";
import { clock } from "./hours";
import { logEvents } from "./events";

type Hold = {
  code: string; name: string; email: string; closes: string | null;
  items: { name: string; n: number }[]; left: number; cap: number;
};

export function pickupMails(env: Env, origin: string, hold: Hold, at = new Date()): Mail[] {
  const lines = hold.items.map((i) => `${i.name} ${i.n}`).join("\n");
  const before = hold.closes ? `before ${hold.closes} today` : "when the pantry opens";
  const mails: Mail[] = [{
    to: hold.email,
    subject: `Your pickup code: ${hold.code}`,
    text: `Show this code at the desk in ${env.PLACE} ${before}: ${hold.code}\n\nHeld for you:\n${lines}\n\nSay your name at the desk, same as walking in. Not coming? Open the board on the phone you reserved with and release them so someone else can.\n\n${origin}`,
  }];
  if (env.STAFF_ALERT_EMAIL) {
    mails.push({
      to: env.STAFF_ALERT_EMAIL,
      subject: `New pickup ${hold.code}: ${hold.name}`,
      text: `${hold.name} reserved at ${clock(at, env.TIME_ZONE)} for pickup ${before}.\n\nCode: ${hold.code}\n${lines}\n\n${hold.left} of ${hold.cap} pickup slots left today.\n\nPickups: ${origin}/volunteer`,
    });
  }
  return mails;
}

export async function sendPickupMails(env: Env, db: SupabaseClient, origin: string, hold: Hold) {
  const result = await sendMail(env, pickupMails(env, origin, hold));
  const to = env.STAFF_ALERT_EMAIL ? "the student and the desk" : "the student";
  await logEvents(db, [{
    stage: "reserve",
    actor: "Messages",
    detail: `Pickup email to ${to}: ${result.sent} sent, ${result.failed} failed`,
  }]);
}
