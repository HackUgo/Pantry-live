// The staff space at /volunteer: sign in with the desk PIN, pick a name, and
// Today. Scan in lives in staff-scan.js and the desk (pickups, hand over) in
// staff-desk.js. This file owns the views and starts both.
// The PIN lives in this tab's sessionStorage only and goes with every call.

import {
  start, db, api, live, onWake, openLine, formatTime, isToday, weekdayClock, esc, $, registerWorker,
} from "/js/app.js";
import { photoFor, unitFor } from "/js/catalog.js";
import { initScan } from "/js/staff-scan.js";
import { initDesk } from "/js/staff-desk.js";
import { initTools } from "/js/staff-tools.js";

const NAMES = ["Ugonna", "Maya", "Leon", "Hannah", "Praise"];

const cfg = await start();
registerWorker();

const store = {
  get: (s, k) => { try { return s.getItem(k) || ""; } catch { return ""; } },
  set: (s, k, v) => { try { v ? s.setItem(k, v) : s.removeItem(k); } catch { /* private mode */ } },
};
const session = window.sessionStorage;
const local = window.localStorage;

const state = {
  pin: store.get(session, "pl-pin"),
  name: store.get(session, "pl-shift"),
  items: [],
  today: null,
  photo: null,
  rows: [],
  reading: null,
};

// ---- Views ----

const VIEWS = ["vPin", "vWho", "vToday", "vReading", "vReview", "vPublished", "vPickups", "vHand", "vMessage"];
let current = "";
let backAction = null;

function show(id, bar = {}) {
  current = id;
  for (const v of VIEWS) $(`#${v}`).hidden = v !== id;
  $("#back").hidden = !bar.back;
  $("#back").textContent = bar.back ? `‹ ${bar.back}` : "";
  $("#brand").hidden = Boolean(bar.back);
  $("#tag").textContent = bar.tag || "Staff";
  $("#tag").classList.toggle("muted", Boolean(bar.tag));
  backAction = bar.onBack || null;
  window.scrollTo(0, 0);
}
$("#back").addEventListener("click", () => backAction?.());

// The phone's back gesture leaves Reading or Review for Today, publishing nothing.
window.addEventListener("popstate", () => {
  if (current === "vReading" || current === "vReview") scan.cancelScan();
});

// ---- Sign in ----

function pinView() {
  show("vPin");
  $("#pinInput").value = "";
  paintPin("");
  setTimeout(() => $("#pinInput").focus(), 60);
}

function paintPin(value) {
  [...$("#pinBoxes").querySelectorAll("span")].forEach((box, i) => {
    box.textContent = value[i] || "";
    box.classList.toggle("next", i === value.length);
  });
}

$("#pinInput").addEventListener("input", async (e) => {
  const input = e.target;
  const value = input.value.replace(/\D/g, "").slice(0, 4);
  input.value = value;
  paintPin(value);
  $("#pinSay").textContent = "";
  if (value.length < 4) return;
  input.disabled = true;
  try {
    await api("staff/check", {}, { pin: value });
    state.pin = value;
    store.set(session, "pl-pin", value);
    input.blur();
    whoView();
  } catch (err) {
    $("#pinBoxes").classList.add("shake");
    setTimeout(() => $("#pinBoxes").classList.remove("shake"), 320);
    $("#pinSay").textContent = err.message;
    input.value = "";
    paintPin("");
  } finally {
    input.disabled = false;
    if (current === "vPin") input.focus();
  }
});

// ---- Who is on the shelf ----

let picked = "";

function whoView() {
  const last = store.get(local, "pl-last-name");
  $("#whoLede").textContent =
    "Your name goes on every photo you publish, so the log says who checked what." +
    (last ? ` Last time on this phone: ${last}.` : "");
  picked = last ? (NAMES.includes(last) ? last : "else") : "";
  $("#otherName").value = picked === "else" ? last : "";
  paintWho();
  show("vWho");
}

function chosenName() {
  return picked === "else" ? $("#otherName").value.trim() : picked;
}

function paintWho() {
  $("#names").innerHTML =
    NAMES.map((n) => `<button class="name-pill" data-name="${esc(n)}" aria-pressed="${picked === n}">${esc(n)}</button>`).join("") +
    `<button class="name-pill else" data-name="else" aria-pressed="${picked === "else"}">Someone else</button>`;
  $("#otherName").hidden = picked !== "else";
  const name = chosenName();
  $("#continue").disabled = !name;
  $("#continue").textContent = name ? `Continue as ${name}` : "Continue";
}

$("#names").addEventListener("click", (e) => {
  const btn = e.target.closest("[data-name]");
  if (!btn) return;
  picked = btn.dataset.name;
  paintWho();
  if (picked === "else") $("#otherName").focus();
});
$("#otherName").addEventListener("input", paintWho);

