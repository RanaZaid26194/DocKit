# DocKit — deployment checklist

Everything needed to hand DocKit to a new operator or grant reviewer.
Follow top to bottom.

## 1. Provision infrastructure

1. Create a fresh Supabase project (any region).
2. Open Supabase → SQL editor, paste the contents of
   `supabase/consolidated-schema.sql`, and run.
3. Supabase → Storage → confirm the `documents` bucket exists and is
   **private**.
4. Supabase → Database → Extensions → enable `pg_cron` (needed for the
   nightly retention purge).
5. Create a MailerSend account, verify your sending domain, and grab
   an SMTP username/password.
6. Supabase → Auth → Providers → Email → SMTP: point at MailerSend
   using the values in `SECRETS.md`.
7. Supabase → Auth → URL Configuration:
   - Site URL: `https://the-dockit.vercel.app`
   - Redirect URLs: add `https://the-dockit.vercel.app/dashboard`
     and any staging domains.
8. Supabase → Auth → Email Templates: paste the branded HTML from
   `EMAIL_TEMPLATES.md`.

## 2. Configure hCaptcha

1. Sign up at hcaptcha.com and add `the-dockit.vercel.app` as a site.
2. Copy the site key and secret into Vercel env
   (`VITE_HCAPTCHA_SITE_KEY`, `HCAPTCHA_SECRET`).

## 3. Deploy to Vercel

1. Import the repository.
2. Set every env variable from `SECRETS.md`.
3. Deploy. Custom domain optional — the canonical URL is
   `https://the-dockit.vercel.app`.

## 4. Post-deploy smoke test

- [ ] Load `/` and confirm the DocKit landing loads.
- [ ] Create a housing office account (`/auth`); confirm the email
      arrives from your MailerSend sender.
- [ ] Create a program with 2 requirements; verify the QR code.
- [ ] Scan the QR on a phone. Complete the renter flow with a real
      photo of a paystub, then a photo of an ID.
- [ ] Confirm OCR runs in-browser (network tab shows no external
      LLM calls).
- [ ] Submit the packet; download the PDF as the renter.
- [ ] Sign back in as the manager; open the application; download
      the packet; approve. Refresh the renter link — verify the
      "closed" page shows and that the storage row's
      `storage_path` is `NULL`.
- [ ] Wait 24h (or run the purge SQL manually) to verify the
      retention job wipes decided applications after
      `retention_days`.

## 5. Documentation to hand off

- `README.md` — what DocKit is and how to develop.
- `SUBMISSION.md` — hackathon write-up.
- `SECRETS.md` — every environment variable and where to get it.
- `EMAIL_TEMPLATES.md` — copy-paste templates for Supabase Auth
  and MailerSend.
- `PLACEHOLDERS.md` — every intentional stub or decision left for
  the operator.
- `pending-remaining-tasks.md` — handoff of everything not yet
  landed.
- `suggested-features.md` — future work considered.

## 6. Known non-blockers

See `PLACEHOLDERS.md` and `pending-remaining-tasks.md`.
