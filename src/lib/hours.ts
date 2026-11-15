// Time and opening hours on the Worker side, in the pantry's time zone.
import { unitFor } from "../../public/js/catalog.js";

// Used for message text: "18 on the shelf at 4:41 pm. ... before 7:00 pm".

const DAYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

function parts(at: Date, timeZone: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const p of new Intl.DateTimeFormat("en-US", {
    timeZone, weekday: "short", hour: "numeric", minute: "2-digit", hour12: true,
  }).formatToParts(at)) out[p.type] = p.value;
  return out;
}

// "4:41 pm"
export function clock(at: Date | string, timeZone: string): string {
  const p = parts(new Date(at), timeZone);
  return `${p.hour}:${p.minute} ${String(p.dayPeriod).toLowerCase()}`;
}

function label(hhmm: string): string {
  const [h, m] = hhmm.split(":").map(Number);
  return `${((h + 11) % 12) + 1}:${String(m || 0).padStart(2, "0")} ${h < 12 ? "am" : "pm"}`;
}

// Today's closing time, "7:00 pm", or null when the pantry has no hours today.
export function closesToday(hoursJson: string, timeZone: string, now = new Date()): string | null {
  let hours: Record<string, [string, string]> = {};
  try {
    hours = JSON.parse(hoursJson || "{}");
  } catch {
    return null;
  }
  const day = parts(now, timeZone).weekday?.slice(0, 3).toLowerCase() ?? "";
  const today = DAYS.includes(day) ? hours[day] : undefined;
  return today ? label(today[1]) : null;
}

function nowIn(timeZone: string, now: Date) {
  const p: Record<string, string> = {};
  for (const x of new Intl.DateTimeFormat("en-US", {
    timeZone, weekday: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(now)) p[x.type] = x.value;
  return { day: String(p.weekday).slice(0, 3).toLowerCase(), mins: (Number(p.hour) % 24) * 60 + Number(p.minute) };
}

const toMins = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + (m || 0);
};

// Reserving is open on a pantry day until closing time (before opening too,
// so a student can hold items in the morning). Otherwise it names the next opening.
export function pickupWindow(hoursJson: string, timeZone: string, now = new Date()) {
  let hours: Record<string, [string, string]> = {};
  try {
    hours = JSON.parse(hoursJson || "{}");
  } catch {
    hours = {};
  }
  const { day, mins } = nowIn(timeZone, now);
  const today = hours[day];
  if (today && mins < toMins(today[1])) return { ok: true, closes: label(today[1]), opens: null as string | null };
  const start = DAYS.indexOf(day);
  for (let i = 1; i <= 7; i++) {
    const key = DAYS[(start + i) % 7];
    if (hours[key]) {
      const name = key.charAt(0).toUpperCase() + key.slice(1);
      return { ok: false, closes: null as string | null, opens: `${name} ${label(hours[key][0])}` };
    }
  }
  return { ok: false, closes: null as string | null, opens: null as string | null };
}

// "18", "9 boxes" or "1 box"
export function amount(qty: number, unit: string): string {
  return unit ? `${qty} ${unitFor(qty, unit)}` : String(qty);
}
