// The student board at /: a live grid of item cards with category chips,
// the item sheet with Add to bag, and the switch between the board, the bag
// and the code screen (by URL hash, so the phone's back gesture works).
// Counts arrive live over Supabase realtime on items. Nothing needs a refresh.

import {
  start, db, api, live, onWake, openLine, openState, weekHours, arrived, formatTime, formatDay, isToday, esc, $, registerWorker,
} from "/js/app.js";
import { CATEGORIES, CATEGORY_IMAGES, SHORT, catLabel, photoFor, unitFor } from "/js/catalog.js";
import { boardHtml, openGroups } from "/js/board-groups.js";
import { store } from "/js/student-store.js";
import { initBag } from "/js/bag.js";
import { openTellMe } from "/js/follow.js";
import { initJoin } from "/js/join.js";

const cfg = await start();
registerWorker();

const ctx = {
  cfg,
  items: new Map(),
  slots: null,
  render: () => schedule(),
  openSheet,
  closeSheet,
  go,
};
let filter = "All";
let query = "";
let socketOn = false;

const qtyOf = (i) => Number(i?.qty) || 0;
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

// ---- Data ----

async function loadItems() {
  const { data, error } = await db().from("items").select("*");
  if (error) return;
  ctx.items = new Map(data.map((i) => [i.id, i]));
  schedule();
}

async function loadSlots() {
  try {
    ctx.slots = await api("slots", null, { method: "GET" });
  } catch {
    ctx.slots = null;
  }
  schedule();
}

function onChange(payload) {
  if (payload.eventType === "DELETE") {
    ctx.items.delete(payload.old?.id);
  } else if (payload.new?.id) {
    const before = ctx.items.get(payload.new.id);
    ctx.items.set(payload.new.id, payload.new);
    // Back on the shelf: the follow was used up on the server, so stop showing it.
    if (qtyOf(payload.new) > 0 && qtyOf(before) <= 0) store.unfollow(payload.new.id);
  }
  schedule();
}

// ---- Board ----

function sorted(list) {
  const inStock = list.filter((i) => qtyOf(i) > 0)
    .sort((a, b) => (Date.parse(b.arrived_at) || 0) - (Date.parse(a.arrived_at) || 0) || a.name.localeCompare(b.name));
  const out = list.filter((i) => qtyOf(i) <= 0)
    .sort((a, b) => (Date.parse(b.out_at) || 0) - (Date.parse(a.out_at) || 0) || a.name.localeCompare(b.name));
  return [...inStock, ...out];
}

function cardHtml(i) {
  const qty = qtyOf(i);
  const out = qty <= 0;
  const inBag = store.bag[i.id];
  const id = esc(i.id);
  const name = esc(i.name);
  const max = Math.min(Number(i.max_per_pickup) || 2, qty);

  // On the photo: the in bag badge, the stock photo note, and + or the stepper.
  let onPhoto = "";
  if (!out && inBag) {
    onPhoto = `<div class="stepper mini act">` +
      `<button type="button" data-bag="${id}" data-step="-1" aria-label="One less ${name}">−</button>` +
      `<output>${Math.min(inBag, max)}</output>` +
      `<button type="button" data-bag="${id}" data-step="1" aria-label="One more ${name}"${inBag >= max ? " disabled" : ""}>+</button></div>`;
  } else if (!out) {
    onPhoto = `<button class="round act" data-add="${id}" aria-label="Add ${name} to your bag">+</button>`;
  }
  const badge = inBag && !out ? `<span class="bagtag">${inBag} in bag</span>` : "";
  const stock = i.photo_url || inBag ? "" : `<span class="stock-tag">Stock photo</span>`;

  const count = out
    ? `<div class="count out">Out</div>`
    : `<div class="count">${qty}${i.unit ? ` ${esc(unitFor(qty, i.unit))}` : ""}</div>`;
  const when = out ? (i.out_at ? `since ${formatTime(i.out_at)}` : "") : arrived(i.arrived_at);
  const best = i.best_by && !out ? `<span class="badge">Best by ${esc(formatDay(i.best_by))}</span>` : "";
  const follow = out
    ? (store.following[i.id]
      ? `<span class="tag-green act">Following</span>`
      : `<button class="tag-line act" data-tell="${id}">Tell me</button>`)
    : "";

  return `<article class="card${out ? " out" : ""}">
    <button class="card-open" data-open="${id}" aria-label="${name}, ${out ? "Out" : `${qty} on the shelf`}"></button>
    <div class="pic"><img class="photo" src="${esc(photoFor(i))}" alt="${name}" loading="lazy">${badge}${stock}${onPhoto}</div>
    <div class="body"><div class="name">${name}</div>${count}<div class="when">${esc(when)}</div>${best}${follow}</div>
  </article>`;
}

