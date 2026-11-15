// Scanned names land on the item already on the board, by kind of food.
import { test } from "node:test";
import assert from "node:assert/strict";
import { matchItem } from "../../public/js/catalog.js";

const board = [
  { id: "rice", name: "Rice", category: "Grains & Pasta" },
  { id: "banana", name: "Banana", category: "Produce" },
  { id: "cereal", name: "Cereal", category: "Grains & Pasta" },
  { id: "canned-bean", name: "Canned Beans", category: "Canned" },
  { id: "egg", name: "Eggs", category: "Dairy & Eggs" },
  { id: "peanut-butter", name: "Peanut Butter", category: "Protein" },
  { id: "milk", name: "Milk", category: "Dairy & Eggs" },
];
const hit = (name: string, category = "") => matchItem(name, category, board)?.id ?? null;

test("the same kind of food lands on its card", () => {
  assert.equal(hit("Bananas", "Produce"), "banana");
  assert.equal(hit("Long grain white rice", "Grains & Pasta"), "rice");
  assert.equal(hit("Whole grain breakfast cereal", "Grains & Pasta"), "cereal");
  assert.equal(hit("Baked beans", "Canned"), "canned-bean");
  assert.equal(hit("Black beans", "Canned"), "canned-bean");
  assert.equal(hit("Large brown eggs", "Dairy & Eggs"), "egg");
  assert.equal(hit("Creamy peanut butter", "Protein"), "peanut-butter");
});

test("a different food makes its own card", () => {
  assert.equal(hit("Egg noodles", "Grains & Pasta"), null, "noodles are not eggs");
  assert.equal(hit("Almond butter", "Protein"), null);
  assert.equal(hit("Spaghetti", "Grains & Pasta"), null);
  assert.equal(hit("Orange juice", "Drinks & Snacks"), null);
});
