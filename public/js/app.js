// Shared by every page. Loads public settings from /api/config, makes the
// Supabase client (publishable key only, reads and realtime), formats times
// in the pantry's time zone, works out opening hours, subscribes to table
// changes, and calls the Worker API. No secret ever lives in this file.

// supabase-js, bundled into the site (scripts/vendor.mjs) so no outside script runs on the page.
import { createClient } from "/js/vendor/supabase.mjs";

let cfgPromise = null;
let client = null;
let tz = "America/Detroit";

// Loads settings once per page. Every page awaits this before anything else.
export function start() {
  cfgPromise ??= fetch("/api/config")
    .then((r) => {
      if (!r.ok) throw new Error(`config ${r.status}`);
      return r.json();
    })
    .then((cfg) => {
      tz = cfg.timeZone || tz;
      client = createClient(cfg.supabaseUrl, cfg.supabaseKey, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
      return cfg;
    });
  return cfgPromise;
}

export function db() {
  if (!client) throw new Error("Call start() first");
  return client;
}

// ---- Time, always in the pantry's time zone ----

function parts(date, extra = {}) {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit",
    weekday: "short", hour: "numeric", minute: "2-digit", hour12: true, ...extra,
  });
  const out = {};
  for (const p of fmt.formatToParts(date)) out[p.type] = p.value;
  return out;
}

function dayKey(date) {
  const p = parts(date);
  return `${p.year}-${p.month}-${p.day}`;
}

export function isToday(ts) {
  return Boolean(ts) && dayKey(new Date(ts)) === dayKey(new Date());
}

// "4:41 pm" when today, "Fri 2:50 pm" when not.
export function formatTime(ts) {
  if (!ts) return "";
  const d = new Date(ts);
  const p = parts(d);
  const clock = `${p.hour}:${p.minute} ${p.dayPeriod.toLowerCase()}`;
  return dayKey(d) === dayKey(new Date()) ? clock : `${p.weekday} ${clock}`;
}

// "Nov 30" for a date like 2026-11-30 (a calendar day, no time zone).
export function formatDay(isoDate) {
  if (!isoDate) return "";
  return new Date(`${String(isoDate).slice(0, 10)}T12:00:00Z`)
    .toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

// "arrived 4:41 pm" or "arrived Fri 2:50 pm".
export function arrived(ts) {
  return ts ? `arrived ${formatTime(ts)}` : "";
}

// "4:41:02" for the event log.
export function clockSeconds(ts) {
  const p = parts(new Date(ts), { second: "2-digit" });
  return `${p.hour}:${p.minute}:${p.second}`;
}

// "Tuesday 4:58 pm", or "Tuesday, 4:58 pm" with sep ", ".
export function weekdayClock(ts = Date.now(), sep = " ") {
  const d = new Date(ts);
  const p = parts(d, { weekday: "long" });
  return `${p.weekday}${sep}${p.hour}:${p.minute} ${p.dayPeriod.toLowerCase()}`;
}

// ---- Opening hours ----

const DAYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
const DAY_NAMES = { sun: "Sun", mon: "Mon", tue: "Tue", wed: "Wed", thu: "Thu", fri: "Fri", sat: "Sat" };

function minutes(hhmm) {
  const [h, m] = String(hhmm).split(":").map(Number);
  return h * 60 + (m || 0);
}

// "19:00" -> "7:00 pm", "12:00" -> "12:00 pm".
export function hourLabel(hhmm, withMinutes = true) {
  const total = minutes(hhmm);
  const h = Math.floor(total / 60);
  const m = total % 60;
  const h12 = ((h + 11) % 12) + 1;
  const period = h < 12 ? "am" : "pm";
  return withMinutes || m ? `${h12}:${String(m).padStart(2, "0")} ${period}` : `${h12} ${period}`;
}

function nowInPantry() {
  const p = parts(new Date(), { hour: "2-digit", hour12: false });
  const wd = p.weekday.slice(0, 3).toLowerCase();
  return { day: wd, mins: (Number(p.hour) % 24) * 60 + Number(p.minute) };
}

// { open, closes: "7:00 pm" } or { open: false, opens: "Mon 12:00 pm" }.
export function openState(hours) {
  const now = nowInPantry();
  const today = hours[now.day];
  if (today && now.mins >= minutes(today[0]) && now.mins < minutes(today[1])) {
    return { open: true, closes: hourLabel(today[1]) };
  }
  if (today && now.mins < minutes(today[0])) {
    return { open: false, opens: hourLabel(today[0]) };
  }
  const start = DAYS.indexOf(now.day);
  for (let i = 1; i <= 7; i++) {
    const key = DAYS[(start + i) % 7];
    if (hours[key]) return { open: false, opens: `${DAY_NAMES[key]} ${hourLabel(hours[key][0])}` };
  }
  return { open: false, opens: "" };
}

// "Open until 7:00 pm" or "Closed, opens Mon 12:00 pm".
export function openLine(hours) {
  const s = openState(hours);
  if (s.open) return `Open until ${s.closes}`;
  return s.opens ? `Closed, opens ${s.opens}` : "Closed";
}

// [["Mon", "12 to 3 pm"], ...] for the laptop board.
export function weekHours(hours) {
  return DAYS.filter((d) => hours[d]).map((d) => {
    const [a, b] = hours[d];
    const pa = minutes(a) < 720 ? "am" : "pm";
    const pb = minutes(b) < 720 ? "am" : "pm";
    const left = hourLabel(a, false).replace(` ${pa}`, pa === pb ? "" : ` ${pa}`);
    return [DAY_NAMES[d], `${left} to ${hourLabel(b, false)}`];
  });
}

// ---- Realtime ----

// Calls onChange(payload) for every insert, update or delete on a table and
// onStatus(true or false) as the socket connects or drops. Returns a stop function.
export function live(table, onChange, onStatus = () => {}) {
  const sb = db();
  const channel = sb
    .channel(`live:${table}:${Math.random().toString(36).slice(2)}`)
    .on("postgres_changes", { event: "*", schema: "public", table }, (payload) => onChange(payload))
    .subscribe((status) => onStatus(status === "SUBSCRIBED"));
  return () => sb.removeChannel(channel);
}

// Runs fn when the page comes back to the front, so a phone that slept
// catches up without a reload.
export function onWake(fn) {
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") fn();
  });
  window.addEventListener("online", fn);
}

// ---- Worker API ----

export async function api(path, body, { pin, method = "POST", signal } = {}) {
  const headers = { "Content-Type": "application/json" };
  if (pin) headers["X-Staff-Pin"] = pin;
  const r = await fetch(`/api/${path}`, {
    method,
    headers,
    signal,
    body: method === "GET" ? undefined : JSON.stringify(body ?? {}),
  });
  let data = {};
  try {
    data = await r.json();
  } catch {
    data = {};
  }
  if (!r.ok) throw new Error(data.error || `The server said ${r.status}`);
  return data;
}

// ---- Small helpers ----

export function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, (c) => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]
  ));
}

export function $(selector, root = document) {
  return root.querySelector(selector);
}

// Registers sw.js at the site root so push works on every page.
export async function registerWorker() {
  if (!("serviceWorker" in navigator)) return null;
  try {
    return await navigator.serviceWorker.register("/sw.js", { scope: "/" });
  } catch {
    return null;
  }
}
