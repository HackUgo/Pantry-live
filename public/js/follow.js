// Tell me: a student asks to hear the moment an Out item is scanned back in,
// by CMU email or by a ping to this phone. The Worker checks and stores the
// follow, sends the one message on publish and deletes the row. On iPhone, pings need the
// site added to the home screen first, so that case shows the steps instead.

import { api, esc, $, formatTime } from "/js/app.js";
import { store } from "/js/student-store.js";

const isIPhone = /iPhone|iPad|iPod/.test(navigator.userAgent);
const standalone = window.navigator.standalone === true || matchMedia("(display-mode: standalone)").matches;

function keyBytes(base64url) {
  const pad = "=".repeat((4 - (base64url.length % 4)) % 4);
  const raw = atob((base64url + pad).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

// The Worker checks the email or the push address, then stores the follow.
async function addFollow(row) {
  await api("follow", row);
}

export function openTellMe(ctx, item) {
  if (!item) return;
  const lower = item.name.toLowerCase();
  const since = item.out_at ? `Out since ${formatTime(item.out_at)}.` : "Out right now.";

  if (store.following[item.id]) {
    ctx.openSheet(`
      <h2 style="margin:0;font-size:26px;letter-spacing:-0.02em">You are on the list for ${esc(lower)}</h2>
      <p class="muted" style="margin:6px 0 0">${esc(since)}</p>
      <p class="say-line">One ${store.following[item.id] === "push" ? "ping to this phone" : "email"} the moment staff scan ${esc(lower)} in. Then it ends.</p>
      <div style="margin-top:22px"><button class="btn btn-quiet" id="tellClose">Back to the board</button></div>`);
    $("#tellClose").onclick = ctx.closeSheet;
    return;
  }

  ctx.openSheet(`
    <h2 style="margin:0;font-size:26px;letter-spacing:-0.02em">Tell me when ${esc(lower)} arrive</h2>
    <p class="muted" style="margin:6px 0 0">${esc(since)}</p>
    <p class="say-line">One email or ping the moment staff scan ${esc(lower)} in. Then it ends.</p>
    <div class="micro" style="margin:22px 0 10px">Where should it go?</div>
    <input class="field" id="tellEmail" type="email" inputmode="email" autocomplete="email" placeholder="CMU email" value="${esc(store.me.email || "")}">
    <p class="hint">Kept only to send this one message, then deleted.</p>
    <div style="margin-top:18px">
      <button class="btn btn-primary" id="tellBtn">Tell me</button>
      <button class="btn btn-text" id="pingBtn">Ping this phone instead</button>
      <p class="hint" id="tellSay" role="status" style="text-align:center"></p>
    </div>`);

  const say = (text) => { $("#tellSay").textContent = text; };
  const done = (channel) => {
    store.follow(item.id, channel);
    ctx.closeSheet();
    ctx.render();
  };

  $("#tellBtn").onclick = async () => {
    const email = $("#tellEmail").value.trim().toLowerCase();
    if (!/^[^@\s]+@cmich\.edu$/.test(email)) return say("Use your CMU email, the one ending in @cmich.edu.");
    $("#tellBtn").disabled = true;
    try {
      await addFollow({ item_id: item.id, channel: "email", email });
      store.setMe(store.me.name, email);
      done("email");
    } catch (err) {
      say(err.message);
      $("#tellBtn").disabled = false;
    }
  };

  $("#pingBtn").onclick = () => {
    if (isIPhone && !standalone) {
      return say("On iPhone, pings come through the home screen app. Tap Share, then Add to Home Screen, open Pantry Live from your home screen and tap Tell me again.");
    }
    if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
      return say("This browser cannot get pings. Use email instead.");
    }
    // The permission prompt must start inside the tap, before anything else waits.
    Notification.requestPermission().then(async (permission) => {
      if (permission !== "granted") return say("Pings are blocked for this site. Use email instead.");
      try {
        const reg = await navigator.serviceWorker.ready;
        const sub = (await reg.pushManager.getSubscription())
          ?? await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(ctx.cfg.vapidPublicKey) });
        const json = sub.toJSON();
        await addFollow({ item_id: item.id, channel: "push", subscription: json });
        done("push");
      } catch (err) {
        say(err.message || "Pings did not turn on. Use email instead.");
      }
    });
  };
}
