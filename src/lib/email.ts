// Email, the only place it happens. Sends from the pantry's Gmail over SMTP
// (smtp.gmail.com:587, STARTTLS, login auth) using worker-mailer, which speaks
// SMTP over Workers TCP sockets. One connection per publish: open it, send
// every follower message on it, close it. Returns how many went and how many
// failed so the caller can log a message event.

import { WorkerMailer } from "worker-mailer";
import type { Env } from "../env";

export type Mail = { to: string; subject: string; text: string };

export async function sendMail(env: Env, mails: Mail[]): Promise<{ sent: number; failed: number }> {
  if (!mails.length) return { sent: 0, failed: 0 };
  if (!env.GMAIL_USER || !env.GMAIL_APP_PASSWORD) {
    console.error("email skipped: GMAIL_USER or GMAIL_APP_PASSWORD missing");
    return { sent: 0, failed: mails.length };
  }

  let mailer: WorkerMailer;
  try {
    mailer = await WorkerMailer.connect({
      host: "smtp.gmail.com",
      port: 587,
      secure: false,
      startTls: true,
      authType: "login",
      // Google shows app passwords in groups of four. Spaces are dropped either way.
      credentials: { username: env.GMAIL_USER, password: env.GMAIL_APP_PASSWORD.replace(/\s+/g, "") },
      socketTimeoutMs: 10_000,
      responseTimeoutMs: 10_000,
    });
  } catch (err) {
    console.error("email connect failed", (err as Error).message);
    return { sent: 0, failed: mails.length };
  }

  let sent = 0;
  let failed = 0;
  for (const mail of mails) {
    try {
      await mailer.send({
        from: { name: "Student Food Pantry", email: env.GMAIL_USER },
        to: mail.to,
        subject: mail.subject,
        text: mail.text,
      });
      sent++;
    } catch (err) {
      failed++;
      console.error("email send failed", (err as Error).message);
    }
  }
  await mailer.close().catch(() => {});
  return { sent, failed };
}
