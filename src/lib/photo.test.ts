// A card's picture is the stock image of its item, never the scan photo.
// The scan is only read for names, counts and best by dates.
import { test } from "node:test";
import assert from "node:assert/strict";
import { photoFor } from "../../public/js/catalog.js";

const scan = "https://example.supabase.co/storage/v1/object/public/scans/shot.jpg";

test("a scanned item shows its own stock image, not the scan", () => {
  assert.equal(photoFor({ id: "banana", category: "Produce", photo_url: scan }), "/images/items/banana.webp");
  assert.equal(photoFor({ id: "rice", category: "Grains & Pasta", photo_url: scan }), "/images/items/rice.webp");
});

test("plural ids find the singular image", () => {
  assert.equal(photoFor({ id: "bananas", category: "Produce" }), "/images/items/banana.webp");
  assert.equal(photoFor({ id: "eggs", category: "Dairy & Eggs" }), "/images/items/egg.webp");
  assert.equal(photoFor({ id: "canned-beans", category: "Canned" }), "/images/items/canned-bean.webp");
});

test("an item with no image of its own shows its category, even after a scan", () => {
  assert.equal(photoFor({ id: "spaghetti-sauce", category: "Canned", photo_url: scan }), "/images/categories/canned.webp");
  assert.equal(photoFor({ id: "mystery", category: "Nope" }), "/images/categories/other.webp");
});
