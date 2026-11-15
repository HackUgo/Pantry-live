// "Today" starts at local midnight in the pantry's zone, across daylight saving.
import { test } from "node:test";
import assert from "node:assert/strict";
import { dayStart } from "./day";

test("midnight in Detroit, standard time", () => {
  assert.equal(dayStart("America/Detroit", new Date("2026-11-15T12:00:00Z")), "2026-11-15T05:00:00.000Z");
  assert.equal(dayStart("America/Detroit", new Date("2026-11-16T04:30:00Z")), "2026-11-15T05:00:00.000Z");
});

test("midnight in Detroit, summer time and the switch days", () => {
  assert.equal(dayStart("America/Detroit", new Date("2026-07-01T15:00:00Z")), "2026-07-01T04:00:00.000Z");
  assert.equal(dayStart("America/Detroit", new Date("2026-03-08T15:00:00Z")), "2026-03-08T05:00:00.000Z");
  assert.equal(dayStart("America/Detroit", new Date("2026-11-01T15:00:00Z")), "2026-11-01T04:00:00.000Z");
});
