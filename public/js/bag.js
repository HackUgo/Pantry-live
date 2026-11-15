// The bag and the code screen. The bag holds what a student picked on the
// board. Reserve for pickup sends it with their name and CMU email and comes
// back with a 4 character code. The code screen shows that hold until it is
// handed over or released. One hold at a time per phone.

import { api, esc, $ } from "/js/app.js";
import { store } from "/js/student-store.js";
import { catLabel, photoFor, unitFor } from "/js/catalog.js";
import qrcode from "/js/vendor/qrcode.mjs";

const qtyOf = (i) => Number(i?.qty) || 0;

function randomId() {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
}

export function initBag(ctx) {
  let request = randomId(); // one per bag; a retried tap reuses it
  let releaseArmed = false;

  function lines() {
    return Object.entries(store.bag)
      .map(([id, n]) => ({ item: ctx.items.get(id), id, n }))
      .filter((l) => l.item);
  }

  function paintBag() {
    const s = ctx.slots;
    const held = store.held;
    const open = s ? s.open : true;
    $("#bagOpen").textContent = open && s?.closes ? `Open until ${s.closes}` : (s?.opens ? `Opens ${s.opens}` : "");
    $("#bagOpen").classList.toggle("on", Boolean(open && s?.closes));

    $("#bagLede").innerHTML = held
      ? `You have items held under <b>${esc(held.code)}</b>. Pick them up or release them first.`
      : open
        ? `Held at the desk until ${esc(s?.closes || "closing")} today. Walk in, say your name, give the code.`
        : `Reserving opens again ${esc(s?.opens || "on the next pantry day")}.`;

    const list = lines();
    $("#bagRows").innerHTML = list.length
      ? list.map(({ item, id, n }) => {
          const qty = qtyOf(item);
          const max = Math.min(Number(item.max_per_pickup) || 2, qty);
          const shelf = qty <= 0 ? "Out now" : `${item.unit ? `${qty} ${esc(unitFor(qty, item.unit))}` : `${qty} on the shelf`} · up to ${max}`;
          return `<div class="row" data-id="${esc(id)}">
            <div class="left"><img class="thumb" src="${esc(photoFor(item))}" alt=""><div><div class="name">${esc(item.name)}</div><div class="sub">${shelf}</div></div></div>
            <div class="stepper"><button type="button" data-step="-1" aria-label="One less">−</button><output>${n}</output><button type="button" data-step="1" aria-label="One more">+</button></div>
          </div>`;
        }).join("")
      : `<p class="muted" style="margin:14px 0">Your bag is empty. Tap + on anything on the board.</p>`;

    if (!$("#pickName").value) $("#pickName").value = store.me.name || "";
    if (!$("#pickEmail").value) $("#pickEmail").value = store.me.email || "";
    $("#slotsLine").textContent = `The desk checks you in by name, same as walking in.${s ? ` ${s.left} of ${s.cap} pickup slots left today.` : ""}`;

    const ready = list.length > 0 && !held && open && (!s || s.left > 0) && list.every((l) => qtyOf(l.item) >= l.n);
    $("#reserveBtn").disabled = !ready;
  }

  $("#bagRows").addEventListener("click", (e) => {
    const step = e.target.closest("[data-step]");
    if (!step) return;
    const id = step.closest("[data-id]").dataset.id;
    const item = ctx.items.get(id);
    const max = Math.min(Number(item?.max_per_pickup) || 2, qtyOf(item));
    const n = Math.max(0, Math.min(max, (store.bag[id] || 0) + Number(step.dataset.step)));
    store.setBag(id, n);
    request = randomId();
    ctx.render();
  });

  $("#reserveBtn").addEventListener("click", async () => {
    const btn = $("#reserveBtn");
    const name = $("#pickName").value.trim();
    const email = $("#pickEmail").value.trim().toLowerCase();
    btn.disabled = true;
    $("#reserveSay").textContent = "Holding your items";
    try {
      const res = await api("reserve", {
        name, email, request_id: request,
        items: lines().map((l) => ({ id: l.id, n: l.n })),
      });
      store.setMe(name, email);
      store.setHeld({ ...res, email });
      store.clearBag();
      request = randomId();
      $("#reserveSay").textContent = "";
      ctx.go("code");
    } catch (err) {
      $("#reserveSay").textContent = err.message;
      btn.disabled = false;
    }
  });

  function paintCode() {
    const h = store.held;
    if (!h) return;
    $("#codeBig").textContent = h.code;
    // The desk phone's camera opens this straight onto Hand over.
    const qr = qrcode(0, "M");
    qr.addData(`${location.origin}/volunteer#pickup=${h.code}`);
    qr.make();
    $("#codeQr").innerHTML = qr.createSvgTag({ cellSize: 5, margin: 3, scalable: true });
    $("#codeMeta").textContent = `${h.name.split(/\s+/)[0]} · ${h.place || ctx.cfg.place} · before ${h.closes || "closing"} today`;
    $("#codeRows").innerHTML = h.items.map((i) => `
      <div class="row"><div class="left"><img class="thumb" src="${esc(photoFor(ctx.items.get(i.id) || i))}" alt="">` +
      `<div><div class="name">${esc(i.name)}</div><div class="sub">${esc(catLabel(i.category))}</div></div></div><span class="qty">${i.n}</span></div>`).join("");
    $("#releaseBtn").textContent = releaseArmed ? "Tap again to release them" : "Release my items";
  }

  $("#releaseBtn").addEventListener("click", async () => {
    const h = store.held;
    if (!h) return;
    if (!releaseArmed) {
      releaseArmed = true;
      paintCode();
      setTimeout(() => { releaseArmed = false; paintCode(); }, 4000);
      return;
    }
    releaseArmed = false;
    $("#releaseBtn").disabled = true;
    try {
      await api("release", { code: h.code, email: h.email });
      store.setHeld(null);
      ctx.go("board");
    } catch (err) {
      $("#codeSay").textContent = err.message;
    } finally {
      $("#releaseBtn").disabled = false;
    }
  });

  // Asks the server whether the hold still stands. A handed over or released
  // hold is cleared from this phone.
  async function refreshHeld() {
    const h = store.held;
    if (!h) return;
    try {
      const now = await api("pickup", { code: h.code, email: h.email });
      if (now.status !== "held") {
        store.setHeld(null);
        if (location.hash === "#code") ctx.go("board");
      }
    } catch (err) {
      if (/No pickup/.test(err.message)) store.setHeld(null);
    }
    ctx.render();
  }

  return { paintBag, paintCode, refreshHeld };
}
