# Pantry Live: from demo to product

Written November 15 2026, after the hackathon demo, when Praise asked for the product to be made properly: the
infrastructure, the code against the rules in `~/how-we-build`, and a plan to beat PantrySOFT without loosening any
security rule. This is a proposal. Nothing in it is built until Praise says which phase to start.

## The sentence

Pantry Live is for the volunteer at any food pantry and the student or family walking over: staff take one photo of
what came in, everyone sees exact counts on their phone, can reserve and get told when food is back, and the pantry's
donation numbers come out of the log.

## Where we stand against the market

Sources are listed at the end. The finding that matters most: CMU's own announcement for PantrySOFT says students "will
be able to see all of our inventory online before they even come in". So showing inventory online is not new at CMU.
What no one else does:

- **Photo to counts.** No US pantry tool reads a photo into item counts. The only camera tool found (Plinth, UK only)
  suggests one item per photo and does not count.
- **Exact counts.** PantrySOFT's shop marks an item in stock or out of stock; no source shows shoppers a number.
- **Back in stock email.** No competitor documents one.
- **A checked count with an audit trail.** A volunteer confirms every scan, and every step is logged.
- **Price.** PantrySOFT is $50 to $125 a month, plus $50 to $75 for online ordering, plus $500 to $5,000 setup.
- **The real market is spreadsheets.** In a 2023 survey of about 355 campus pantries, about 60% used Word, Excel or
  Google tools; 9% used PantrySOFT.

What we do not do, and should not pretend to: household intake and the eligibility records TEFAP requires (7 CFR
251.10). Pantries keep those in Service Insights, PantrySOFT, Link2Feed or Oasis. Pantry Live sits beside them and
hands them the numbers they ask partners for: pounds, items in and out, pickups.

## The audit, against our own rules

What already holds: an opening comment on every file; dated migrations; no secret in the repo, with a secret and copy
scan before every push; idempotent scans and reservations; one held pickup per email enforced by the database; an
append only event log the database enforces; the model name in config; the reader's count checked by arithmetic; the
public key reads only; the closing release is a scheduled job.

What does not, most serious first:

1. **One pantry only.** No table has a pantry id. Rule: decide data isolation before there is a customer.
2. **Shared PIN, unverified students.** Every volunteer is the same person to the server, and anyone can reserve or
   follow with someone else's email. Rules: identity only from a verified token; roles are a claim on the request.
3. **One database for everything.** Local tests and the 74 check walk wrote to production and sent real emails.
   Rules: dev and prod keys differ; walk against a local database.
4. **Hand deploys from a laptop, and no dev or staging branch.** Rule: only main deploys, CI builds.
5. **No monitoring that outlives a session, and no restore test.** Rule: healthchecks, uptime alerts and error
   reporting from the first deploy; a backup is a hope until it has been restored.
6. **Eight core modules have no tests**, among them the PIN lockout and the rate limits, and CI does not fail when row
   level security is off. Rules: tests from day one; CI fails if RLS is off.
7. **Settings read in 14 files and the clock in 10**, with no check at boot. Rules: no env read outside config,
   validated at boot; no clock read outside one file.
8. **No off switch** for the reader, email or push. Rule: everything has an off switch.
9. **Small things**: two files over 400 lines (app.css, staff-scan.js), five shadows in the CSS (four are focus
   rings, which become outlines), log lines without an area prefix.

## The plan

Each phase ends with its "done when" true on a local stack and on staging, walked as a user and as an attacker.

### Phase 1: foundations (about a week)

Fixes audit items 1 to 9. Nothing here is visible to a student; all of it is what lets a second pantry exist.

- **Pantries.** A `pantries` table (name, place, time zone, hours, email domains, categories, the board title) and a
  `pantry_id` on every table, with row level security by pantry. Everything that is CMU today becomes that pantry's
  settings. Done when two pantries run side by side and a test proves neither can read the other's rows.
- **Staff accounts.** Each volunteer signs in by email link (Supabase Auth), with a role (owner, staff, volunteer) as a
  claim. The name on a scan is the signed in person. The shared PIN goes. Done when every write names a real account
  and a volunteer token cannot reach owner routes.
- **Verified students, still no password.** Reserving or following sends a one tap link to the email first. Done when
  nobody can reserve, follow or release with an email they cannot open.
- **Three environments.** dev, staging and production, each with its own Supabase project and Worker; branches `dev`
  and `staging`; CI deploys staging from `staging` and production only from `main`; the walk runs on staging.
- **One config, one clock, off switches.** `config.ts` reads and validates every setting at boot; `clock.ts` is the
  only clock; one flag each for the reader, email and push.
- **Watching it.** An uptime check on the health route, error reporting, log lines with area prefixes, and a restore
  test of the backup written down in LESSONS.md.
- **Tests and checks.** Tests for the eight untested modules, a CI step that fails if any table lacks RLS, and the two
  long files split.

### Phase 2: beat PantrySOFT where pantries feel it (about a week)

- **The partner report.** One page and a CSV for the month: pounds in, pounds out, items by category, pickups, unique
  visitors. Weight per unit is set once per item and confirmed on Review. Done when the numbers match the log to the
  item and a food bank's monthly form can be filled from it.
- **Barcode beside the photo.** Packaged goods scan by barcode; the photo stays for loose and mixed donations.
- **The board in Spanish and English**, by the phone's language.
- **Desk mode that survives bad Wi-Fi.** Hand over works offline and syncs, through one queue, with the same
  idempotent request ids.
- **A pantry signs itself up.** An owner creates a pantry, sets hours and invites volunteers, with no help from us.

### Phase 3: alongside the intake tools

- Export pickups in the shape Service Insights and PantrySOFT import, so a pantry never types a visit twice.
- Text alerts once a registered 10DLC number exists (a cost, so Praise's call).

## No gos

- No household eligibility or TEFAP intake. That belongs to the tools pantries already report through.
- No price on anything until Praise sets one.
- No feature without its screen drawn and approved first.

## Sources

- CMU on PantrySOFT: https://www.cmich.edu/news/details/student-food-pantry-gets-new-improved-software-system
- PantrySOFT pricing and features: https://www.pantrysoft.com/pricing/ ; https://support.pantrysoft.com/inventory-with-limits
- Campus pantry survey 2023: https://swipehunger.org/wp-content/uploads/2024/03/Campus-Food-Pantries-Insights-From-a-2023-Survey.pdf
- Plinth camera inventory: https://plinth.org.uk/complete-guide/camera-first-inventory-management
- Service Insights: https://okfoodbank.org/service-insights/
- Food Pantry Helper: https://foodpantryhelper.com/Home/ConsideringFoodPantryHelper
- Oasis Insight: https://foodpantry.oasisinsight.net
- TEFAP records: https://www.law.cornell.edu/cfr/text/7/251.10
- Partner reporting examples: https://www.foodbankcny.org/service-number-reporting/ ; https://idahofoodbank.org/t-agencyzone/