$("#continue").addEventListener("click", () => {
  const name = chosenName();
  if (!name) return;
  state.name = name;
  store.set(session, "pl-shift", name);
  store.set(local, "pl-last-name", name);
  if (!pickupFromLink()) todayView();
});

// ---- Today ----

async function loadItems() {
  const { data, error } = await db().from("items").select("*");
  if (!error) state.items = data ?? [];
}

async function loadToday() {
  try {
    state.today = await api("staff/today", null, { pin: state.pin, method: "GET" });
  } catch (err) {
    if (/PIN/.test(err.message)) return signOut();
    state.today = null;
  }
}

async function refresh() {
  await Promise.all([loadItems(), state.pin ? loadToday() : null]);
  if (current === "vToday") paintToday();
  if (current === "vReview") scan.paintRows();
  if (current === "vPickups" || current === "vHand") desk.refresh();
}

function qtyHtml(item) {
  const qty = Number(item.qty) || 0;
  if (qty <= 0) return `<span class="qty" style="color:var(--red)">Out</span>`;
  return `<span class="qty">${qty}${item.unit ? `<small>${esc(unitFor(qty, item.unit))}</small>` : ""}</span>`;
}

function photoHtml(item) {
  return `<img class="thumb" src="${esc(photoFor(item))}" alt="" loading="lazy">`;
}

function students(n) {
  return n === 1 ? "1 student" : `${n} students`;
}

function paintToday() {
  $("#todayClock").textContent = weekdayClock(Date.now(), ", ");
  $("#todayLede").textContent = `${openLine(cfg.hours)} · ${state.name} on shift`;

  const t = state.today;
  $("#pickupsLine").textContent = t
    ? `${t.waiting} waiting at the desk · ${t.today} of ${t.cap} today`
    : "Pickups did not load. Pull down to try again.";

  const arrived = state.items
    .filter((i) => isToday(i.arrived_at))
    .sort((a, b) => Date.parse(b.arrived_at) - Date.parse(a.arrived_at));
  $("#arrived").innerHTML = arrived.length
    ? arrived.map((i) => `
        <div class="row">
          <div class="left">${photoHtml(i)}
            <div><div class="name">${esc(i.name)}</div>
            <div class="sub">${esc(formatTime(i.arrived_at))}${i.by_name ? ` · ${esc(i.by_name)}` : ""}</div></div>
          </div>
          <div class="row-end">${qtyHtml(i)}<button class="tag-line" data-remove="${esc(i.id)}">Remove</button></div>
        </div>`).join("")
    : `<p class="muted" style="margin:14px 0">Nothing scanned in yet today.</p>`;
  $("#removeToday").hidden = !arrived.length;

  const followers = t?.followers ?? {};
  $("#outNotes").textContent = state.items
    .filter((i) => (Number(i.qty) || 0) <= 0 && followers[i.id] > 0)
    .map((i) => {
      const lower = i.name.toLowerCase();
      const when = i.out_at ? `${i.name} ran out at ${formatTime(i.out_at)}.` : `No ${lower} on the shelf.`;
      return `${when} ${students(followers[i.id])} asked to be told when ${lower} arrive.`;
    })
    .join(" ");
}

function todayView() {
  show("vToday");
  paintToday();
  refresh();
}

function signOut() {
  state.pin = "";
  state.name = "";
  store.set(session, "pl-pin", "");
  store.set(session, "pl-shift", "");
  pinView();
}
$("#signOut").addEventListener("click", signOut);

setInterval(() => { if (current === "vToday") paintToday(); }, 30_000);
live("items", refresh);
onWake(refresh);

// ---- Scan in and the desk live in their own modules ----

const ctx = {
  state, show, todayView, signOut, students,
  current: () => current,
  refreshToday: () => refresh(),
};
const scan = initScan(ctx);
const desk = initDesk(ctx);
initTools(ctx);
$("#pickupsOpen").addEventListener("click", () => desk.open());

// A desk phone scanned a student's QR: /volunteer#pickup=7K4M.
function pickupFromLink() {
  const m = location.hash.match(/pickup=([2-9A-HJ-NP-Z]{4})/i);
  if (!m) return false;
  history.replaceState(null, "", location.pathname);
  desk.openCode(m[1].toUpperCase());
  return true;
}

// ---- Start ----

if (!state.pin) {
  pinView();
} else {
  try {
    await api("staff/check", {}, { pin: state.pin });
    if (!state.name) whoView();
    else if (!pickupFromLink()) todayView();
  } catch {
    signOut();
  }
}
