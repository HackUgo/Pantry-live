// Staff tools on Today: take items off the board (one at a time, or all that
// were scanned today), and email students (with a pickup today, waiting on an
// item, or both). Every destructive or sending tap needs a second tap within
// 4 seconds. Everything runs through the Worker behind the staff PIN.

import { api, esc, $ } from "/js/app.js";

export function initTools(ctx) {
  const { state, show, signOut } = ctx;
  const armed = new Map(); // what is waiting for its second tap
  const ARM_MS = 4000;

  function arm(key, onDisarm) {
    armed.set(key, setTimeout(() => { armed.delete(key); onDisarm(); }, ARM_MS));
  }
  function disarm(key) {
    clearTimeout(armed.get(key));
    armed.delete(key);
  }
  const failed = (err, say) => {
    if (/PIN/.test(err.message)) return signOut();
    say(err.message);
  };

  // ---- Take items off the board ----

  $("#arrived").addEventListener("click", async (e) => {
    const btn = e.target.closest("[data-remove]");
    if (!btn) return;
    const id = btn.dataset.remove;
    if (!armed.has(id)) {
      btn.textContent = "Tap again";
      arm(id, () => { btn.textContent = "Remove"; });
      return;
    }
    disarm(id);
    btn.disabled = true;
    try {
      const out = await api("staff/remove", { ids: [id], by_name: state.name }, { pin: state.pin });
      $("#removeSay").textContent = `${out.removed.join(", ")} taken off the board.`;
      ctx.refreshToday();
    } catch (err) {
      failed(err, (m) => { $("#removeSay").textContent = m; });
      btn.disabled = false;
    }
  });

  $("#removeToday").addEventListener("click", async () => {
    const btn = $("#removeToday");
    if (!armed.has("today")) {
      btn.textContent = "Tap again to remove everything scanned today";
      arm("today", () => { btn.textContent = "Remove everything scanned today"; });
      return;
    }
    disarm("today");
    btn.disabled = true;
    try {
      const out = await api("staff/remove", { today: true, by_name: state.name }, { pin: state.pin });
      $("#removeSay").textContent = `${out.removed.length === 1 ? "1 item" : `${out.removed.length} items`} taken off the board.`;
      ctx.refreshToday();
    } catch (err) {
      failed(err, (m) => { $("#removeSay").textContent = m; });
    } finally {
      btn.disabled = false;
      btn.textContent = "Remove everything scanned today";
    }
  });

  // ---- Email students ----

  let audience = "both";
  let count = 0;

  async function countRecipients() {
    $("#msgCount").textContent = "Counting who this reaches";
    try {
      const out = await api(`staff/recipients?audience=${audience}`, null, { pin: state.pin, method: "GET" });
      count = out.count;
      $("#msgCount").textContent = count
        ? `Goes to ${count === 1 ? "1 student" : `${count} students`}, each on their own email.`
        : "Nobody to send to yet for this choice.";
    } catch (err) {
      count = 0;
      failed(err, (m) => { $("#msgCount").textContent = m; });
    }
    paintSend();
  }

  function paintSend() {
    const text = $("#msgText").value.trim();
    const btn = $("#msgSend");
    btn.disabled = !text || !count || text.length > 1000;
    btn.textContent = armed.has("send")
      ? "Tap again to send"
      : count ? `Send to ${count === 1 ? "1 student" : `${count} students`}` : "Send";
  }

  function openMessage() {
    show("vMessage", { back: "Today", onBack: () => ctx.todayView() });
    $("#msgSay").textContent = "";
    paintAudience();
    countRecipients();
  }

  function paintAudience() {
    document.querySelectorAll("#msgAudience [data-aud]").forEach((b) => {
      b.setAttribute("aria-pressed", String(b.dataset.aud === audience));
    });
  }

  $("#messageOpen").addEventListener("click", openMessage);
  $("#msgAudience").addEventListener("click", (e) => {
    const b = e.target.closest("[data-aud]");
    if (!b) return;
    audience = b.dataset.aud;
    paintAudience();
    countRecipients();
  });
  $("#msgText").addEventListener("input", () => {
    $("#msgLen").textContent = `${$("#msgText").value.length} of 1,000`;
    paintSend();
  });

  $("#msgSend").addEventListener("click", async () => {
    if (!armed.has("send")) {
      arm("send", paintSend);
      return paintSend();
    }
    disarm("send");
    const btn = $("#msgSend");
    btn.disabled = true;
    $("#msgSay").textContent = "Sending";
    try {
      const out = await api("staff/broadcast", { audience, message: $("#msgText").value, by_name: state.name }, { pin: state.pin });
      $("#msgSay").textContent = `Sent to ${out.sent === 1 ? "1 student" : `${out.sent} students`}.${out.failed ? ` ${out.failed} did not go through.` : ""}`;
      if (out.sent) $("#msgText").value = "";
    } catch (err) {
      failed(err, (m) => { $("#msgSay").textContent = m; });
    }
    paintSend();
  });

  return { openMessage };
}
