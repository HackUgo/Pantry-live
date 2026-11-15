# Lessons

Every bug fixed in this repo, with the rule it taught. New lessons go at the bottom. Nothing is deleted.

1. **The Supabase CLI masks the new secret key.** `supabase projects api-keys -o json` returns `sb_secret_` keys with the middle replaced by dots, and piping that into `wrangler secret put` stored a broken key; the Worker answered "Invalid API key". Rule: check a key's length and characters before storing it, never by printing it. The Worker uses the legacy `service_role` key, which the CLI returns whole.

2. **`wrangler dev` kept old vars after a config edit.** A change to `PANTRY_HOURS` in `wrangler.jsonc` did not reach the running dev server. Rule: restart `wrangler dev` after editing `wrangler.jsonc`, and read the value back from `/api/config` before trusting it.

3. **A failed message was counted as sent.** The first message log line read "1 ping sent ... 1 failed" for one ping that failed, and the Published screen said a student "was just told" when nothing went out. Rule: count what was delivered, per channel, and say plainly when a message did not go through.

4. **A test bundle that failed to build ran the old test.** A chained shell command stopped at the build step, so the previous test file ran against old settings and reported a confusing auth error. Rule: delete build output before a run, and stop the chain on the first failure.

5. **A retried Put on the board would have added the counts twice.** Rule: every write carries a request id the database keeps unique, and a repeat returns the first answer (scans.request_id, reservations.request_id).

6. **Cloudflare's rate limit binding did not stop PIN guessing in production.** It tripped in `wrangler dev` and once on the live site, then let 40 wrong PINs through: its count is approximate and per location, and an in memory count is per isolate. Rule: a limit that guards a secret lives in the database. Wrong PINs are recorded by hashed address in `pin_failures`; 10 in 10 minutes locks that address out.

7. **A hand over with nothing ticked closed the hold as "handed over".** Rule: the server refuses an empty hand over; nothing taken is "Did not come", which releases the items.

8. **Gmail refused the first app password.** The first real send failed with "535 5.7.8 Username and Password not accepted". Rule: prove a new mail credential with one real send to your own inbox before calling email done, and read the SMTP error from `wrangler tail`, never guess.

9. **A category stock photo looked like the real item.** Peanut butter showed beans and bananas showed peppers. Rule: a photo that is not the item says so on the photo ("Stock photo") until a volunteer scans it in.

10. **A publish without a category turned Rice into Other.** The Worker filled a missing category with "Other" and the database wrote it over the item's real one. Rule: a field the request did not send never overwrites stored data. A missing category is empty, and only a new item falls back to Other.

11. **The staff PIN was public.** It sat in `wrangler.jsonc`, the walk script and, already pushed, the first version's `js/supabase-config.js`, in a public repo. Rule: anything that unlocks staff routes is a Worker secret, never a var. A PIN that was ever committed is retired, not hidden.

12. **The public key could write.** Anyone could upload any JPEG to the photo bucket and add follows for any email, which would have made the pantry's Gmail send mail to strangers and the Worker post to any web address dressed as a push subscription. Rule: the browser only reads. Every write goes through the Worker, which checks it (JPEG bytes, CMU emails, known push services) and limits it per address in the database.

13. **The public log carried pickup codes.** Codes sat next to first names in a table anyone can read. Rule: the public log names a student by first name only. Codes and emails never go in it.

14. **A scan of rice could make a new card instead of adding to Rice.** Names only merged when they matched exactly, so "Long grain white rice" or "Whole grain breakfast cereal" became cards of their own. Rule: one card per kind of food. The reader names the kind, and one shared rule (catalog.js matchItem, used by Review and by publish) puts a scanned name on the board item whose words it contains, in the same category.

## Demo reset

Before a demo, put the board back to the starting shelf (seven items, Rice and Canned beans Out, empty log, no holds, no follows, empty scans bucket, PIN lock cleared):

```
SUPABASE_URL=https://tcjqrtvupiesddusclkc.supabase.co SUPABASE_SERVICE_ROLE_KEY=... node tools/reset.mjs
```

The key comes from the Supabase dashboard (Project settings, API keys, `service_role`). Do not save it in a file.

15. **One scan photo became every item's card picture.** A shot of bananas, rice and sauce put the same group photo on all three cards. Rule: the scan is read for data only; a card shows its item's stock image or its category (`photoFor` in public/js/catalog.js, covered by src/lib/photo.test.ts).