function paintHeader() {
  const open = openLine(cfg.hours);
  $("#openLine").textContent = `${open} · ${cfg.place}`;
  $("#live").classList.toggle("on", socketOn);
  $("#openSide").textContent = open;
  $("#openSide").classList.toggle("on", openState(cfg.hours).open && socketOn);
  const slots = ctx.slots ? ` · ${ctx.slots.left} of ${ctx.slots.cap} pickup slots left today` : "";
  $("#weekHours").innerHTML = weekHours(cfg.hours)
    .map(([d, h]) => `<span><b>${esc(d)}</b> ${esc(h)}</span>`).join("") +
    `<span>${esc(cfg.place)}${esc(slots)}</span>`;

  const lines = store.bagLines();
  const follows = Object.keys(store.following).length;
  $("#bagPill").hidden = !lines;
  $("#bagPill").textContent = `Bag · ${lines}`;
  $("#followPill").hidden = !follows;
  $("#followPill").textContent = `Following · ${follows}`;

  const bar = $("#bagBar");
  if (lines) {
    bar.innerHTML = `<span>${plural(lines, "item", "items")} in your bag</span><span>Reserve ›</span>`;
    bar.dataset.go = "bag";
    bar.hidden = false;
  } else if (store.held) {
    bar.innerHTML = `<span>Your pickup code ${esc(store.held.code)}</span><span>Show ›</span>`;
    bar.dataset.go = "code";
    bar.hidden = false;
  } else {
    bar.hidden = true;
  }
}

function paintBoard() {
  const all = [...ctx.items.values()];
  const cats = CATEGORIES.filter((c) => all.some((i) => i.category === c));
  if (filter !== "All" && !cats.includes(filter)) filter = "All";
  $("#chips").innerHTML =
    `<button class="bubble" data-cat="All" aria-pressed="${filter === "All"}">` +
      `<span class="bubble-img">${all.length}</span><span class="bubble-label">All</span></button>` +
    cats.map((c) => `<button class="bubble" data-cat="${esc(c)}" aria-pressed="${filter === c}">` +
      `<span class="bubble-img"><img src="${esc(CATEGORY_IMAGES[c])}" alt="" loading="lazy"></span>` +
      `<span class="bubble-label">${esc(SHORT[c] || c)}</span></button>`).join("");
  const q = query.trim().toLowerCase();
  const inCat = filter === "All" ? all : all.filter((i) => i.category === filter);
  const shown = sorted(q ? inCat.filter((i) => i.name.toLowerCase().includes(q)) : inCat);
  $("#board").innerHTML = boardHtml(shown, filter === "All" && !q, cardHtml);
  paintToday(all, q);
  $("#boardEmpty").hidden = all.length > 0;
  $("#searchEmpty").hidden = !(all.length && q && !shown.length);
  $("#searchEmpty").textContent = `Nothing on the shelf matches "${query.trim()}".`;
}

let pending = false;
function schedule() {
  if (pending) return;
  pending = true;
  requestAnimationFrame(() => {
    pending = false;
    paintHeader();
    if (view === "board") paintBoard();
    if (view === "bag") bag.paintBag();
    if (view === "code") bag.paintCode();
  });
}

// What arrived today, newest first, as photo tiles above the grid.
function paintToday(all, q) {
  const fresh = all
    .filter((i) => qtyOf(i) > 0 && i.arrived_at && isToday(i.arrived_at))
    .sort((a, b) => Date.parse(b.arrived_at) - Date.parse(a.arrived_at));
  $("#todayRow").hidden = !fresh.length || Boolean(q);
  $("#todayTiles").innerHTML = fresh.map((i) => `
    <button class="tile" data-open="${esc(i.id)}">
      <img src="${esc(photoFor(i))}" alt="" loading="lazy">
      <span class="tile-name">${esc(i.name)}</span>
      <span class="tile-when">${esc(`${qtyOf(i)}${i.unit ? ` ${unitFor(qtyOf(i), i.unit)}` : ""} · ${formatTime(i.arrived_at)}`)}</span>
    </button>`).join("");
}

// ---- Item sheet ----

function openSheet(html) {
  $("#sheetBody").innerHTML = html;
  $("#scrim").hidden = false;
  $("#sheet").hidden = false;
}

function closeSheet() {
  $("#scrim").hidden = true;
  $("#sheet").hidden = true;
  $("#sheetBody").innerHTML = "";
}

