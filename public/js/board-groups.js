// Grouped categories on the student board. On the full board, the kinds of a
// grouped category (Cans: corn, beans, tomatoes) fold into one card placed
// where the first of them would be, and the card drops down to a row per
// kind with its own +, stepper or Tell me. The board's click handler serves
// these rows through the same data attributes as the cards.

import { esc, formatTime } from "/js/app.js";
import { CATEGORY_IMAGES, GROUPED, photoFor, unitFor } from "/js/catalog.js";
import { store } from "/js/student-store.js";

const qtyOf = (i) => Number(i?.qty) || 0;

// Which dropdowns are open, so live updates do not close them.
export const openGroups = new Set();

// The control for one kind in the dropdown: +, the stepper, or Tell me.
function kindAction(i) {
  const qty = qtyOf(i);
  const id = esc(i.id);
  const name = esc(i.name);
  if (qty <= 0) {
    return store.following[i.id]
      ? `<span class="tag-green">Following</span>`
      : `<button class="tag-line" data-tell="${id}">Tell me</button>`;
  }
  const inBag = store.bag[i.id];
  if (!inBag) return `<button class="round" data-add="${id}" aria-label="Add ${name} to your bag">+</button>`;
  const max = Math.min(Number(i.max_per_pickup) || 2, qty);
  return `<div class="stepper mini">` +
    `<button type="button" data-bag="${id}" data-step="-1" aria-label="One less ${name}">−</button>` +
    `<output>${Math.min(inBag, max)}</output>` +
    `<button type="button" data-bag="${id}" data-step="1" aria-label="One more ${name}"${inBag >= max ? " disabled" : ""}>+</button></div>`;
}

function groupHtml(category, items) {
  const label = GROUPED[category];
  const total = items.reduce((sum, i) => sum + Math.max(0, qtyOf(i)), 0);
  const kinds = items.length;
  const photo = items.find((i) => i.photo_url)?.photo_url || CATEGORY_IMAGES[category];
  const rows = items.map((i) => {
    const qty = qtyOf(i);
    const out = qty <= 0;
    const amount = out ? (i.out_at ? `Out since ${formatTime(i.out_at)}` : "Out") : `${qty}${i.unit ? ` ${unitFor(qty, i.unit)}` : ""}`;
    return `<div class="kind${out ? " out" : ""}">
      <button class="kind-open" data-open="${esc(i.id)}">
        <img src="${esc(photoFor(i))}" alt="" loading="lazy">
        <span><span class="name">${esc(i.name)}</span><span class="sub">${esc(amount)}${store.bag[i.id] && !out ? ` · ${store.bag[i.id]} in bag` : ""}</span></span>
      </button>
      <div class="kind-act">${kindAction(i)}</div>
    </div>`;
  }).join("");
  return `<details class="group" data-group="${esc(category)}"${openGroups.has(category) ? " open" : ""}>
    <summary>
      <img class="group-photo" src="${esc(photo)}" alt="" loading="lazy">
      <span class="group-text">
        <span class="name">${esc(label)}</span>
        <span class="count">${total ? `${total} on the shelf` : "Out"}</span>
        <span class="when">${kinds} kinds · tap to see them</span>
      </span>
      <span class="chev" aria-hidden="true">▾</span>
    </summary>
    <div class="kinds">${rows}</div>
  </details>`;
}

// On the full board, kinds of a grouped category fold into one card placed
// where the first of them would have been.
export function boardHtml(shown, folding, cardHtml) {
  if (!folding) return shown.map(cardHtml).join("");
  const counts = {};
  for (const i of shown) if (GROUPED[i.category]) counts[i.category] = (counts[i.category] || 0) + 1;
  const done = new Set();
  return shown.map((i) => {
    if (!GROUPED[i.category] || counts[i.category] < 2) return cardHtml(i);
    if (done.has(i.category)) return "";
    done.add(i.category);
    return groupHtml(i.category, shown.filter((x) => x.category === i.category));
  }).join("");
}

