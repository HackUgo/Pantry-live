// The board's only onboarding: one screen asking for a school email, shown
// on a phone until it signs up, so the pantry can email news (food in,
// pickups ready). Any .edu address. The email is required: there is no skip,
// and a phone that skipped before is asked again. It also fills in Reserve
// and Tell me later.

import { api, $ } from "/js/app.js";
import { store } from "/js/student-store.js";

export function initJoin() {
  if (store.joined === "joined") return;
  $("#joinScreen").hidden = false;
  $("#joinEmail").value = store.me.email || "";

  const close = (state) => {
    store.setJoined(state);
    $("#joinScreen").hidden = true;
  };

  $("#joinForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const email = $("#joinEmail").value.trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.edu$/.test(email)) {
      $("#joinSay").textContent = "Use your school email, the one ending in .edu.";
      return;
    }
    $("#joinBtn").disabled = true;
    try {
      await api("join", { email });
      store.setMe(store.me.name, email);
      close("joined");
    } catch (err) {
      $("#joinSay").textContent = err.message;
      $("#joinBtn").disabled = false;
    }
  });
}
