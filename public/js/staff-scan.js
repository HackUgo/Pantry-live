// Scan in, for staff: the camera, the photo shrunk in the browser and put in
// the scans bucket, Reading while the Worker reads it, Review where the
// volunteer fixes names, categories and counts, Put on the board, and the
// Published screen with its 60 second undo. Started by staff.js, which owns
// sign in, Today and the view switch.

import { api, formatTime, esc, $ } from "/js/app.js";
import { CATEGORIES, matchItem, unitFor } from "/js/catalog.js";

const MAX_SIDE = 1280;
const QUALITY = 0.82;

export function initScan(ctx) {
  const { state, show, todayView, signOut, students } = ctx;

  // ---- Scan in ----

  function openCamera() {
    $("#camera").value = "";
    $("#camera").click();
  }
  $("#scanBtn").addEventListener("click", openCamera);
  $("#camera").addEventListener("change", (e) => {
    const file = e.target.files?.[0];
    if (file) readPhoto(file);
  });

  // Draws the photo at most 1280 px on the long side and makes a JPEG at 0.82.
  // Browsers apply the camera's rotation when decoding, so portrait stays portrait.
  async function shrink(file) {
    const src = URL.createObjectURL(file);
    try {
      const img = new Image();
      img.src = src;
      await img.decode();
      const scale = Math.min(1, MAX_SIDE / Math.max(img.naturalWidth, img.naturalHeight));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(img.naturalWidth * scale);
      canvas.height = Math.round(img.naturalHeight * scale);
      canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise((resolve, reject) =>
        canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("The photo could not be prepared."))), "image/jpeg", QUALITY));
      const dataUrl = await new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.readAsDataURL(blob);
      });
      return { blob, dataUrl, base64: String(dataUrl).split(",")[1], width: canvas.width, height: canvas.height };
    } finally {
      URL.revokeObjectURL(src);
    }
  }

  function randomId() {
    return globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
  }

  // The board item this row adds to: same id, or the same kind of food.
  function existingFor(name, category) {
    return name ? matchItem(name, category, state.items) ?? undefined : undefined;
  }

  async function readPhoto(file) {
    state.reading?.abort();
    const ac = new AbortController();
    state.reading = ac;
    if (ctx.current() !== "vReading" && ctx.current() !== "vReview") history.pushState({ scan: true }, "");
    show("vReading", { back: "Cancel", tag: "Scan in", onBack: cancelScan });

    const bar = $("#readingBar");
    bar.style.transition = "none";
    bar.style.width = "0";
    $(".working .spin").hidden = false;
    $("#readingSay").textContent = "Reading the photo";
    $("#readingImg").removeAttribute("src");

    try {
      const shot = await shrink(file);
      if (ac.signal.aborted) return;
      $("#readingImg").src = shot.dataUrl;
      requestAnimationFrame(() => requestAnimationFrame(() => {
        bar.style.transition = "";
        bar.style.width = "90%";
      }));

      // The Worker stores the photo and reads it in one call.
      const res = await api("scan", {
        image_base64: shot.base64,
        width: shot.width,
        height: shot.height,
        existing_items: state.items.map((i) => i.name),
      }, { pin: state.pin, signal: ac.signal });
      if (ac.signal.aborted) return;

      bar.style.width = "100%";
      state.photo = { url: res.photo_url, src: shot.dataUrl, request: randomId() };
      state.rows = (res.items ?? []).map((it) => {
        const ex = existingFor(it.name, it.category);
        return { ...it, name: ex ? ex.name : it.name, category: ex?.category || it.category, unit: ex?.unit || it.unit };
      });
      reviewView();
    } catch (err) {
      if (ac.signal.aborted) return;
      if (/PIN/.test(err.message)) return signOut();
      $(".working .spin").hidden = true;
      $("#readingSay").textContent = err.message;
    }
  }

  function cancelScan() {
    state.reading?.abort();
    state.reading = null;
    state.photo = null;
    state.rows = [];
    todayView();
  }

  // ---- Review ----

  // Which row a tap on the photo adds to.
  let active = 0;

  function reviewView() {
    active = 0;
    $("#boardNames").innerHTML = state.items.map((i) => `<option value="${esc(i.name)}"></option>`).join("");
    $("#reviewImg").src = state.photo.src;
    show("vReview", { back: "Retake", tag: "Scan in", onBack: openCamera });
    $("#publishSay").textContent = "";
    paintRows();
  }

  function statusFor(row) {
    const ex = existingFor(row.name.trim(), row.category);
    if (!row.name.trim()) return "";
    if (!ex) return "New card";
    return (Number(ex.qty) || 0) > 0 ? `Adds to ${ex.name}, ${ex.qty} on the shelf` : `Adds to ${ex.name}, was Out`;
  }

  function rowHtml(row, i) {
    const status = statusFor(row);
    const options = CATEGORIES.map((c) => `<option ${c === row.category ? "selected" : ""}>${esc(c)}</option>`).join("");
    const empty = row.count === null || row.count === undefined;
    return `
      <div class="row" data-i="${i}">
        <div style="min-width:0;flex:1">
          <input class="edit-name" data-f="name" list="boardNames" value="${esc(row.name)}" placeholder="Item name" maxlength="40" autocapitalize="sentences">
          <div class="sub"><span data-status>${esc(status)}</span><span data-dot>${status ? " · " : ""}</span><label class="catpick"><span data-cat>${esc(row.category)}</span>&nbsp;▾<select data-f="category" aria-label="Category">${options}</select></label></div>
        <label class="bestby">Best by <input type="date" data-f="best_by" value="${esc(row.best_by || "")}" aria-label="Best by date"></label>
        </div>
        <div class="stepper">
          <button type="button" data-step="-1" aria-label="One less">−</button>
          <input data-f="count" inputmode="numeric" pattern="[0-9]*" aria-label="Count" class="${empty ? "empty" : ""}" value="${empty ? "" : row.count}">
          <button type="button" data-step="1" aria-label="One more">+</button>
        </div>
      </div>`;
  }

  function paintRows() {
    $("#reviewRows").innerHTML = state.rows.length
      ? state.rows.map(rowHtml).join("")
      : `<p class="muted" style="margin:14px 0">No food found in this photo. Retake it, or add what it missed.</p>`;
    paintBoxes();
    paintPublish();
  }

  // One thin box per unit, and a tag with the name and count at the top left
  // of each item's group of boxes.
  function paintBoxes() {
    const shot = $("#reviewShot");
    shot.querySelectorAll(".boxtag").forEach((n) => n.remove());
    $("#boxes").innerHTML = state.rows
      .flatMap((r) => r.box_2d.map(([y0, x0, y1, x1]) =>
        `<rect class="${state.rows.indexOf(r) === active ? "sel" : ""}" x="${x0}" y="${y0}" width="${x1 - x0}" height="${y1 - y0}" rx="4"/>`))
      .join("");
    state.rows.forEach((r, i) => {
      if (!r.box_2d.length) return;
      const top = Math.min(...r.box_2d.map((b) => b[0]));
      const left = Math.min(...r.box_2d.map((b) => b[1]));
      const tag = document.createElement("span");
      tag.className = "boxtag";
      tag.dataset.i = String(i);
      tag.style.left = `${left / 10}%`;
      tag.style.top = `${top / 10}%`;
      if (top < 60) tag.style.transform = "translateY(3px)";
      tag.textContent = `${r.name} ${r.count ?? ""}`.trim();
      shot.appendChild(tag);
    });
    paintFixHint();
  }

  function paintFixHint() {
    const r = state.rows[active];
    const name = r?.name.trim().toLowerCase() || "item";
    $("#fixHint").textContent = !r ? ""
      : r.count === null
        ? `Type the count for ${name}. The units are not separate in this photo.`
        : `Tap the photo where the reader missed ${name} to add one. Tap a box to take it away.`;
    document.querySelectorAll("#reviewRows .row").forEach((el) => el.classList.toggle("active", Number(el.dataset.i) === active));
  }

  // Tap to fix: a tap on a box takes that unit away, a tap anywhere else adds
  // one to the selected row. The count moves by one either way, like the stepper.
  $("#reviewShot").addEventListener("click", (e) => {
    const tag = e.target.closest(".boxtag");
    if (tag) {
      active = Number(tag.dataset.i);
      return paintBoxes();
    }
    const rect = $("#reviewImg").getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 1000;
    const y = ((e.clientY - rect.top) / rect.height) * 1000;
    if (x < 0 || y < 0 || x > 1000 || y > 1000) return;

    let hit = null;
    state.rows.forEach((r, ri) => r.box_2d.forEach((b, bi) => {
      if (y >= b[0] && y <= b[2] && x >= b[1] && x <= b[3]) {
        const area = (b[2] - b[0]) * (b[3] - b[1]);
        if (!hit || area < hit.area) hit = { ri, bi, area };
      }
    }));
    if (hit) {
      const r = state.rows[hit.ri];
      active = hit.ri;
      if (r.count !== null) {
        r.box_2d.splice(hit.bi, 1);
        r.count = Math.max(0, r.count - 1);
      }
      return paintRows();
    }

    const r = state.rows[active];
    if (!r || r.count === null) return paintFixHint();
    // Size the new box like this row's others, or a plain default.
    const hs = r.box_2d.map((b) => b[2] - b[0]).sort((a, b) => a - b);
    const ws = r.box_2d.map((b) => b[3] - b[1]).sort((a, b) => a - b);
    const h = hs.length ? hs[Math.floor(hs.length / 2)] : 140;
    const w = ws.length ? ws[Math.floor(ws.length / 2)] : 100;
    const clamp = (v) => Math.max(0, Math.min(1000, Math.round(v)));
    r.box_2d.push([clamp(y - h / 2), clamp(x - w / 2), clamp(y + h / 2), clamp(x + w / 2)]);
    r.count += 1;
    paintRows();
  });

  function listNames(names) {
    if (names.length < 2) return names.join("");
    return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
  }

  function paintPublish() {
    const rows = state.rows;
    const ready = rows.length > 0
      && rows.every((r) => r.name.trim() && Number.isInteger(r.count) && r.count >= 0)
      && rows.some((r) => r.count > 0);
    $("#publish").disabled = !ready;

    const followers = state.today?.followers ?? {};
    const waiting = rows
      .filter((r) => r.count > 0)
      .map((r) => existingFor(r.name.trim(), r.category))
      .filter((ex) => ex && (Number(ex.qty) || 0) <= 0 && followers[ex.id] > 0);
    const n = waiting.reduce((sum, ex) => sum + followers[ex.id], 0);
    $("#publishSay").textContent = "Goes live now." + (n
      ? ` ${students(n)} ${n === 1 ? "is" : "are"} waiting on ${listNames(waiting.map((ex) => ex.name.toLowerCase()))}.`
      : "");
  }

  function syncRow(i) {
    const rowEl = $(`#reviewRows [data-i="${i}"]`);
    const row = state.rows[i];
    const status = statusFor(row);
    rowEl.querySelector("[data-status]").textContent = status;
    rowEl.querySelector("[data-dot]").textContent = status ? " · " : "";
    rowEl.querySelector("[data-cat]").textContent = row.category;
    const count = rowEl.querySelector('[data-f="count"]');
    count.classList.toggle("empty", row.count === null);
    const tag = $(`#reviewShot .boxtag[data-i="${i}"]`);
    if (tag) tag.textContent = `${row.name} ${row.count ?? ""}`.trim();
    paintPublish();
  }

  $("#reviewRows").addEventListener("input", (e) => {
    const rowEl = e.target.closest("[data-i]");
    if (!rowEl) return;
    const i = Number(rowEl.dataset.i);
    const row = state.rows[i];
    const field = e.target.dataset.f;
    if (field === "name") row.name = e.target.value;
    if (field === "category") row.category = e.target.value;
    if (field === "best_by") row.best_by = e.target.value || null;
    if (field === "count") {
      const digits = e.target.value.replace(/\D/g, "").slice(0, 4);
      e.target.value = digits;
      row.count = digits === "" ? null : Number(digits);
    }
    syncRow(i);
  });
  $("#reviewRows").addEventListener("change", (e) => {
    if (e.target.dataset.f === "category") e.target.dispatchEvent(new Event("input", { bubbles: true }));
  });

  $("#reviewRows").addEventListener("click", (e) => {
    const rowEl = e.target.closest("[data-i]");
    if (rowEl && !e.target.closest("input, select, button")) {
      active = Number(rowEl.dataset.i);
      return paintBoxes();
    }
    const btn = e.target.closest("[data-step]");
    if (!btn) return;
    const i = Number(btn.closest("[data-i]").dataset.i);
    const row = state.rows[i];
    row.count = Math.max(0, (row.count ?? 0) + Number(btn.dataset.step));
    btn.parentElement.querySelector('[data-f="count"]').value = String(row.count);
    syncRow(i);
  });

  $("#addRow").addEventListener("click", () => {
    state.rows.push({ name: "", category: "Other", unit: "", count: null, box_2d: [], confidence: 1 });
    paintRows();
    $(`#reviewRows [data-i="${state.rows.length - 1}"] .edit-name`).focus();
  });

  $("#publish").addEventListener("click", async () => {
    const btn = $("#publish");
    btn.disabled = true;
    $("#publishSay").textContent = "Putting it on the board";
    try {
      const res = await api("publish", {
        request_id: state.photo.request,
        photo_url: state.photo.url,
        by_name: state.name,
        items: state.rows
          .filter((r) => r.count > 0)
          .map((r) => ({ name: r.name.trim(), category: r.category, unit: r.unit || "", count: r.count, best_by: r.best_by || null })),
      }, { pin: state.pin });
      state.reading = null;
      state.rows = [];
      publishedView(res);
    } catch (err) {
      if (/PIN/.test(err.message)) return signOut();
      $("#publishSay").textContent = err.message;
      btn.disabled = false;
    }
  });

  // ---- Published, with a 60 second undo ----

  const UNDO_SECONDS = 60;
  let undoTimer = null;

  function shelfRow(item, at) {
    const qty = Number(item.qty) || 0;
    const amount = qty > 0
      ? `<span class="qty">${qty}${item.unit ? `<small>${esc(unitFor(qty, item.unit))}</small>` : ""}</span><span class="instock">In stock</span>`
      : `<span class="instock out">Out</span>`;
    return `<div class="row"><div><div class="name">${esc(item.name)}</div><div class="sub">${esc(formatTime(at))}</div></div><div>${amount}</div></div>`;
  }

  function publishedView(res) {
    state.published = res;
    const about = res.told?.about ?? [];
    const n = res.told?.sent ?? 0;
    const failed = res.told?.failed ?? 0;
    $("#pubTitle").textContent = "On the board.";
    $("#pubTitle").classList.add("done");
    $("#pubLede").innerHTML = `${esc(formatTime(res.at))}, by ${esc(res.by)}.` + (n
      ? ` <b>${esc(students(n))} ${n === 1 ? "was" : "were"} just told about ${esc(listNames(about.map((a) => a.toLowerCase())))}.</b>`
      : "") + (failed ? ` ${failed === 1 ? "1 message" : `${failed} messages`} did not go through.` : "");
    $("#pubRows").innerHTML = res.items.map((i) => shelfRow(i, res.at)).join("");
    $("#undoCard").hidden = false;
    $("#undoBtn").disabled = false;
    show("vPublished");

    const started = Date.parse(res.at) || Date.now();
    clearInterval(undoTimer);
    const tick = () => {
      const left = Math.max(0, UNDO_SECONDS - Math.floor((Date.now() - started) / 1000));
      $("#undoText").innerHTML = `<b>Wrong?</b> Pull it back within ${left} s.${n ? " They get a correction." : ""}`;
      if (left === 0) {
        clearInterval(undoTimer);
        $("#undoCard").hidden = true;
      }
    };
    tick();
    undoTimer = setInterval(tick, 1000);
  }

  $("#undoBtn").addEventListener("click", async () => {
    const res = state.published;
    if (!res) return;
    $("#undoBtn").disabled = true;
    try {
      const out = await api("undo", { scan_id: res.scan_id, by_name: state.name }, { pin: state.pin });
      clearInterval(undoTimer);
      $("#undoCard").hidden = true;
      $("#pubTitle").textContent = "Pulled back.";
      $("#pubTitle").classList.remove("done");
      $("#pubLede").textContent = "Nothing from that photo is on the board now." +
        (out.corrections ? ` ${out.corrections === 1 ? "1 correction" : `${out.corrections} corrections`} sent.` : "");
      const units = new Map(res.items.map((i) => [i.id, i.unit]));
      $("#pubRows").innerHTML = out.items
        .map((i) => shelfRow({ name: i.name, qty: i.removed ? 0 : i.qty, unit: units.get(i.id) }, new Date()))
        .join("");
    } catch (err) {
      if (/PIN/.test(err.message)) return signOut();
      $("#undoText").textContent = err.message;
    }
  });

  $("#scanNext").addEventListener("click", () => {
    clearInterval(undoTimer);
    todayView();
    openCamera();
  });
  $("#backToday").addEventListener("click", () => {
    clearInterval(undoTimer);
    todayView();
  });


  return { cancelScan, paintRows, openCamera };
}
