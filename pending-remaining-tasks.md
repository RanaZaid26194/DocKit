# DocKit — pending / remaining tasks (handoff)

Status snapshot as of round 3. Everything here is real work left on the
table; the rest of the round-3 brief landed in-code. Cross-reference
`PLACEHOLDERS.md` for design decisions and `suggested-features.md` for
longer-horizon ideas.

## Landed this round

- `src/components/ui/spinner.tsx` — centered `Spinner` used in place of
  bare "Loading…" text on the dashboard, review page, renter flow, and
  auth page. Includes `role="status"` + `aria-live="polite"` for
  screen-reader parity.
- `src/lib/i18n.ts` — expanded from EN/ES to eight HUD-priority
  languages (EN, ES, ZH, VI, HT, TL, SO, AR). Missing keys fall back
  to English. Full native coverage exists for EN/ES; the other six
  translate the highest-frequency keys only — hand off to a
  translator to fill the remaining strings.
- Renter `ClosedPage` now offers "Start a new application" (clears
  `localStorage["rd:app:${program_token}"]` and re-runs
  `startApplication`).
- Renter `StatusBadge` promoted from monochrome to full status color
  (pass/flagged/fixing) using the existing `status-*` utilities.
- `auth.tsx` — hCaptcha now gates BOTH sign-in and sign-up when
  `VITE_HCAPTCHA_SITE_KEY` is configured. Spinner replaces
  "Please wait…" text.
- Manager review page — added per-document **"Ask renter to retake"**
  action that resets document status to `needs_fixing` and appends
  the manager's note. Renter sees updated state via realtime.
- SEO — `og:image` and `twitter:image` wired to
  `/preview-image.png` on the landing route only (per SEO rules, leaf
  routes only).
- `supabase/consolidated-schema.sql` — single-file snapshot of the
  current schema (create tables, grants, RLS, RPCs, triggers,
  extensions, retention job). Regenerate on schema change.
- `SUBMISSION.md` rewritten as a hackathon write-up; the deploy
  checklist moved to `DEPLOYMENT.md`.

## Still outstanding (in brief order)

### A. Round-2 items still open

1. **Real storage-object purge in retention job.**
   The nightly `pg_cron` job (`dockit-purge-stale`) nulls
   `documents.storage_path` but doesn't delete the underlying
   Storage object. Ship an edge function or Vercel cron that:
   - Reads `applications` decided ≥ `programs.retention_days` ago and
     whose `documents.storage_path IS NULL`,
   - Lists remaining objects under `${session_token}/${app_id}/`,
   - Calls `storage.from('documents').remove(paths)` with the
     service role.
   Wire the pg_cron entry to `pg_net.http_post` targeting the edge
   function URL. See `supabase/consolidated-schema.sql` for the
   current job.

2. **Sample-doc OCR when authoring a requirement.**
   Managers should be able to drop a sample document into the
   requirement form and have DocKit propose keyword rules from OCR.
   Fallback rule: at least one manual keyword is required if they
   skip the sample. Suggested surface: expand the requirement editor
   in `programs.$id.tsx` with a "Suggest from sample" affordance
   that reuses `runOcr()` from `src/lib/ocr.ts` and derives top-N
   distinctive tokens.

3. **Application snapshots with signed hashes.**
   At each state transition (submitted, approved, rejected,
   withdrawn) capture a snapshot of the packet bytes and store its
   SHA-256 in a new `application_snapshots` table
   (`{ id, application_id, state, packet_sha256, taken_at }`). Show
   the hash on the review page so operators can audit tampering.

4. **Bulk export ZIP of approved packets.**
   Manager action on the program page: build a ZIP of all
   packet_path files where status = 'approved' since a date. Use
   `jszip` in the browser or stream from a server route. Only
   include packets whose storage objects still exist.

5. **Delegated caseworker checklist.**
   Add `applications.pre_marked_requirements TEXT[]` and let
   managers pre-mark a requirement as satisfied before sharing the
   link (e.g., ID already on file). The renter flow should hide any
   pre-marked slot from the checklist.

6. **Accessibility audit.**
   - Verify one `<main>` per route (currently OK on renter and
     managed layouts).
   - Add `aria-live` to the checklist progress `{done}/{slots.length}`
     counter so retakes announce.
   - Contrast: `status-flag` uses `warning-foreground` on a warning
     tint — spot-check against dark mode.
   - `AlertDialog` (Radix) is already good; ensure any custom
     modals inherit the same focus trap.

7. **Print layout for the renter checklist.**
   `PrintableView` currently renders a summary card. Ship a real
   `@media print` stylesheet that expands each requirement into a
   full page with the OCR outcome and manager instructions.

8. **Desktop scroll issue on review page.**
   The document list `<aside>` should be `sticky top-4` and the
   detail pane scroll independently on `lg` breakpoints.

9. **Dash-overuse copy pass.**
   Round-2 introduced em-dashes throughout renter and manager copy.
   This round removed them from `i18n.ts`; sweep `src/routes/*` for
   remaining `—` in JSX literals and replace with commas or line
   breaks.

### B. Consolidated schema

Kept in `supabase/consolidated-schema.sql`. Regenerate whenever a
migration lands. Contents are hand-consolidated, not machine-generated;
keep it in sync manually.

### C. Custom emails via MailerSend

Team invites and renter decisions still trigger no email — the
templates exist in `EMAIL_TEMPLATES.md` but no server route calls
MailerSend. Suggested:

- `src/routes/api/invite.ts` — POST, `requireSupabaseAuth`, verifies
  the caller can access the program, calls MailerSend REST with the
  team invite HTML body.
- Extend `manager_decide_application` to enqueue a mail via a new
  server route (invoked from the client after decision).
- Also rewrite Supabase Auth email templates in the dashboard with
  branded HTML (copy in `EMAIL_TEMPLATES.md`).

### D. Auth email confirmation link

Confirm the Supabase project's **Site URL** is set to
`https://the-dockit.vercel.app` (Dashboard → Authentication → URL
Configuration) and that Redirect URLs includes `/dashboard`. `auth.tsx`
already sets `emailRedirectTo: ${window.location.origin}/dashboard`.

### E. Small fixes still open

- **Favicon crispness at 16/32.** `public/favicon.png` is 512×512;
  browsers downscale it. Ship an `.ico` with 16/32/48 sizes for the
  crispest tab icon.
- **Logo sizing on the renter header.** Currently 24×24. Bump to
  32×32 on tablets and up.
- **Button hover states.** Some `outline` variants lack a hover
  background. Verify against `src/components/ui/button.tsx` and
  add `hover:bg-muted` where missing.

### F. Suggested features implemented vs deferred

| Feature | State |
| --- | --- |
| PDF uploads (rasterized) | Done (page 1 only) |
| In-app messaging (manager notes) | Done |
| Auto-team linking on signup | Done |
| Multi-language expansion | Partial (structure + high-need HUD languages, native strings incomplete) |
| Configurable retention window | Done |
| Per-doc "please retake" | Done |
| Application snapshots | Pending (A.3) |
| Bulk export ZIP | Pending (A.4) |
| Delegated caseworker pre-check | Pending (A.5) |
| Accessibility audit | Partial (A.6) |
| Sample-doc OCR for requirements | Pending (A.2) |

### G. Nice-to-haves not in the brief

- Rate limit renter document writes by IP as well as session token.
- Add an audit log table for manager actions.
- Add a "download all documents" ZIP for a single application.

