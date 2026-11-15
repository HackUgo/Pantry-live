// The two pickup emails: the student's code, and the desk's heads up.
import { test } from "node:test";
import assert from "node:assert/strict";
import { pickupMails } from "./pickup-mail";

const env = { PLACE: "Robinson Hall", TIME_ZONE: "America/Detroit", STAFF_ALERT_EMAIL: "desk@cmich.edu" } as any;
const hold = { code: "7K4M", name: "Amara Okafor", email: "amara@cmich.edu", closes: "2:00 pm", items: [{ name: "Rice", n: 1 }, { name: "Milk", n: 1 }], left: 14, cap: 20 };

test("the student gets the code and the desk gets the pickup", () => {
  const [student, desk] = pickupMails(env, "https://pantry.example", hold, new Date("2026-11-15T09:21:00-05:00"));
  assert.equal(student.to, "amara@cmich.edu");
  assert.equal(student.subject, "Your pickup code: 7K4M");
  assert.match(student.text, /Robinson Hall before 2:00 pm today: 7K4M/);
  assert.match(student.text, /Rice 1\nMilk 1/);
  assert.equal(desk.to, "desk@cmich.edu");
  assert.equal(desk.subject, "New pickup 7K4M: Amara Okafor");
  assert.match(desk.text, /reserved at 9:21 am/);
  assert.match(desk.text, /14 of 20 pickup slots left today/);
  assert.match(desk.text, /https:\/\/pantry.example\/volunteer/);
});

test("no desk address means only the student is emailed", () => {
  assert.equal(pickupMails({ ...env, STAFF_ALERT_EMAIL: "" }, "https://x", hold).length, 1);
});
