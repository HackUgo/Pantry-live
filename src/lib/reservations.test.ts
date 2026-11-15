// Reserve input: a CMU email, a name, a bag with whole counts. First names only in the log.
import { test } from "node:test";
import assert from "node:assert/strict";
import { cleanReserve, firstName, ReservationError } from "./reservations";

test("a good bag comes through merged and lowercased", () => {
  const out = cleanReserve({
    name: "  Amara   Okafor ", email: "Amara@CMICH.edu", request_id: "r9",
    items: [{ id: "rice", n: 1 }, { id: "rice", n: 1 }, { id: "milk", n: 1 }, { id: "x", n: 0 }, { id: "y", n: 2.5 }],
  });
  assert.deepEqual(out, {
    name: "Amara Okafor", email: "amara@cmich.edu", request: "r9",
    items: [{ id: "rice", n: 2 }, { id: "milk", n: 1 }],
  });
});

test("refuses other emails, no name and an empty bag", () => {
  assert.throws(() => cleanReserve({ name: "A", email: "a@gmail.com", items: [{ id: "rice", n: 1 }] }), ReservationError);
  assert.throws(() => cleanReserve({ name: "A", email: "a@cmich.edu.evil.com", items: [{ id: "rice", n: 1 }] }), ReservationError);
  assert.throws(() => cleanReserve({ name: "", email: "a@cmich.edu", items: [{ id: "rice", n: 1 }] }), ReservationError);
  assert.throws(() => cleanReserve({ name: "A", email: "a@cmich.edu", items: [] }), ReservationError);
});

test("the log gets a first name only", () => {
  assert.equal(firstName("Amara Okafor"), "Amara");
  assert.equal(firstName("   "), "Student");
});
