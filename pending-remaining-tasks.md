# DocKit — pending / remaining tasks (handoff)

Status snapshot as of round 4. Most of the round-3 backlog landed in this
round; this file now tracks only what's still open plus the ops steps a
new operator needs to complete before production.

## Landed this round

- **Preview image**: replaced with the branded DocKit key art at
  `public/preview-image.png` (1200x630, cropped from the uploaded
  reference).
- **Logo/favicon**: cropped `public/logo.png` and `public/favicon.png`
  to remove background whitespace so they render crisp at small sizes;
  renter header now uses 32x32.
- **Application snapshots (feature #8)**: new `application_snapshots`
  table + `renter_record_snapshot` RPC. Renter captures a SHA-256 on
  submit; manager captures another SHA-256 on approve/reject/withdraw
  before the packet is deleted. RLS scoped to program members.
- **Bulk export ZIP (feature #10)**: "Bulk ZIP (approved)" button on
  the program Applications tab bundles all approved packets whose
  storage objects still exist. Uses `jszip` in the browser.
- **Delegated caseworker pre-check (feature #11)**: `applications`
  gained `pre_marked_requirements TEXT[]`; renter checklist hides any
  pre-marked slot and shows a note ("your caseworker already has N
  documents on file").
- **Sample-doc OCR (round-2 item)**: Requirements editor now has a
  "Suggest from sample" affordance that runs Tesseract in-browser and
  proposes a `docTypeKeywords` rule from the top distinctive tokens.
- **Real print stylesheet**: `@media print` in `src/styles.css` hides
  chrome, drops shadows, sets margins, and keeps list items from
  breaking across pages.
- **Sticky sidebar on review**: `<aside>` on the manager review page
  is `lg:sticky top-4` so long document lists stay in view while the
  detail pane scrolls.
- **8-language selector on renter header**: dropdown now lists all
  eight HUD-priority languages, not just EN/ES.
- **A11y**: progress counter `{done}/{slots.length}` on the renter
  checklist is `aria-live="polite"` so retakes announce.
- **Copy pass**: swept em-dashes out of user-visible strings in the
  closed-application copy; safer machine-translation and reads more
  naturally.
- **MailerSend server route**: `POST /api/public/mailersend`
  authenticates the caller via Supabase JWT, verifies they can access
  the referenced program/application, and forwards to MailerSend's
  REST API. Wire from the client after invites / decisions.
- **Storage purge endpoint**: `POST /api/public/purge-storage` (called
  by `pg_cron` via `pg_net`) lists Storage objects under each
  decided/idle application's prefix and removes them with the service
  role. See ops section below for the cron wiring.

## Still outstanding

### A. Ops the operator must complete

1. **Wire the storage purge cron.** After deploying, run once in
   Supabase SQL editor:

   ```sql
   SELECT cron.schedule(
     'dockit-purge-storage', '15 3 * * *',
     $$
     SELECT net.http_post(
       url := 'https://the-dockit.vercel.app/api/public/purge-storage',
       headers := jsonb_build_object(
         'Content-Type','application/json',
         'apikey', '<VITE_SUPABASE_PUBLISHABLE_KEY>'
       ),
       body := '{}'::jsonb
     );
     $$
   );
   ```

   Requires `SUPABASE_SERVICE_ROLE_KEY` and `SUPABASE_PUBLISHABLE_KEY`
   set in the deployment env.

2. **MailerSend secrets.** Fill `MAILERSEND_API_TOKEN`,
   `MAIL_FROM_ADDRESS`, `MAIL_FROM_NAME` in production env. Without
   them, `/api/public/mailersend` returns HTTP 501 (feature is
   optional — decisions still record without email).

3. **Auth email confirmation link.** Confirm Supabase project's
   **Site URL** is `https://the-dockit.vercel.app` and Redirect URLs
   includes `/dashboard`.

4. **Favicon `.ico` for crisp 16/32 tab icons.** Currently a 512x512
   PNG; browsers downscale it. Optional but recommended: generate a
   multi-size `.ico`.

### B. Nice-to-have polish (not blocking)

- Native strings for ZH/VI/HT/TL/SO/AR are still partial — the
  structure is in place; hand off to a translator.
- Manager UI to set a program's default `pre_marked_requirements` (per-
  application override lives in the schema but has no dedicated UI yet;
  the value can be set today with a direct table update).
- Snapshot hashes are recorded but not yet surfaced on the review
  page — add a small "Audit trail" card that lists them.
- Real MailerSend send on the client side (route is live, but the
  Team invite / Decision actions don't call it yet — plumb them in
  after you have production MailerSend keys).

## Round 6 update

Everything previously listed as "UI not mounted" is now mounted:

- Renter checklist: multi-page PDF OCR with per-page progress, the local
  document-library picker ("Reuse saved" + "Clear them"), sample image and
  photo tip per requirement, and a message thread with the housing office.
- Manager review: "Why this result" explainability panel (per-rule trace plus
  the recognized text), the snapshot audit trail, and the manager side of the
  message thread.

Remaining open items are tracked in `suggested-features.md`: native
translations for the six non-EN/ES languages (needs human translators),
WCAG AAA polish, low-bandwidth deferred OCR, and SMS nudges. Email remains
intentionally disabled (`/api/public/mailersend` returns 501).