function openItem(id) {
  const i = ctx.items.get(id);
  if (!i) return;
  if (qtyOf(i) <= 0) return openTellMe(ctx, i);
  const max = Math.max(1, Math.min(Number(i.max_per_pickup) || 2, qtyOf(i)));
  let n = Math.min(store.bag[id] || 1, max);
  const win = ctx.slots;
  const when = win?.open === false
    ? `Reserving opens again ${win.opens || "next pantry day"}. You can walk in when the pantry is open.`
    : `Reserve now, pick up at the desk before ${win?.closes || openState(cfg.hours).closes || "closing"} with your code.`;
  const photo = `<div class="shot-wrap"><img class="shot-lg" src="${esc(photoFor(i))}" alt="${esc(i.name)}">` +
    `${i.photo_url ? "" : `<span class="stock-tag">Stock photo until staff scan it in</span>`}</div>`;
  openSheet(`
    ${photo}
    <div class="sheet-head">
      <div><h2>${esc(i.name)}</h2>
        <div class="muted">${esc([catLabel(i.category), i.arrived_at ? `arrived ${formatTime(i.arrived_at)}` : ""].filter(Boolean).join(" · "))}</div></div>
      <div class="big">${qtyOf(i)}${i.unit ? `<small>${esc(unitFor(qtyOf(i), i.unit))}</small>` : ""}</div>
    </div>
    ${i.best_by ? `<p class="muted" style="margin:10px 0 0">Best by ${esc(formatDay(i.best_by))}, as printed on the pack.</p>` : ""}
    <p class="say-line">Take up to ${max} per pickup. ${esc(when)}</p>
    <div class="howmany"><span>How many</span>
      <div class="stepper"><button type="button" data-step="-1" aria-label="One less">−</button><output id="howMany">${n}</output><button type="button" data-step="1" aria-label="One more">+</button></div>
    </div>
    <button class="btn btn-primary" id="addToBag">${store.bag[id] ? "Change the bag" : "Add to bag"}</button>
    ${store.bag[id] ? `<button class="btn btn-text" id="takeOut">Take it out of the bag</button>` : ""}`);

  $("#sheetBody").onclick = (e) => {
    const step = e.target.closest("[data-step]");
    if (step) {
      n = Math.max(1, Math.min(max, n + Number(step.dataset.step)));
      $("#howMany").textContent = String(n);
    }
    if (e.target.closest("#addToBag")) {
      store.setBag(id, n);
      closeSheet();
      schedule();
    }
    if (e.target.closest("#takeOut")) {
      store.setBag(id, 0);
      closeSheet();
      schedule();
    }
  };
}

$("#scrim").addEventListener("click", closeSheet);
document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeSheet(); });

$("#todayTiles").addEventListener("click", (e) => {
  const tile = e.target.closest("[data-open]");
  if (tile) openItem(tile.dataset.open);
});

$("#board").addEventListener("click", (e) => {
  const step = e.target.closest("[data-bag]");
  if (step) {
    const i = ctx.items.get(step.dataset.bag);
    const max = Math.min(Number(i?.max_per_pickup) || 2, qtyOf(i));
    store.setBag(step.dataset.bag, Math.max(0, Math.min(max, (store.bag[step.dataset.bag] || 0) + Number(step.dataset.step))));
    return schedule();
  }
  const add = e.target.closest("[data-add]");
  const tell = e.target.closest("[data-tell]");
  const open = e.target.closest("[data-open]");
  if (add) {
    // One tap puts one in the bag; the stepper on the card takes it from there.
    store.setBag(add.dataset.add, 1);
    return schedule();
  }
  if (tell) return openTellMe(ctx, ctx.items.get(tell.dataset.tell));
  if (open) return openItem(open.dataset.open);
});

// Remember which dropdowns are open, so live updates do not close them.
$("#board").addEventListener("toggle", (e) => {
  const group = e.target.closest?.("[data-group]");
  if (!group) return;
  if (group.open) openGroups.add(group.dataset.group);
  else openGroups.delete(group.dataset.group);
}, true);

$("#search").addEventListener("input", (e) => {
  query = e.target.value;
  paintBoard();
});

$("#chips").addEventListener("click", (e) => {
  const chip = e.target.closest("[data-cat]");
  if (!chip) return;
  filter = chip.dataset.cat;
  paintBoard();
});

// ---- Views ----

let view = "board";
const VIEWS = { board: "#vBoard", bag: "#vBag", code: "#vCode" };

function go(name) {
  const hash = name === "board" ? "" : `#${name}`;
  if (location.hash !== hash) location.hash = hash;
  else showView();
}

function showView() {
  const name = location.hash.replace("#", "");
  view = VIEWS[name] ? name : "board";
  if (view === "code" && !store.held) view = "board";
  for (const [key, sel] of Object.entries(VIEWS)) $(sel).hidden = key !== view;
  closeSheet();
  window.scrollTo(0, 0);
  if (view === "bag") loadSlots();
  schedule();
}

window.addEventListener("hashchange", showView);
document.addEventListener("click", (e) => {
  const to = e.target.closest("[data-go]");
  if (to) go(to.dataset.go);
});
$("#bagPill").addEventListener("click", () => go("bag"));

// ---- Start ----

const bag = initBag(ctx);
initJoin();
showView();
live("items", onChange, (on) => { socketOn = on; schedule(); });
onWake(() => { loadItems(); loadSlots(); bag.refreshHeld(); });
setInterval(() => { paintHeader(); }, 30_000);
loadItems();
loadSlots();
bag.refreshHeld();
