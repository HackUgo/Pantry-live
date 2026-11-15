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

// Short chip labels for the phone board.
export const SHORT = {
  "Dairy & Eggs": "Dairy",
  "Grains & Pasta": "Grains",
  "Drinks & Snacks": "Drinks",
};

// "Canned Beans" -> "canned-bean", "Eggs" -> "egg". Same rule as the first
// version, so its rows keep their ids and a rescanned item lands on its row.
export function slug(name) {
  let s = String(name).toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  if (s.length > 3 && s.endsWith("s") && !s.endsWith("ss")) s = s.slice(0, -1);
  return s || "item";
}

// Stock photos (Unsplash, free licence) shown for an item until a volunteer
// scans it in. The scanned photo always wins.
export const CATEGORY_IMAGES = {
  "Produce": "/images/categories/produce.webp",
  "Dairy & Eggs": "/images/categories/dairy-eggs.webp",
  "Grains & Pasta": "/images/categories/grains-pasta.webp",
  "Canned": "/images/categories/canned.webp",
  "Protein": "/images/categories/protein.webp",
  "Drinks & Snacks": "/images/categories/drinks-snacks.webp",
  "Other": "/images/categories/other.webp",
};

// Stock photos of the exact item (Unsplash, free licence), for the starting
// shelf. Checked by eye: each one shows that item, nothing close to it.
export const ITEM_IMAGES = {
  "egg": "/images/items/egg.webp",
  "milk": "/images/items/milk.webp",
  "banana": "/images/items/banana.webp",
  "canned-bean": "/images/items/canned-bean.webp",
  "rice": "/images/items/rice.webp",
  "cereal": "/images/items/cereal.webp",
  "peanut-butter": "/images/items/peanut-butter.webp",
};

// The volunteer's photo first, then a stock photo of that item, then its category.
export function photoFor(item) {
  return item?.photo_url || ITEM_IMAGES[item?.id] || CATEGORY_IMAGES[item?.category] || CATEGORY_IMAGES.Other;
}
// "1 jug", "2 jugs", "1 box", "1 bunch": units are stored plural.
export function unitFor(qty, unit) {
  if (!unit || Number(qty) !== 1) return unit || "";
  if (/(ches|shes|xes|sses)$/.test(unit)) return unit.slice(0, -2);
  if (unit.endsWith("s") && !unit.endsWith("ss")) return unit.slice(0, -1);
  return unit;
}
