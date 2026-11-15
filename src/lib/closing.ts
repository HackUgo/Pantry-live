// No shows at closing. Once the pantry has closed for the day, every hold
// still waiting goes back on the board, and each student gets one email
// saying so. Runs on the Worker's schedule (every 15 minutes, see
// wrangler.jsonc) and from the desk's "Release everyone still waiting".

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Env } from "../env";
import { pickupWindow } from "./hours";
import { release } from "./reservations";
import { sendMail, type Mail } from "./email";
import { logEvents } from "./events";

export function releasedMail(env: Env, origin: string, hold: { code: string; email: string; items: { name: string; n: number }[] }, opens: string | null): Mail {
  const items = hold.items.map((i) => `${i.name} ${i.n}`).join(", ");
  return {
    to: hold.email,
    subject: `Your pickup ${hold.code} was released`,
    text: `The pantry closed before pickup, so ${items} went back on the board for everyone. You can reserve again ${opens ? `from ${opens}` : "when the pantry next opens"}.\n\n${origin}`,
  };
}

// force: the desk asked for it, so it runs even while the pantry is open.
export async function releaseNoShows(env: Env, db: SupabaseClient, origin: string, { force = false, by = "Closing" } = {}) {
  const window = pickupWindow(env.PANTRY_HOURS, env.TIME_ZONE);
  if (window.ok && !force) return { released: 0, skipped: true };

  const { data, error } = await db.from("reservations").select("code, email").eq("status", "held");
  if (error) throw new Error(`held read failed: ${error.message}`);

  const mails: Mail[] = [];
  const codes: string[] = [];
  for (const h of data ?? []) {
    try {
      const out = await release(db, h.code, null, by === "Closing" ? "Closing" : `Desk · ${by}`);
      if (out.already) continue;
      codes.push(h.code);
      mails.push(releasedMail(env, origin, { code: h.code, email: h.email, items: out.items }, window.opens));
    } catch (err) {
      console.error("release at closing failed", h.code, (err as Error).message);
    }
  }
  if (!codes.length) return { released: 0, skipped: false };

  const sent = await sendMail(env, mails);
  await logEvents(db, [{
    stage: "message",
    actor: "Messages",
    detail: `${codes.length === 1 ? "1 no show" : `${codes.length} no shows`} released: ${sent.sent === 1 ? "1 email" : `${sent.sent} emails`} sent, ${sent.failed} failed`,
  }]);
  return { released: codes.length, skipped: false, sent: sent.sent, failed: sent.failed };
}
