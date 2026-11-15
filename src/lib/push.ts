// Web Push, the only place it happens. Signs with the VAPID private key
// (a JWK held as a Worker secret) using @pushforge/builder, which runs on
// Web Crypto, and posts to the browser's push service.

import { buildPushHTTPRequest } from "@pushforge/builder";
import type { Env } from "../env";

export type PushPayload = { title: string; body: string; url?: string; tag?: string };
export type PushResult = "sent" | "gone" | "failed";

export async function sendPush(env: Env, subscription: unknown, payload: PushPayload): Promise<PushResult> {
  try {
    const sub = subscription as { endpoint: string; keys: { p256dh: string; auth: string } };
    if (!sub?.endpoint || !sub?.keys?.p256dh || !sub?.keys?.auth) return "gone";
    const { endpoint, headers, body } = await buildPushHTTPRequest({
      privateJWK: env.VAPID_PRIVATE_KEY,
      subscription: sub,
      message: {
        payload,
        adminContact: env.VAPID_SUBJECT,
        options: { ttl: 4 * 60 * 60, urgency: "high" },
      },
    });
    const res = await fetch(endpoint, { method: "POST", headers, body });
    if (res.status === 404 || res.status === 410) return "gone";
    if (res.status >= 200 && res.status < 300) return "sent";
    console.error("push failed", res.status);
    return "failed";
  } catch (err) {
    console.error("push error", (err as Error).message);
    return "failed";
  }
}
