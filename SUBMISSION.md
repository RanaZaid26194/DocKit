# DocKit — hackathon write-up

## The problem

Affordable-housing paperwork punishes the most vulnerable applicants.
A single missing pay stub, an expired ID, or a photo that a caseworker
can't read means the whole application gets bounced and the applicant
starts over — sometimes losing their place in a waitlist that took
months to reach. Housing offices are overwhelmed too: caseworkers
spend hours triaging incomplete submissions instead of making
decisions.

Every existing "AI copilot" pitched at this space wants to be a
chatbot that decides eligibility. That's the wrong shape. Eligibility
is a legal determination — a bot cannot and should not make it.

## What DocKit is

DocKit is a **renter-controlled document copilot**. It is not a
chatbot. It is not an eligibility engine. It is a step-by-step
checklist that runs on the renter's own phone:

- The housing office creates a program (Section 8, LIHTC, public
  housing, or custom) and shares one QR code / link with
  applicants.
- The renter opens the link, answers a few questions, and works
  through a checklist of the exact documents this program needs.
- Every document is OCR'd and EXIF-checked **on the renter's own
  device** — the app tells them if the date is stale, the ID is
  expired, the name doesn't match, or the photo looks tampered.
  Nothing leaves the phone until the packet is complete.
- When the checklist is green, DocKit builds a review-ready PDF
  packet and hands it to the housing office. The office reviews
  the packet in a side-by-side desktop UI, approves or asks for a
  retake, and the renter sees the update in real time.
- Uploaded images auto-purge on decision, and any incomplete
  application older than the program's retention window (default
  90 days) is wiped nightly.

## Design principles that shaped every decision

1. **The human still decides.** DocKit never tells anyone they don't
   qualify. Every failed rule shows as "needs fixing" with a plain
   explanation and a retake button.
2. **Privacy is a feature, not a footnote.** OCR is Tesseract.js in a
   WebWorker. EXIF checks are `exifr` in the browser. Zero cloud LLM
   calls. Zero image bytes shipped to a third party. The renter can
   "start over" at any moment and every uploaded object is deleted.
3. **No conversational UI.** The renter never has to phrase a
   question. Every action is a labeled button.
4. **Deterministic rules, not vibes.** The rule engine is pure
   JavaScript — regex, date windows, name matching. Managers can
   read exactly what will pass and fail.
5. **Offline-tolerant.** PWA manifest, service-worker friendly,
   works over slow LTE. Payloads are small (Tesseract's language
   pack is the biggest thing on the wire).
6. **WCAG AA out of the box.** Semantic HTML, 44px tap targets,
   `aria-live` on progress, EN/ES/ZH/VI/HT/TL/SO/AR language
   support with LTR/RTL awareness.

## Technical bets worth calling out

- **TanStack Start on Vercel** for a full-stack React 19 app with
  SSR-friendly SEO and typed server functions.
- **Supabase** for auth, Postgres with RLS, Storage, and Realtime.
  RLS is enforced everywhere; renter access flows through
  `SECURITY DEFINER` RPCs so we never expose a `service_role`
  key to the client.
- **`pg_cron`** runs the nightly retention purge respecting each
  program's `retention_days`.
- **`pdf-lib` + `pdfjs-dist`** in the browser build the outgoing
  packet and rasterize any incoming PDFs so Tesseract can read
  them.
- **`@fontsource/inter`** ships fonts with the bundle — no runtime
  Google Fonts request.
- **hCaptcha** protects both sign-in and sign-up.
- **Vercel Web Analytics** for anonymized usage.
- **MailerSend** through Supabase Auth SMTP for auth email, plus
  API tokens ready for custom transactional templates.

## What "done" looks like

- Property manager signs up, spins up a program in under two
  minutes, prints the QR code, and puts it on a bulletin board.
- Renter scans it on the bus, works through the checklist during
  their commute, and submits before their stop.
- Caseworker opens the review desk on a laptop, sees each document
  side-by-side with the requirement, makes the decision.
- Images vanish from storage on decision. Nobody's ID sits in a
  bucket for years.

## What's next

- Bulk ZIP export for approved cohorts (audit trail).
- Application snapshots with signed hashes.
- Storage-object purge in the nightly retention job (currently
  the DB row is nulled but the object needs an edge function to
  delete).
- Sample-doc OCR to suggest requirement rules from an example
  document.
- Native strings for the remaining six languages.

Full open work is tracked in `pending-remaining-tasks.md`. Deploy
steps live in `DEPLOYMENT.md`. Every intentional trade-off lives in
`PLACEHOLDERS.md`.

DocKit is small, it is boring, and it refuses to make a legal
decision. That's the whole point.
