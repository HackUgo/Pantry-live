// Shared by the pages and the Worker (the Worker bundles this file):
// the fixed category list and the rule that turns an item name into its id.

export const CATEGORIES = [
  "Produce",
  "Dairy & Eggs",
  "Grains & Pasta",
  "Canned",
  "Protein",
  "Drinks & Snacks",
  "Other",
];

// Short chip labels for the board's category row.
export const SHORT = {
  "Dairy & Eggs": "Dairy",
  "Grains & Pasta": "Grains",
  "Drinks & Snacks": "Drinks",
  "Canned": "Can",
};

// Categories the full board shows as one card that drops down to list each
// kind (Cans: corn, beans, tomatoes), once there are two kinds or more.
export const GROUPED = { "Canned": "Cans" };

// What students read for a category. Stored values stay as they are.
const LABELS = { "Canned": "Can" };
export function catLabel(category) {
  return LABELS[category] || category || "";
}

// "Canned Beans" -> "canned-bean", "Eggs" -> "egg". Same rule as the first
// version, so its rows keep their ids and a rescanned item lands on its row.
export function slug(name) {
  let s = String(name).toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  if (s.length > 3 && s.endsWith("s") && !s.endsWith("ss")) s = s.slice(0, -1);
  return s || "item";
}

// Card pictures. The scan photo is only read for names, counts and best by
// dates; it never becomes a card's picture, because one shot often holds
// several items. A card shows its own item, or its category when the item has
// no picture of its own (Unsplash, free licence).
export const CATEGORY_IMAGES = {
  "Produce": "/images/categories/produce.webp",
  "Dairy & Eggs": "/images/categories/dairy-eggs.webp",
  "Grains & Pasta": "/images/categories/grains-pasta.webp",
  "Canned": "/images/categories/canned.webp",
  "Protein": "/images/categories/protein.webp",
  "Drinks & Snacks": "/images/categories/drinks-snacks.webp",
  "Other": "/images/categories/other.webp",
};

// Pictures of the exact item (Unsplash, free licence). Checked by eye: each one
// shows that item, nothing close to it.
export const ITEM_IMAGES = {
  "egg": "/images/items/egg.webp",
  "milk": "/images/items/milk.webp",
  "banana": "/images/items/banana.webp",
  "canned-bean": "/images/items/canned-bean.webp",
  "rice": "/images/items/rice.webp",
  "cereal": "/images/items/cereal.webp",
  "peanut-butter": "/images/items/peanut-butter.webp",
  "coconut-milk": "/images/items/coconut-milk.webp",
  "pasta-sauce": "/images/items/pasta-sauce.webp",
  "cookie": "/images/items/cookie.webp",
  "orange": "/images/items/orange.webp",
  "pita-bread": "/images/items/pita-bread.webp",
  "tomato": "/images/items/tomato.webp",
  "corn": "/images/items/corn.webp",
  "mackerel": "/images/items/mackerel.webp",
};

// Names the reader writes in many ways ("Canned coconut milk", "Spaghetti
// sauce", "Chocolate chip cookies") find their picture by words. The first rule
// whose words are all in the name wins, unless the name holds one of its "not"
// words (orange juice is not an orange). Most specific rules first.
const WORD_IMAGES = [
  { all: ["coconut", "milk"], img: "coconut-milk" },
  { all: ["peanut", "butter"], img: "peanut-butter" },
  { all: ["spaghetti", "sauce"], img: "pasta-sauce" },
  { all: ["pasta", "sauce"], img: "pasta-sauce" },
  { all: ["marinara"], img: "pasta-sauce" },
  { all: ["cookie"], img: "cookie" },
  { all: ["cooky"], img: "cookie" }, // "cookies" made singular
  { all: ["biscuit"], img: "cookie" },
  { all: ["pita"], img: "pita-bread" },
  { all: ["mackerel"], img: "mackerel" },
  { all: ["sardine"], img: "mackerel" },
  { all: ["tomato"], img: "tomato", not: ["juice", "soup"] },
  { all: ["corn"], img: "corn", not: ["flake", "cereal"] },
  { all: ["orange"], img: "orange", not: ["juice"] },
  { all: ["banana"], img: "banana" },
  { all: ["rice"], img: "rice", not: ["cake", "krispie"] },
  { all: ["cereal"], img: "cereal" },
  { all: ["bean"], img: "canned-bean", not: ["coffee", "green"] },
  { all: ["egg"], img: "egg", not: ["noodle"] },
  { all: ["milk"], img: "milk", not: ["chocolate"] },
];

function imageByWords(name) {
  const have = new Set(words(name));
  for (const rule of WORD_IMAGES) {
    if (rule.all.every((w) => have.has(w)) && !(rule.not || []).some((w) => have.has(w))) {
      return ITEM_IMAGES[rule.img];
    }
  }
  return null;
}

// The item's own picture (plural ids find the singular), then a picture found
// by the words in its name, then its category.
export function photoFor(item) {
  const id = String(item?.id || "");
  return ITEM_IMAGES[id] || ITEM_IMAGES[id.replace(/e?s$/, "")] || ITEM_IMAGES[id.replace(/s$/, "")]
    || imageByWords(item?.name) || CATEGORY_IMAGES[item?.category] || CATEGORY_IMAGES.Other;
}
// "1 jug", "2 jugs", "1 box", "1 bunch": units are stored plural.
export function unitFor(qty, unit) {
  if (!unit || Number(qty) !== 1) return unit || "";
  if (/(ches|shes|xes|sses)$/.test(unit)) return unit.slice(0, -2);
  if (unit.endsWith("s") && !unit.endsWith("ss")) return unit.slice(0, -1);
  return unit;
}

// Matching a scanned name to an item already on the board, so rice goes on
// Rice and not on a new card. An exact id wins. Otherwise the board item whose
// words all appear in the scanned name, in the same category, is the match,
// the more words the better. Words like canned or fresh say nothing about
// what the food is, so they are left out on both sides. Cans are told apart
// by what is in them (black beans and kidney beans are two cards), so a
// canned item only matches a card with exactly the same words.
const FILLER = new Set(["canned", "can", "fresh", "organic", "whole", "large", "small", "big", "box", "bag", "pack", "jar", "bottle", "of", "and", "the", "a"]); // standards: allow (words stripped from scanned names)

function singular(w) {
  if (w.length > 4 && w.endsWith("ies")) return `${w.slice(0, -3)}y`;
  if (/(ches|shes|xes|sses|oes)$/.test(w)) return w.slice(0, -2);
  if (w.length > 3 && w.endsWith("s") && !w.endsWith("ss")) return w.slice(0, -1);
  return w;
}

function words(name) {
  return String(name ?? "").toLowerCase().split(/[^a-z0-9]+/).filter(Boolean).map(singular).filter((w) => !FILLER.has(w));
}

export function matchItem(name, category, items) {
  const id = slug(name);
  const exact = items.find((i) => i.id === id);
  if (exact) return exact;
  const scanned = new Set(words(name));
  let best = null;
  let bestScore = 0;
  for (const item of items) {
    if (category && item.category && category !== item.category) continue;
    const need = words(item.name);
    const canned = (category || item.category) === "Canned";
    if (canned && need.length !== scanned.size) continue;
    if (need.length && need.every((w) => scanned.has(w)) && need.length > bestScore) {
      best = item;
      bestScore = need.length;
    }
  }
  return best;
}
