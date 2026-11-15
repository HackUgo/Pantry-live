// The projector page at /system: two rows of nodes that light green when
// their step happens today, each showing its latest line and time, and the
// event log below. Driven by realtime on the events table. Never needs a refresh.

import { start, db, live, onWake, isToday, clockSeconds, weekdayClock, esc, $ } from "/js/app.js";

const IN = [
  ["scan", "Scan", "Staff photograph items"],
  ["read", "Read", "Names and counts"],
  ["board", "Board", "Every open board changes"],
  ["message", "Message", "People waiting are told"],
  ["reserve", "Reserve", "A student holds items"],
];
const OUT = [
  ["code", "Code", "Student walks in"],
  ["handover", "Hand over", "Staff tick the items"],
  ["log", "Log", "One line per step"],
];
const LOG_NOTE = "Who, what, when. Donor numbers come from here.";
const LOG_ROWS = 12;

let events = [];
let socketOn = false;

const node = ([id, label, head]) =>
  `<article class="node" data-stage="${id}"><div class="micro">${esc(label)}</div><h3>${esc(head)}</h3><p></p><time></time></article>`;

$("#laneIn").innerHTML = IN.map(node).join("");
$("#laneOut").innerHTML = OUT.map(node).join("") +
  `<article class="node ghost"><div class="micro">Not built today</div><h3>Admin</h3>` +
  `<p>Graduate assistants. Donor totals, in and out by month, no shows. Same log, one more page.</p></article>`;

function paint() {
  const today = events.filter((e) => isToday(e.at));
  const latest = new Map();
  for (const e of today) latest.set(e.stage, e);
  const last = today[today.length - 1];

  for (const el of document.querySelectorAll(".node[data-stage]")) {
    const stage = el.dataset.stage;
    const e = stage === "log" ? last : latest.get(stage);
    el.classList.toggle("lit", Boolean(e));
    el.querySelector("p").textContent = stage === "log" ? LOG_NOTE : (e ? e.detail : "");
    el.querySelector("time").textContent = e ? clockSeconds(e.at) : "";
  }

  $("#log").innerHTML = today.slice(-LOG_ROWS).map((e) => `
    <div class="log-row"><span class="t">${esc(clockSeconds(e.at))}</span><span class="who">${esc(e.actor || "")}</span><span>${esc(e.detail || "")}</span></div>`).join("") ||
    `<div class="log-row"><span class="t"></span><span class="who"></span><span class="muted">Nothing yet today. The first scan lights the first node.</span></div>`;

  $("#live").classList.toggle("on", socketOn);
  $("#live").textContent = socketOn ? `Live · ${weekdayClock()}` : weekdayClock();
}

async function load() {
  const { data, error } = await db().from("events").select("*").order("id", { ascending: false }).limit(300);
  if (error) return;
  events = data.reverse();
  paint();
}

await start();
live("events", (p) => {
  if (p.eventType === "INSERT" && p.new) {
    events.push(p.new);
    paint();
  }
}, (on) => { socketOn = on; paint(); if (on) load(); });
onWake(load);
setInterval(paint, 15_000);
load();
