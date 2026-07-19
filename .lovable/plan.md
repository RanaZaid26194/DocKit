# RealDoor — Build Plan

A renter-controlled copilot that checks affordable-housing application documents client-side, with a property-manager dashboard for review. Never decides eligibility — flags for humans.

## Stack (fixed by brief)

React + Vite + TS + Tailwind + shadcn/ui, Supabase (Postgres/Auth/Storage/RLS), Tesseract.js OCR, pdf-lib, exifr, qrcode, hCaptcha, Resend SMTP. No cloud LLM. Deploy target: Vercel.

> Note: current template is TanStack Start (not plain Vite+React). I'll convert `src/` to a plain Vite React SPA (`index.html`, `main.tsx`, React Router) so it matches the brief and deploys cleanly to Vercel with a `vercel.json` SPA rewrite. All TanStack files will be removed.

## Milestones

### 1. Scaffold & design system

- Replace TanStack Start scaffold with Vite React SPA + React Router
- Warm, civic design tokens in `src/styles.css` (deep teal/slate primary, warm off-white bg, high-contrast, flat, no gradients), WCAG AA
- shadcn/ui components already present; add variants
- PWA: `manifest.json`, service worker (offline shell), icon set generated via imagegen
- Generate logo, favicon, PWA icons → list in `MEDIA_ASSETS.md` along with the exact generation prompt used for each asset
- SEO: sitemap.xml, robots.txt, meta/OG on marketing pages, `noindex` on renter routes

### 2. Supabase schema + RLS (migration)

Tables: `profiles`, `programs`, `applications`, `documents`, `team_members`, plus enums for status/role. RLS on all. Storage bucket `documents` (private) with policies scoped by application token. `pg_cron` job for 90-day image purge. GRANTs per rules.

### 3. Auth (property manager)

- Email+password with confirmation
- hCaptcha widget on signup , verified server-side: token must be checked in a Supabase Edge Function using the secret key before the signup completes — not client-side validation alone
- Onboarding: org name, contact email → `profiles` row
- SECRETS.md documents Resend SMTP setup in Supabase Auth (I won't toggle it in code)

### 4. Property-manager dashboard

- Programs list + create program (presets: Section 8, LIHTC, Public housing, Scratch) with editable requirement rows (name, description, per-person flag, rule set)
- Program detail: shareable link + QR (client-side), applications table with statuses
- Application review: per-doc pass/flag/fail, EXIF flag banner, image viewer, approve/reject/withdraw → triggers image deletion (Edge Function `decide-application`)
- CSV export
- Aggregate analytics (fail-reason %, avg completion time) — no PII
- Team members: invite by email, owner/member roles

### 5. Renter flow (token-based, no auth)

- Route `/a/:token` — resolves application by unguessable token (32-byte)
- Intro screen, EN/ES toggle (i18n dictionary), co-applicant add
- Checklist UI: per-doc card with camera/upload
- OCR pipeline (worker): Tesseract.js → text → rule engine → exifr on image bytes
- Result states: pass (green) / needs fixing (red, plain reason) / flagged (amber, "may have been edited…" copy verbatim)
- Auto-save progress (server-side per token)
- Start-over: confirm dialog → delete storage objects + reset docs
- Completion → pdf-lib packet → user download + upload as `packet.pdf` to application
- Printable checklist view

### 6. Rule engine (`src/lib/rules/`)

Pure functions, composable:

- `nameMatch(text, names[])`
- `notExpired(text, today)` — parses common date formats
- `recentWithin(text, days)`
- `hasFields(text, patterns[])` — dollar amount, employer, signature line, date
- `docTypeKeywords(text, keywords[])`
- `expiryReminder(text, decisionWindowDays)` — flags upcoming expiry
Each returns `{ ok, reason, severity }`. Compose per requirement.

### 7. Client OCR + EXIF

- Web Worker wrapper around Tesseract.js (eng+spa langs)
- File validation: mime in {image/jpeg,image/png,image/webp,application/pdf}, size ≤ 10MB. For PDF uploads specifically: render the PDF page to a canvas using pdf.js first, then pass that image to Tesseract.js — Tesseract cannot read PDFs directly. If this conversion step proves unreliable to implement, restrict uploads to images only and log that decision in [PLACEHOLDERS.md](http://PLACEHOLDERS.md).
- exifr → look for `Software`/`ProcessingSoftware` matching Photoshop/GIMP/Snapseed/etc. → amber flag

### 8. Rate limiting

- Supabase Edge Function `upload-guard` checks per-token/IP counts in a `rate_limits` table (sliding window). Signup uses hCaptcha + Supabase built-in.

### 9. Retention

- Edge Function `decide-application` (called from PM UI): sets status + decided_at, deletes storage objects, nulls `storage_path`
- pg_cron nightly: purge images for applications idle ≥90 days
- Renter start-over: client deletes objects via signed policy, server-side function double-checks by token

### 10. Docs

- `SECRETS.md` — all env vars (SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE (edge fn only), VITE_HCAPTCHA_SITE_KEY, HCAPTCHA_SECRET, RESEND_API_KEY + SMTP setup steps), where set (Vercel vs Supabase)
- `.env.example` with placeholders
- `MEDIA_ASSETS.md` — every generated asset path
- `PLACEHOLDERS.md` — assumptions log (preset requirement lists sourced from public HUD norms, marked non-legal-advice; recency window default 60 days; decision window default 45 days; etc.)
- `suggested-features.md` — includes low-bandwidth mode + other proposals (NOT implemented)

## Technical decisions I'll make without asking

- Template swap: TanStack Start → Vite SPA (brief mandates "React + Vite")
- Router: react-router-dom v6
- i18n: lightweight custom dictionary (no i18next dep bloat), EN/ES
- Deployment: `vercel.json` with SPA rewrite; Supabase kept in same project
- Presets: HUD-norm-inspired doc lists, each labeled "not legal advice — edit before use"
- Analytics: computed on-demand from `documents`+`applications` (no separate warehouse)

## **Acceptance checklist**

Before calling the build done, verify each of the following works end-to-end and note pass/fail for each:

- Renter can upload a document → OCR runs → correct pass/fail/flagged state is shown
- PDF upload converts and OCRs correctly, or is cleanly rejected with a clear message if that path was dropped
- Property manager can create a program → shareable link and QR code generate correctly
- hCaptcha blocks a signup attempt with an invalid/missing token (server-side, not just UI-side)
- Start-over deletes uploaded images immediately, confirmed by checking storage, not just the UI state
- Property manager marking an application as decided triggers image deletion in storage
- Renter progress persists correctly after closing and reopening the same link
- EN/ES toggle changes all renter-facing copy, not just some of it  
CSV export and aggregate analytics produce correct, PII-free output

##   
**Scope confirmation**

This is ~2–3 days of dense work in one shot. I'll build it end-to-end without pausing. Confirm to proceed, or tell me to trim any milestone (e.g. defer PWA, team roles, or analytics to `suggested-features.md`).