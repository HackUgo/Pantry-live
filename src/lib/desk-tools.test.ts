// The staff email: who it may go to, what it may say.
import { test } from "node:test";
import assert from "node:assert/strict";
import { broadcastMail, cleanAudience, cleanMessage, DeskError } from "./desk-tools";

test("audience falls back to both", () => {
  assert.equal(cleanAudience("pickups"), "pickups");
  assert.equal(cleanAudience("waiting"), "waiting");
  assert.equal(cleanAudience("everyone on earth"), "both");
});

test("message must be written and short", () => {
  assert.throws(() => cleanMessage("   "), DeskError);
  assert.throws(() => cleanMessage("x".repeat(1001)), DeskError);
  assert.equal(cleanMessage("  Rice is back.\r\nCome by.  "), "Rice is back.\nCome by.");
});

test("each student gets their own copy, signed by the pantry", () => {
  const m = broadcastMail({ PLACE: "Robinson Hall" } as any, "https://pantry.example", "a@cmich.edu", "Rice is back.");
  assert.equal(m.to, "a@cmich.edu");
  assert.equal(m.subject, "A message from the Student Food Pantry");
  assert.match(m.text, /^Rice is back\.\n\nStudent Food Pantry, Robinson Hall\nhttps:\/\/pantry.example\n\nTo stop these emails, reply to this one and say stop\.$/);
});
