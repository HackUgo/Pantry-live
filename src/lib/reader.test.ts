// The photo reader on a recorded model answer: pixel boxes become the 0 to
// 1000 scale, the count is the number of boxes, a null count stays null.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { cleanDate, readPhoto, ReaderError } from "./reader";

// Run from the project folder (npm test), so the path is relative to it.
const fixture = readFileSync("src/lib/fixtures/model-scan.json", "utf8");
const env = { READER_MODEL: "claude-opus-5-5", ANTHROPIC_API_KEY: "test" } as any;
const reply = (body: string, status = 200) =>
  new Response(body, { status, headers: { "content-type": "application/json", "request-id": "req_fixture" } });

test("reads the recorded answer into review rows", async () => {
  let sent: any;
  globalThis.fetch = (async (_url: string, init: RequestInit) => {
    sent = JSON.parse(String(init.body));
    return reply(fixture);
  }) as typeof fetch;
  const items = await readPhoto(env, "x".repeat(2000), ["Bananas"], 960, 1280);

  assert.equal(items.length, 3, "the nameless row is dropped");
  assert.deepEqual(items[0], {
    name: "Bananas", category: "Produce", unit: "", count: 2,
    box_2d: [[75, 100, 250, 208], [75, 229, 250, 344]], best_by: null, confidence: 0.9,
  });
  assert.equal(items[1].count, null);
  assert.equal(items[1].best_by, "2027-03-14");
  assert.equal(items[2].best_by, null, "an unreadable date is dropped");
  assert.equal(items[1].unit, "cans");
  assert.equal(items[2].category, "Other");

  assert.equal(sent.model, "claude-opus-5-5");
  assert.equal(sent.output_config.effort, "low");
  assert.equal(sent.output_config.format.type, "json_schema");
  assert.equal(sent.fallbacks, "default");
  assert.match(sent.messages[0].content[1].text, /960 pixels wide and 1280 pixels tall/);
});

test("a refusal and an API error become plain sentences", async () => {
  const refused = JSON.parse(fixture);
  refused.stop_reason = "refusal";
  globalThis.fetch = (async () => reply(JSON.stringify(refused))) as unknown as typeof fetch;
  await assert.rejects(readPhoto(env, "x", [], 10, 10), (e: Error) => e instanceof ReaderError && /would not read/.test(e.message));

  globalThis.fetch = (async () => reply(JSON.stringify({ type: "error", error: { type: "invalid_request_error", message: "bad" } }), 400)) as unknown as typeof fetch;
  await assert.rejects(readPhoto(env, "x", [], 10, 10), ReaderError);
});

test("a missing key says so before any call", async () => {
  await assert.rejects(readPhoto({ ...env, ANTHROPIC_API_KEY: "" }, "x", [], 10, 10), /not set up/);
});

test("dates are real days in a sane range", () => {
  const now = new Date("2026-11-15T12:00:00Z");
  assert.equal(cleanDate("2026-11-30", now), "2026-11-30");
  assert.equal(cleanDate("2026-02-30", now), null, "no such day");
  assert.equal(cleanDate("2019-01-01", now), null, "too far past");
  assert.equal(cleanDate("2035-01-01", now), null, "too far ahead");
  assert.equal(cleanDate("Nov 30", now), null);
  assert.equal(cleanDate(null, now), null);
});
