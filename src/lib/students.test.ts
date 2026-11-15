// Onboarding takes any school email and nothing else.
import { test } from "node:test";
import assert from "node:assert/strict";
import { cleanSchoolEmail, JoinError } from "./students";

test("any .edu email joins", () => {
  assert.equal(cleanSchoolEmail(" Amara@CMICH.edu "), "amara@cmich.edu");
  assert.equal(cleanSchoolEmail("sam@umich.edu"), "sam@umich.edu");
  assert.equal(cleanSchoolEmail("j.doe@mail.wvu.edu"), "j.doe@mail.wvu.edu");
});

test("other emails do not", () => {
  for (const bad of ["a@gmail.com", "a@edu.com", "a@cmich.edu.evil.com", "a@cmich.edu\nBcc: x@y.edu", ""]) {
    assert.throws(() => cleanSchoolEmail(bad), JoinError, bad);
  }
});
