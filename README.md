# RealDoor

A renter-controlled copilot for affordable-housing paperwork. Built for
the RealPage RealDoor hackathon challenge.

## What it does

- **Property managers / housing authorities** sign up, define a program
  (Section 8, LIHTC, public housing, or custom), and share a link or QR
  code with renters.
- **Renters** open the link on their phone (no login, ever), fill in
  their name, and upload each required document one at a time. Text
  recognition (Tesseract.js) and metadata checks (exifr) run entirely
  in the browser. Nothing leaves the device to any AI service.
- Each document gets a **pass / needs-fixing / flagged** result. Flagged
  never means rejected — it means "a reviewer should take a look."
- Once everything is complete, the renter's browser assembles a single
  PDF packet (pdf-lib) and it lands in the housing office's dashboard.
- The manager reviews, then approves / rejects / withdraws. On decision,
  the raw images are automatically deleted from storage.

## Stack

React 19 · TanStack Start (Vite + React) · TypeScript · Tailwind CSS v4
· shadcn/ui · Supabase (Postgres, Auth, Storage, RLS, pg_cron) ·
Tesseract.js · pdf-lib · qrcode · exifr · hCaptcha · Resend (SMTP via
Supabase Auth). Deploys to Vercel.

## Getting started

```bash
bun install
bun run dev
```

Copy `.env.example` to `.env.local` and fill in the values described in
[`SECRETS.md`](./SECRETS.md).

## Companion docs

- [`SECRETS.md`](./SECRETS.md) — every env var, where to obtain it, where to set it.
- [`MEDIA_ASSETS.md`](./MEDIA_ASSETS.md) — swap the logo/favicon.
- [`PLACEHOLDERS.md`](./PLACEHOLDERS.md) — assumptions we made along the way.
- [`suggested-features.md`](./suggested-features.md) — v2 ideas (not implemented).

## Design principles

- **Never decides eligibility.** A human always makes the call.
- **Never claim fraud.** Metadata heuristics only flag for human review.
- **No cloud LLM calls.** Document content never leaves the device to a
  third-party inference API.
- **Warm, civic, calm.** No purple gradients, no exclamation points on
  system messages, WCAG AA contrast, mobile-first large touch targets.
