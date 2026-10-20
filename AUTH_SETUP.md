# Accounts, phone login and the Android download: setup

Do these steps in order. Steps 2 and 3 go together: once the SQL runs, the
old deployed site shows no data until the new code is deployed.

## 1. Turn on phone login (Twilio Verify)

1. Create a Twilio account. On a trial account, add every phone number that
   should get codes under **Phone Numbers → Verified Caller IDs** (trial
   accounts can only text verified numbers).
2. In Twilio, open **Verify → Services → Create**, give it a name
   (e.g. "SmartSpend") and copy its **Service SID** (starts with `VA`).
3. In the Supabase dashboard, open **Authentication → Sign In / Providers →
   Phone** and turn it on. Choose **Twilio Verify** as the SMS provider, then
   paste the Twilio **Account SID**, **Auth Token** and the Verify **Service SID**.
4. Optional, for testing without SMS: add test numbers with fixed codes in
   the same Phone settings (for example `919000000001=123456`).

Supabase sends at most one code per number per minute. Codes expire after an hour.

## 2. Run the database migration

1. Open `supabase/migrations/001_accounts_auth.sql`.
2. Replace `REPLACE_WITH_OWNER_PHONE` with the number that should own the
   data that's already there (e.g. `+91 98765 43210`).
3. Paste the whole file into **Supabase → SQL Editor** and run it. It runs as
   one transaction, so if it fails nothing changes.

This adds accounts and members, turns on Row Level Security for every data
table, and creates the private `apk` storage bucket.

## 3. Deploy the website

No new environment variables are needed. Vercel already has
`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
`SUPABASE_SERVICE_ROLE_KEY` and `NVIDIA_API_KEY`. Commit and push.

Then log in with the owner number. You should see all your existing data.

## 4. Build the Android app

In the `smartspend` folder:

1. Copy `env.example.json` to `env.json` and fill it in: the Supabase URL, the
   **anon** key (never the service-role key) and the Vercel site URL.
2. `flutter pub get`
3. Test on the phone: `flutter run --dart-define-from-file=env.json`
4. Release build:
   `flutter build apk --release --split-per-abi --dart-define-from-file=env.json`
5. Upload `build/app/outputs/flutter-apk/app-arm64-v8a-release.apk` to
   **Supabase → Storage → apk**, named exactly `smartspend.apk`. Upload a new
   file over the old one for each update. The free plan allows files up to 50 MB.

Logged-in users can now download it from the **Account** page on the website.

Updates install over the old app only if they're signed with the same key.
Right now release builds use your PC's debug key, so always build on the
same PC, or set up a proper release keystore.

## 5. Add more phone numbers

On the website, go to **Account → Phone numbers → Add number**. The person
logs in with that number on the website and accepts the invite on their
Account page. After that, their app syncs into the shared account.

## How access works

- Each phone number belongs to exactly one account. A new number gets its own
  empty account (open sign-up).
- **Owners** can add and remove numbers and rename the account. **Members**
  can see the data and change categories.
- Postgres Row Level Security checks every query against the caller's
  account, including the chat's search and the reporting functions. A logged-out
  request, or a request using the public anon key, gets no rows.
- Invites are never accepted automatically. The only exception is the owner
  invite created by the migration.
- The app uploads parsed transactions only, never SMS text. Syncing again is
  safe because rows are matched on the SMS hash, so nothing is duplicated.
  A category set on the website always wins over one from the app.
