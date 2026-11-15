// Tell me input: CMU emails only, and pings only to real browser push services.
import { test } from "node:test";
import assert from "node:assert/strict";
import { cleanFollowEmail, cleanSubscription, FollowError } from "./follows";

const keys = { p256dh: "BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM", auth: "tBHItJI5svbpez7KI4CCXg" };

test("pings go only to browser push services", () => {
  for (const ok of ["https://fcm.googleapis.com/fcm/send/abc", "https://web.push.apple.com/QW", "https://updates.push.services.mozilla.com/wpush/v2/x", "https://wns2-par02p.notify.windows.com/w/?token=x"]) {
    assert.equal(cleanSubscription({ endpoint: ok, keys }).endpoint.startsWith("https://"), true);
  }
  for (const bad of ["https://evil.example/x", "http://fcm.googleapis.com/x", "https://fcm.googleapis.com.evil.example/x", "https://169.254.169.254/latest", "not a url"]) {
    assert.throws(() => cleanSubscription({ endpoint: bad, keys }), FollowError, bad);
  }
  assert.throws(() => cleanSubscription({ endpoint: "https://fcm.googleapis.com/x", keys: { p256dh: "short", auth: "x" } }), FollowError);
});

test("follows take CMU emails only", () => {
  assert.equal(cleanFollowEmail(" Amara@CMICH.edu "), "amara@cmich.edu");
  for (const bad of ["a@gmail.com", "a@cmich.edu.evil.com", "a@cmich.edu\nBcc: x@y.z", ""]) assert.throws(() => cleanFollowEmail(bad), FollowError);
});
