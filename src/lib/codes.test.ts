// Pickup codes: four characters from the alphabet, never 0, O, 1 or I.
import { test } from "node:test";
import assert from "node:assert/strict";
import { CODE_ALPHABET, isCode, newCode } from "./codes";

test("codes are four characters from the alphabet", () => {
  for (let i = 0; i < 2000; i++) {
    const code = newCode();
    assert.equal(code.length, 4);
    for (const ch of code) assert.ok(CODE_ALPHABET.includes(ch), `${ch} not in alphabet`);
    assert.ok(!/[0O1I]/.test(code));
    assert.ok(isCode(code));
  }
});

test("isCode refuses anything else", () => {
  for (const bad of ["", "ABC", "ABCDE", "AB0D", "ab2d", "AB I", 1234, null]) assert.equal(isCode(bad), false);
});
