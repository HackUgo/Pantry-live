// The desk, for staff: Pickups (today's holds, searchable by code or name,
// waiting first, then done) and Hand over (tick what the student took, then
// Handed over. Anything unticked goes back on the board. Or Did not come,
// which releases everything). Opening a hold logs that the student checked in.
// Live: a new reserve or hand over in the event log refreshes the list.

import { api, live, formatTime, esc, $ } from "/js/app.js";
import { photoFor } from "/js/catalog.js";

export function initDesk(ctx) {
  const { state, show, signOut } = ctx;
  let lists = { waiting: [], done: [] };
  let open = null;   // the hold on the Hand over screen
  let ticked = new Set();
  let releaseArmed = false;
  const checkedIn = new Set();

  const itemsLine = (r) => r.items.map((i) => `${i.name} ${i.n}`).join(" · ");

  async function load() {
    try {
      lists = await api("staff/pickups", null, { pin: state.pin, method: "GET" });
    } catch (err) {
      if (/PIN/.test(err.message)) return signOut();
      $("#waitingRows").innerHTML = `<p class="muted" style="margin:14px 0">${esc(err.message)}</p>`;
      return;
    }
    paint();
  }

  function matches(r, q) {
    if (!q) return true;
    return r.code.includes(q.toUpperCase()) || r.name.toLowerCase().includes(q.toLowerCase());
  }

  function paint() {
    const q = $("#pickSearch").value.trim();
    const waiting = lists.waiting.filter((r) => matches(r, q));
    const done = lists.done.filter((r) => matches(r, q));
    $("#waitingHead").textContent = `Waiting · ${lists.waiting.length}`;
    $("#doneHead").textContent = `Done today · ${lists.done.length}`;
    $("#waitingRows").innerHTML = waiting.length
      ? waiting.map((r) => `
          <button class="pick" data-code="${esc(r.code)}">
            <span class="code-sm">${esc(r.code)}</span>
            <span><span class="name">${esc(r.name)}</span><br><span class="sub">${esc(itemsLine(r))} · reserved ${esc(formatTime(r.created_at))}</span></span>
            <span class="muted">›</span>
          </button>`).join("")
      : `<p class="muted" style="margin:14px 0">${q ? "No waiting pickup matches." : "Nobody is waiting."}</p>`;
    $("#releaseWaiting").hidden = !lists.waiting.length;
    $("#releaseWaiting").textContent = "Release everyone still waiting";
    $("#doneRows").innerHTML = done.map((r) => {
      const given = r.items.filter((i) => i.given !== false);
      return `<div class="pick done">
          <span class="code-sm">${esc(r.code)}</span>
          <span><span class="name">${esc(r.name)}</span><br><span class="sub">${esc(given.map((i) => `${i.name} ${i.n}`).join(" · "))} · handed over ${esc(formatTime(r.closed_at))}</span></span>
          <span class="tick static" aria-label="Done">✓</span>
        </div>`;
    }).join("");
  }

  function openPickups() {
    open = null;
    show("vPickups", { back: "Today", onBack: () => ctx.todayView() });
    paint();
    load();
  }

  function openHand(code) {
    const r = lists.waiting.find((x) => x.code === code);
    if (!r) return;
    open = r;
    ticked = new Set(r.items.map((i) => i.id));
    releaseArmed = false;
    show("vHand", { back: "Pickups", onBack: openPickups });
    paintHand();
    if (!checkedIn.has(code)) {
      checkedIn.add(code);
      api("checkin", { code, by_name: state.name }, { pin: state.pin }).catch(() => checkedIn.delete(code));
    }
  }

  function paintHand() {
    const r = open;
    $("#handName").textContent = r.name;
    $("#handLede").textContent = `Code ${r.code} · reserved ${formatTime(r.created_at)} · checked in at the desk`;
    $("#handRows").innerHTML = r.items.map((i) => `
      <div class="row">
        <div class="left"><img class="thumb" src="${esc(photoFor(state.items.find((x) => x.id === i.id) || i))}" alt="">
          <div><div class="name">${esc(i.name)}</div><div class="sub">${esc(i.category || "")}</div></div></div>
        <div style="display:flex;align-items:center;gap:16px"><span class="qty">${i.n}</span>
          <button class="tick" data-id="${esc(i.id)}" aria-pressed="${ticked.has(i.id)}" aria-label="${esc(i.name)} handed over">${ticked.has(i.id) ? "✓" : ""}</button></div>
      </div>`).join("");
    const n = ticked.size;
    $("#handBtn").textContent = n === r.items.length ? "Handed over" : `Handed over, ${n} of ${r.items.length}`;
    $("#handBtn").disabled = n === 0;
    $("#noShowBtn").textContent = releaseArmed ? "Tap again to release everything" : "Did not come, release the items";
    $("#handSay").textContent = "";
  }

  $("#waitingRows").addEventListener("click", (e) => {
    const pick = e.target.closest("[data-code]");
    if (pick) openHand(pick.dataset.code);
  });
  $("#pickSearch").addEventListener("input", paint);
  $("#pickSearch").addEventListener("keydown", (e) => {
    if (e.key !== "Enter") return;
    const q = e.target.value.trim();
    const hits = lists.waiting.filter((r) => matches(r, q));
    if (hits.length === 1) openHand(hits[0].code);
  });

  $("#handRows").addEventListener("click", (e) => {
    const t = e.target.closest("[data-id]");
    if (!t) return;
    const id = t.dataset.id;
    if (ticked.has(id)) ticked.delete(id);
    else ticked.add(id);
    paintHand();
  });

  $("#handBtn").addEventListener("click", async () => {
    $("#handBtn").disabled = true;
    try {
      await api("handover", { code: open.code, given: [...ticked], by_name: state.name }, { pin: state.pin });
      openPickups();
    } catch (err) {
      if (/PIN/.test(err.message)) return signOut();
      $("#handSay").textContent = err.message;
      $("#handBtn").disabled = false;
    }
  });

  $("#noShowBtn").addEventListener("click", async () => {
    if (!releaseArmed) {
      releaseArmed = true;
      paintHand();
      setTimeout(() => { if (open) { releaseArmed = false; paintHand(); } }, 4000);
      return;
    }
    releaseArmed = false;
    try {
      await api("release", { code: open.code, by_name: state.name }, { pin: state.pin });
      openPickups();
    } catch (err) {
      if (/PIN/.test(err.message)) return signOut();
      $("#handSay").textContent = err.message;
    }
  });

  // A reserve, release or hand over anywhere shows up here without a refresh.
  live("events", (p) => {
    if (!["reserve", "handover"].includes(p.new?.stage)) return;
    if (ctx.current() === "vPickups") load();
    if (ctx.current() === "vToday") ctx.refreshToday();
  });

  // Straight to Hand over for one code, from a scanned QR.
  async function openCode(code) {
    show("vPickups", { back: "Today", onBack: () => ctx.todayView() });
    await load();
    if (lists.waiting.some((r) => r.code === code)) return openHand(code);
    $("#pickSearch").value = code;
    paint();
    const done = lists.done.some((r) => r.code === code);
    $("#waitingRows").innerHTML = `<p class="muted" style="margin:14px 0">${done ? `${esc(code)} was already handed over.` : `No pickup is waiting under ${esc(code)}.`}</p>`;
  }

  let releaseAllArmed = false;
  $("#releaseWaiting").addEventListener("click", async () => {
    if (!releaseAllArmed) {
      releaseAllArmed = true;
      $("#releaseWaiting").textContent = "Tap again to release everyone waiting";
      setTimeout(() => { releaseAllArmed = false; paint(); }, 4000);
      return;
    }
    releaseAllArmed = false;
    try {
      const out = await api("staff/release-waiting", { by_name: state.name }, { pin: state.pin });
      $("#releaseSay").textContent = out.released ? `${out.released === 1 ? "1 pickup" : `${out.released} pickups`} released and emailed.` : "Nobody was waiting.";
      load();
    } catch (err) {
      if (/PIN/.test(err.message)) return signOut();
      $("#releaseSay").textContent = err.message;
    }
  });

  return { open: openPickups, openCode, refresh: load };
}
