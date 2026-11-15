// Opening hours in Mount Pleasant time, for message text and the pickup window.
import { test } from "node:test";
import assert from "node:assert/strict";
import { amount, clock, closesToday, pickupWindow } from "./hours";

const TZ = "America/Detroit";
const HOURS = JSON.stringify({ sun: ["09:00", "14:00"], mon: ["12:00", "15:00"], tue: ["16:00", "19:00"] });
// Sunday Nov 15 2026 is UTC-5 in Detroit.
const at = (local: string) => new Date(`2026-11-15T${local}:00-05:00`);

test("reserving is open before and during the day's hours", () => {
  assert.deepEqual(pickupWindow(HOURS, TZ, at("08:00")), { ok: true, closes: "2:00 pm", opens: null });
  assert.deepEqual(pickupWindow(HOURS, TZ, at("13:59")), { ok: true, closes: "2:00 pm", opens: null });
});

test("after closing it names the next opening", () => {
  assert.deepEqual(pickupWindow(HOURS, TZ, at("14:00")), { ok: false, closes: null, opens: "Mon 12:00 pm" });
  assert.deepEqual(pickupWindow(HOURS, TZ, new Date("2026-11-14T12:00:00-05:00")), { ok: false, closes: null, opens: "Sun 9:00 am" });
});

test("no hours at all stays closed without a next opening", () => {
  assert.deepEqual(pickupWindow("{}", TZ, at("10:00")), { ok: false, closes: null, opens: null });
  assert.deepEqual(pickupWindow("not json", TZ, at("10:00")), { ok: false, closes: null, opens: null });
});

test("clock, closing time and amounts read the way the screens do", () => {
  assert.equal(clock(at("16:41"), TZ), "4:41 pm");
  assert.equal(clock(at("09:05"), TZ), "9:05 am");
  assert.equal(closesToday(HOURS, TZ, at("10:00")), "2:00 pm");
  assert.equal(closesToday(HOURS, TZ, new Date("2026-11-14T12:00:00-05:00")), null);
  assert.equal(amount(18, ""), "18");
  assert.equal(amount(9, "boxes"), "9 boxes");
});

test("one of something reads singular", () => {
  assert.equal(amount(1, "jugs"), "1 jug");
  assert.equal(amount(1, "boxes"), "1 box");
  assert.equal(amount(1, "bunches"), "1 bunch");
  assert.equal(amount(2, "boxes"), "2 boxes");
  assert.equal(amount(1, "glass"), "1 glass");
});
