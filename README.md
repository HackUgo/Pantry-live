# Pantry Live

The live shelf for the CMU Student Food Pantry. Staff photograph items as they arrive; the photo is read and counted; the count and the photo go on a board every student can open; students who asked are told the moment an item is back; students reserve items and pick them up at the desk with a code; every step is logged.

Live at https://pantry-live.twokriks.workers.dev

- `/` the student board: one onboarding step (a school email, skippable), search, item cards, item sheet, bag, Reserve for pickup, code screen with a QR the desk scans to open Hand over, Tell me. Items not yet scanned show a stock photo of that item (or its category), marked as one. Cards carry a stepper, categories have their own colour, and what arrived today sits at the top as photo tiles.
- `/volunteer` staff: PIN, name, Today, Scan items in, Review (tap the photo to add or remove a unit, best by date read off the pack), Put on the board, Pickups, Hand over, Release everyone still waiting, Remove items, Email students
- `/system` the projector page: every step lighting up from the event log

## How it is built

One Cloudflare Worker (`src/index.ts`, Hono) serves the pages in `public/` and the API under `/api/*`. Supabase holds the data, the photos (bucket `scans`) and realtime. The browser reads items and events and adds follows with the publishable key only; every other write goes through the Worker with the service role key.

| Concern | One place |
|---|---|
| Photo reading (Anthropic API, model in `READER_MODEL`) | `src/lib/reader.ts` |
| Email (Gmail SMTP) | `src/lib/email.ts` |
| Pickup emails to the student and the desk | `src/lib/pickup-mail.ts` |
| Push (VAPID) | `src/lib/push.ts` |
| Telling followers | `src/lib/notify.ts` |
| Reservations and the desk | `src/lib/reservations.ts` |
| No shows released at closing (cron every 15 minutes) | `src/lib/closing.ts` |
| Removing items and emailing students | `src/lib/desk-tools.ts` |
| Onboarding sign ups | `src/lib/students.ts` |
| Staff PIN and its lockout | `src/lib/staff.ts` |
| Event log | `src/lib/events.ts` |
| Counting, reserving, undo, hand over | Postgres functions in `supabase/` |

Database: `supabase/schema.sql` is the baseline as of Nov 15 2026 13:00, `supabase/seed.sql` the starting shelf, and every change since is a dated file in `supabase/migrations/`.

## Run and check

```
npm install
npm run check      # types, Worker and tests
npm test           # unit tests, no network
npm run walk       # walks every route of the live site as an attacker, then as staff and a student
npm run deploy     # wrangler deploy
```

The walk writes test rows, sends its pickup emails to `WALK_EMAIL`, a @cmich.edu address you own (it needs `WALK_PIN` too), and ends by locking this address out of staff calls for 10 minutes. Reset afterwards (`docs/LESSONS.md`, Demo reset).

## Settings

Plain values live in `wrangler.jsonc` (Supabase URL and publishable key, model, VAPID public key and subject, time zone, place, opening hours, site URL). Secrets are set with `wrangler secret put` and never written to a file: `ANTHROPIC_API_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `VAPID_PRIVATE_KEY`, `GMAIL_APP_PASSWORD`, `STAFF_PIN`, `GMAIL_USER`, `STAFF_ALERT_EMAIL`.

## The first version

`index.html`, `volunteer.html`, `js/`, `api/scan.js`, `vercel.json` and `supabase-setup.sql` at the repo root are Ugonna's first build on Vercel, kept as they were. The Worker does not serve them.
