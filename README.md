# Pantry Live

What's on the Student Food Pantry shelves right now, from one volunteer photo.

- `/` : public board (live, no login)
- `/volunteer` : volunteer page (PIN 2027): photo -> AI -> review -> confirm
- `/api/scan` : serverless function that sends the photo to Gemini and returns items

## Setup (about 30 minutes)
1. **Gemini key:** aistudio.google.com -> Get API key -> Create key. Copy it.
2. **Supabase:** supabase.com -> New project (save the database password somewhere) -> wait ~2 min.
   - SQL Editor -> New query -> paste all of `supabase-setup.sql` -> Run. You should see "Success".
   - Project Settings -> API (or "API Keys"): copy the **Project URL** and the **anon public / publishable** key
     into `js/supabase-config.js`. Never use the service_role / secret key in the browser.
3. **GitHub:** create a repo `pantry-live`, upload these files.
4. **Vercel:** vercel.com -> Add New -> Project -> import the repo -> before deploying, open
   **Environment Variables** and add `GEMINI_API_KEY` = your key
   (optional `GEMINI_MODEL` = the current Flash model name from AI Studio). Deploy.
5. Open `https://YOUR-APP.vercel.app/volunteer` on your phone, PIN 2027, tap **Reset demo shelf**,
   and watch `/` on your laptop fill in live.

## Test the AI on a folder of photos
    node tools/test-scan.mjs https://YOUR-APP.vercel.app ./test-photos

## Notes
- The access rules in `supabase-setup.sql` let anyone read the board and let the website write. Fine for a demo; real volunteer login is next.
- If the board doesn't update live: Supabase -> Database -> Publications -> `supabase_realtime` -> make sure `items` is switched on.
- Any change pushed to GitHub redeploys automatically.
