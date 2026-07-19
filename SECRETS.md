# Secrets for DocKit

DocKit runs on **your own Supabase project** (Lovable Cloud is not required) and
deploys to **Vercel** at `https://the-dockit.vercel.app`. All secrets are loaded
from environment variables. Use `.env.example` locally; set real values in Vercel
and Supabase dashboards as noted.

## Supabase (bring-your-own)

| Variable | Purpose | Where to set |
| --- | --- | --- |
| `VITE_SUPABASE_URL` / `SUPABASE_URL` | Backend URL. | Vercel: Project → Settings → Environment Variables. |
| `VITE_SUPABASE_PUBLISHABLE_KEY` / `SUPABASE_PUBLISHABLE_KEY` | Publishable anon key. | Same as above. |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-only admin key. Never exposed to the client bundle. | Vercel env only. |

**One-paste schema setup:** open `supabase/consolidated-schema.sql`, paste into
the Supabase SQL editor, and run. That file provisions every table, RLS policy,
security-definer RPC, storage bucket, and the nightly retention purge job.

## hCaptcha (bot protection on housing-office signup)

| Variable | Purpose | Where to obtain | Where to set |
| --- | --- | --- | --- |
| `VITE_HCAPTCHA_SITE_KEY` | Public site key rendered in the signup form. | hCaptcha dashboard → Sites → Site key. | Vercel env (all environments). |
| `HCAPTCHA_SECRET` | Server-side secret for token verification. | hCaptcha dashboard → Settings → Secret key. | Vercel env (Prod/Preview only). |

If `VITE_HCAPTCHA_SITE_KEY` is unset the widget is skipped and the server verifier
reports `unconfigured: true`. Signups still work but are not bot-protected.

## MailerSend (transactional email)

Used for outbound email (invites, decision notices). Configured **through Supabase
Auth SMTP** so Supabase renders confirmation emails, and (optionally) via
server routes for custom transactional messages.

| Variable | Purpose | Where to set |
| --- | --- | --- |
| `MAILERSEND_API_TOKEN` | API token, used only if you send custom emails from server routes. | Vercel env. |
| `MAIL_FROM_ADDRESS` | Verified sender address on your MailerSend domain. | Vercel env. |
| `MAIL_FROM_NAME` | Display name in the "from" header. | Vercel env. |

Supabase Auth → Providers → Email → SMTP Settings:

- Host: `smtp.mailersend.net`
- Port: `587` (STARTTLS)
- Username: your MailerSend SMTP username
- Password: your MailerSend SMTP password
- Sender address: an address on your verified MailerSend domain
- Leave **Confirm email** on

Template copy lives in `EMAIL_TEMPLATES.md`.

## Vercel

Add every variable above under **Project → Settings → Environment Variables**
for Production, Preview, and Development. Vercel Web Analytics is enabled in
the app (`<Analytics />` in the root route) — no extra secret required.

## Rotating a leaked key

- hCaptcha: regenerate secret in dashboard, replace `HCAPTCHA_SECRET` in Vercel.
- MailerSend: revoke API token and SMTP password in the MailerSend dashboard,
  replace in Supabase SMTP settings and Vercel env.
- Supabase publishable/service role key: rotate in Supabase → Project Settings → API.
