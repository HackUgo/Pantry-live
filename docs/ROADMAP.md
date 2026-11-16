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

What we do not do, and should not pretend to: the eligibility records TEFAP requires (7 CFR 251.10), meaning income,
documents and the signed declaration. Pantries keep those in Service Insights, PantrySOFT, Link2Feed or Oasis.
Pantry Live records household size and counts people once, so it can hand a pantry every number its readers ask for,
without becoming an intake tool.

## The base layer

Decided November 16 2026, after mapping twelve ways pantries operate and what campus pantries report. The full map,
with every action on both sides of the counter, is the Pantry Live service map artifact; its sources are listed at the
end of this file.

### Who we build for

Pantries are the customer: they reach the people. A food bank, a school, a donor or a state is a reader of the
pantry's numbers, never the buyer we design for. Like Shopify, there is one engine, and each pantry sets its own
profile on top. No pantry gets custom code.

### Twelve ways pantries work

| Model | On the base layer |
|---|---|
| Campus pantry | Fits today |
| Faith based, choice or bags | Fits as choice or box |
| Community fridge, self serve | Fits as a board with no reservations |
| Client choice with points or pounds | Needs the limit rules below |
| Pre packed box | Needs a box as an item, sized by household |
| Drive through | Needs dated events and a fast tally |
| Mobile pantry at a host site | Needs dated events at a site |
| Online order with a pickup slot | Needs time slots |
| Food bank ordering and its monthly report | Needs the record below |
| Senior box and home delivery | Later: delivery routes |
| School backpack program | Later: counts only, chosen by school staff |
| Referral voucher (UK, clinics) | Later: referral codes |

### The record: facts captured once, every report a view of them

Campus pantries report to their food bank (most monthly), Student Affairs, donors, a public yearly report and, in
Connecticut and California, the state. No two ask for the same fields, and food banks band ages differently (17 or 18,
59 or 60, 64 or 65). So the log records facts, never a report's shape:

1. **Every visit**: time, place or pickup point, and how food left (choice, box, order with a slot, event, delivery,
   self serve). One visit model with a mode, so every handout lands in the same log.
2. **Who, counted once**: a private person key, so a person counts once per month, term or year. Or counts only,
   for pantries that keep visits anonymous (45% of campus pantries keep no student data).
3. **Household size with birth years**, so any report groups ages its own way.
4. **Role**: student, staff, faculty, family, community.
5. **Optional answers**, only the ones the pantry chooses to ask: class year, first generation, housing, ZIP code.
6. **Every item out**: count, weight, and where it came from.
7. **Every donation in**: donor, kind of donor (food bank, drive, grocery rescue, dining, person), items, weight, cost
   if bought, and enough for a donor receipt.
8. **Volunteer shifts and hours.**
9. **The pantry's own fiscal year and terms.**

Never in the base layer: income, documents, eligibility declarations, or any shopper's name on a public page.

### The pantry profile

| Setting | Campus preset | Community preset |
|---|---|---|
| Who can shop | School email domains | Anyone, or registered households |
| How shoppers sign up | Verified email link | Text code, or the desk adds them; or nothing at all |
| When | Open hours | Distribution days, time slots or dated events |
| Limits | Per item, per pickup | Per household, per week or month; points or pounds |
| How food leaves | Choice | Choice or pre packed boxes |
| Counting people | Private person key | Household with size, or counts only |
| Language | English | English and Spanish |

The first question a new pantry answers is what kind of pantry it is; the preset fills every setting and the owner
can change any of them.

### Habits

When every pantry records the same facts the same way, patterns appear: when lines are longest, what runs out first,
when donations arrive, which weeks are hardest. A pantry learns from its own history first; learning across pantries
waits for real usage and each pantry's permission.

### Still to confirm with Ugonna for CMU

What the Greater Lansing Food Bank asks for each month and when it is due; whether faculty and staff can shop (the
public page says enrolled students); whether food is weighed in or out; what the Volunteer Center or Student Affairs
asks for each year; which count takes the most time; what PantrySOFT is used for day to day; whether food donors get a
receipt.

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

- **Pantries.** A `pantries` table holding the pantry profile above (name, place, time zone, hours, who can shop,
  limits, how food leaves, how people are counted, categories, the board title) and a `pantry_id` on every table,
  with row level security by pantry. Everything that is CMU today becomes that pantry's settings, set by the campus
  preset. Done when two pantries run side by side, one campus and one community, and a test proves neither can read
  the other's rows.
- **The record.** Visits with a mode, the private person key or counts only, household size with birth years, role,
  weight per item, donors on every donation in. Done when the CMU pantry's month can be counted three ways (its food
  bank's age bands, Student Affairs, a donor) from the same rows, with no shopper name on any public read.
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

- **Reports, one per reader.** The food bank month (households, people by the food bank's own age bands, pounds), the
  school's term, and a donor's impact, each one page and a CSV built from the record. Weight per unit is set once per
  item and confirmed on Review. Done when the numbers match the log to the item and a food bank's monthly form can be
  filled from it.
- **Barcode beside the photo.** Packaged goods scan by barcode; the photo stays for loose and mixed donations.
- **The board in Spanish and English**, by the phone's language.
- **Desk mode that survives bad Wi-Fi.** Hand over works offline and syncs, through one queue, with the same
  idempotent request ids.
- **A pantry signs itself up.** An owner creates a pantry, sets hours and invites volunteers, with no help from us.

### Phase 3: alongside the intake tools

- Export pickups in the shape Service Insights and PantrySOFT import, so a pantry never types a visit twice.
- Text alerts once a registered 10DLC number exists (a cost, so Praise's call).

## No gos

- No income, documents or TEFAP eligibility intake. That belongs to the tools pantries already report through.
- No shopper's name on anything public.
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
- Age bands differ by food bank: https://feedwm.org/wp-content/uploads/2024/05/Statistics-Reporting-Guidelines.pdf ;
  https://cfbnj.org/wp-content/uploads/2024/07/PDF-CFBNJ-Monthly-Service-Report-DPI-6.25.24-1.pdf
- Mobile pantry manual: https://feedwm.org/wp-content/uploads/2024/05/Mobile-Food-Pantry-Manual.pdf
- Drive through pantries: https://www.feedingamerica.org/our-work/hunger-relief-programs/drive-thru-pantry
- Campus pantry survey 2021 (45% keep no student data, reporting cadence): https://swipehunger.org/wp-content/uploads/2022/04/College-Campus-Food-Pantries-Learnings-from-a-2021-Survey.pdf
- CMU pantry: https://www.wcmu.org/show/central-focus/2025-12-03/central-focus-cmu-food-pantry-addresses-food-insecurity ;
  https://www.cmich.edu/offices-departments/mary-ellen-brandell-volunteer-center/programs/student-food-pantry-and-food-insecurity-resources
- Campus reports: https://foodpantry.org.uiowa.edu/sites/foodpantry.org.uiowa.edu/files/2025-10/BASIC-NEEDS-REPORT-FY-25-Final.pdf ;
  https://www.unomaha.edu/maverick-food-pantry/_files/images/mfp-eoy-report-2024-25.pdf ;
  https://bhccedu-lb01-production.terminalfour.net/media/03-documents/dishfoodpantry/DISH-annual-2025-v3s.pdf
- Lagos Food Bank: https://lagosfoodbank.org/project/tefap
- Trussell referral vouchers: https://www.trussell.org.uk/get-help/
