// The email a student gets when their hold is released at closing.
import { test } from "node:test";
import assert from "node:assert/strict";
import { releasedMail } from "./closing";

test("names the items and the next opening", () => {
  const m = releasedMail({} as any, "https://pantry.example", { code: "7K4M", email: "a@cmich.edu", items: [{ name: "Rice", n: 1 }, { name: "Milk", n: 1 }] }, "Mon 12:00 pm");
  assert.equal(m.to, "a@cmich.edu");
  assert.equal(m.subject, "Your pickup 7K4M was released");
  assert.match(m.text, /Rice 1, Milk 1 went back on the board/);
  assert.match(m.text, /reserve again from Mon 12:00 pm/);
});
