## Secrets for DocKit

All secrets are loaded from environment variables. Use placeholder values in
your local `.env.example`; set real values in the Vercel and Supabase
dashboards as noted.

### Supabase (already auto-configured by Lovable Cloud)
| Variable | Purpose | Where to set |
| --- | --- | --- |
| `VITE_SUPABASE_URL` / `SUPABASE_URL` | Backend URL. | Vercel: Project Settings → Environment Variables (copy from `.env`). |
| `VITE_SUPABASE_PUBLISHABLE_KEY` / `SUPABASE_PUBLISHABLE_KEY` | Publishable anon key. | Same as above. |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-only admin key. Only if running scheduled purge scripts outside Supabase. | Vercel env, **never** in the client bundle. Obtain from Lovable Cloud → Cloud → Advanced → API keys. |

### hCaptcha (bot protection on the housing-office signup form)
| Variable | Purpose | Where to obtain | Where to set |
| --- | --- | --- | --- |
| `VITE_HCAPTCHA_SITE_KEY` | Public site key rendered in the signup form. | hCaptcha dashboard → Sites → your site → Site key. | Vercel: Project → Environment Variables (all environments). |
| `HCAPTCHA_SECRET` | Server-side secret used to verify the token. | hCaptcha dashboard → Settings → Secret key. | Vercel: Project → Environment Variables (Production/Preview only — never expose to the client). |

If `VITE_HCAPTCHA_SITE_KEY` is unset, the widget is skipped in the UI and the
server verifier reports `unconfigured: true`. Signups still work but are not
bot-protected. Set both keys before launching.

### Resend (transactional email — sends the signup confirmation)
| Variable | Purpose | Where to obtain | Where to set |
| --- | --- | --- | --- |
| `RESEND_API_KEY` | API key for Resend. Only needed if you connect a custom SMTP-relay service outside Supabase; the default flow uses Resend as Supabase Auth SMTP. | Resend dashboard → API keys. | Supabase (Auth → SMTP settings) using host `smtp.resend.com`, port `465`, user `resend`, password = your Resend API key. |

Resend setup steps in the Supabase project:

1. Verify a sending domain in Resend.
2. In Supabase, go to Auth → Providers → Email → SMTP Settings and paste the
   Resend SMTP host/port/user/password above.
3. Set the sender address to something on your verified Resend domain
   (`no-reply@yourdomain.org`).
4. Leave "Confirm email" **on** — do not disable email confirmation.

### Deployment (Vercel)

Add every variable above under **Project Settings → Environment Variables**
for the Production, Preview, and Development environments. No other manual
post-deploy steps are needed.

### Rotating a leaked key

- hCaptcha: regenerate secret in dashboard, replace `HCAPTCHA_SECRET` in Vercel.
- Resend: revoke and re-issue the API key, update the Supabase SMTP password.
- Supabase publishable key: rotate through Lovable Cloud (Cloud → Advanced).
