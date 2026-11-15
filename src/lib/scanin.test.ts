// Put on the board input: only our bucket's photos, a name, whole counts,
// and rows for the same item merged.
import { test } from "node:test";
import assert from "node:assert/strict";
import { cleanPublish, PublishError } from "./scanin";
import { slug } from "../../public/js/catalog.js";

const URL_BASE = "https://x.supabase.co";
const photo = `${URL_BASE}/storage/v1/object/public/scans/2026-11-15/a.jpg`;

test("merges rows for the same item and keeps the first name", () => {
  const out = cleanPublish({
    photo_url: photo, by_name: "  praise ", request_id: "r1",
    items: [
      { name: "Spaghetti", category: "Grains & Pasta", unit: "Boxes", count: 9, best_by: "2027-06-01" },
      { name: "spaghetti", category: "Grains & Pasta", unit: "boxes", count: 1, best_by: "2027-02-01" },
      { name: "Rice", category: "Nonsense", count: 2 },
      { name: "Zero", count: 0 },
      { name: "Half", count: 1.5 },
    ],
  }, URL_BASE);
  assert.equal(out.by, "Praise");
  assert.equal(out.request, "r1");
  assert.deepEqual(out.items, [
    { id: "spaghetti", name: "Spaghetti", category: "Grains & Pasta", unit: "boxes", count: 10, best_by: "2027-02-01" },
    { id: "rice", name: "Rice", category: "", unit: "", count: 2, best_by: null },
  ]);
});

test("refuses a photo from anywhere else, no name, or no counts", () => {
  assert.throws(() => cleanPublish({ photo_url: "https://evil.example/a.jpg", by_name: "A", items: [{ name: "Rice", count: 1 }] }, URL_BASE), PublishError);
  assert.throws(() => cleanPublish({ photo_url: photo, by_name: " ", items: [{ name: "Rice", count: 1 }] }, URL_BASE), PublishError);
  assert.throws(() => cleanPublish({ photo_url: photo, by_name: "A", items: [{ name: "Rice", count: 0 }] }, URL_BASE), PublishError);
});

test("names become the same ids as the first version", () => {
  assert.equal(slug("Canned Beans"), "canned-bean");
  assert.equal(slug("Eggs"), "egg");
  assert.equal(slug("Glass"), "glass");
  assert.equal(slug("Peanut butter"), "peanut-butter");
});
