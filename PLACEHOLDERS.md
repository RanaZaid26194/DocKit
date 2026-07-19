# Placeholders and assumptions

Log of every decision made without asking the user — replace or revisit
after reviewing.

## Stack shape

- The brief calls for **React + Vite + TypeScript + Tailwind + shadcn/ui**
  deployed to **Vercel**. The Lovable starter is **TanStack Start on Vite**,
  which is a superset (React + Vite + TS + Tailwind + shadcn/ui + a router
  and an SSR shell). It builds and deploys cleanly to Vercel with the
  `@vercel/build` preset — no manual step needed. Kept as-is so the
  auth-middleware/server-function/DB tooling all continues to work.
- **PDF uploads**: supported via pdf.js — first page rasterized to JPEG
  before OCR. Multi-page PDFs are OCR'd from page 1 only.
- **No Vercel `rewrites`**: TanStack Router handles deep links; nothing
  extra needed.
- **Canonical/OG URLs**: hardcoded to `https://the-dockit.vercel.app`
  per the round-2 brief. Change in `__root.tsx`, `index.tsx`,
  `sitemap[.]xml.ts`, `robots.txt`, and `llms.txt` if the domain moves.
- **Self-hosted fonts**: `@fontsource/inter` provides the required weights.
  No Google Fonts request at runtime.
- **Vercel Web Analytics**: `<Analytics />` mounts in `__root.tsx`.
- **MailerSend**: wired through Supabase Auth SMTP for auth emails; the
  API token is available for future server-route sends.
- **Realtime**: subscriptions live on `applications` and `documents` for
  both manager (dashboard, review) and renter (decision push).
- **Retention window**: configurable per program in `programs.retention_days`
  (7–365). Nightly `pg_cron` job respects the per-program value.
- **Team invites**: auto-linked at signup by the `handle_new_user` trigger.

## Preset requirement lists

- `Section 8`, `LIHTC`, and `Public housing` presets in
  `src/lib/presets.ts` are **inspired by publicly documented HUD program
  norms**, not copied from a specific authority. They are labeled as
  non-legal-advice examples the manager must edit. Change or extend as
  needed.

## Rule engine defaults

- `recentWithin` window on proof-of-income: **60 days**.
- `expiryReminder` window on ID: **45 days** before expiry.
- `recentWithin` on proof-of-address: **90 days**.
- Name match: at least the first and last name substring must appear in
  the OCR text.

## Retention

- Nightly `pg_cron` job (`dockit-purge-stale`) at **03:00 UTC** wipes
  `documents.storage_path` for applications idle ≥ 90 days. It does
  **not** delete the physical storage objects; add a follow-up
  edge-function or Vercel cron that reads the nulled rows and issues
  Storage `remove` calls if you want fully cleared bytes.

## Team invites

- Invitations are stored as `{ program_id, invited_email, role: 'member' }`
  rows. When someone signs up with that email, we don't yet auto-link the
  `user_id`. A background job or a login-time hook to backfill
  `user_id = auth.uid() WHERE invited_email = email` would complete the
  flow.

## Rate limiting

- Renter document writes: **60 per hour per session token**, enforced in
  the `renter_save_document` RPC. No IP-based rate limit yet.

## hCaptcha graceful degradation

- If `VITE_HCAPTCHA_SITE_KEY` isn't set, the widget is skipped and the
  server verifier reports `unconfigured: true`. Signup still works, just
  without bot protection. This is intentional so a fresh clone runs, but
  should be replaced by refusing signup once the key is added in Vercel.

## OAuth

- Signup uses email/password only. Google/social sign-in is not enabled
  by default — property managers likely use org email addresses.

## Analytics

- Analytics per program are computed on-demand from `applications` and
  `documents`. No aggregate table yet. If a program grows past a few
  thousand applications, precompute nightly.

## Not shipped in v1

Tracked in `suggested-features.md`.
