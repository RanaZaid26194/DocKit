# Suggested features — status after round 6

## Shipped

- **#2 Multi-page PDF OCR** — `runOcrOnPdf` rasterizes up to 8 pages with
  per-page progress, now wired into the renter checklist ("Reading page 2 of
  5"), so a date on page 3 still satisfies a rule. Page 1 is stored as the image.
- **#3 In-app messaging** — `application_messages` plus rate-limited renter
  RPCs, with both UIs mounted: a thread on the renter checklist and one on the
  manager review page.
- **#5 Snapshot audit trail** — the review page renders an "Audit trail" card
  listing state, timestamp and the packet SHA-256 at each state change.
- **#6 Program-level default pre-marked requirements** — `programs.default_pre_marked`,
  Settings-tab UI, seeded into every new application.
- **#7 Bulk actions** — multi-select approve / not-approve / withdraw behind a
  confirmation modal, plus bulk ZIP of the selection.
- **#9 Starter-template directory** — seven forkable presets.
- **#11 Renter document library** — local-only IndexedDB store plus the
  "Reuse saved" picker on every checklist slot. Reused files are re-uploaded
  and re-run through OCR, the EXIF check and that program's rules from
  scratch; a "Clear them" control wipes the store.
- **#12 Explainability** — `runRules` returns a `RuleTrace[]`, and the review
  page renders a "Why this result" panel per document showing what each rule
  looked for, what it found, and the raw recognized text.
- **Custom keyword / rule editor** — every rule kind editable by hand
  (keyword chips, day windows, regex field probes).
- **Sample documents** — sample image and photo tip now displayed to renters
  above the capture buttons.
- **Better suggestion engine** — preprocessing (resample, grayscale,
  percentile auto-contrast, S-curve), retry-on-empty, phrase mining with
  header bias and a paste-text fallback.
- **Enhanced PDF packet** — branded cover, status summary table with page
  numbers, per-document metadata blocks, numbered footers.
- **Mail disabled** — `/api/public/mailersend` is a 501 stub; the full
  implementation is preserved commented out in the same file.

## Still open

### #4 Native translations for ZH / VI / HT / TL / SO / AR
Structure and fallbacks are in place in `src/lib/i18n.ts`; EN and ES are
complete, the other six cover key strings only. Needs a qualified human
translator per language — machine translation is not appropriate for housing
paperwork.

### #10 Accessibility AAA
WCAG AA passes, and landmarks, live regions and labels are in place across the
renter and manager flows. AAA contrast tokens, a full focus-visible pass and a
scripted VoiceOver / TalkBack walkthrough per critical flow are outstanding.

### Carried over
- **#1 Low-bandwidth fallback mode** — server-side deferred OCR for slow
  phones shifts the privacy story; needs an explicit decision.
- **#8 Renter SMS nudges** — needs a Twilio or MessageBird connector.

## New ideas from this round

- **Rule dry-run bench** — drop three sample documents into a requirement and
  see pass / fix / flag for each before publishing the link.
- **Keyword coverage warnings** — flag requirements whose keyword list never
  matched a real upload, so dead rules get noticed.
- **Sample-image redaction** — auto-blur digit runs that look like SSNs or
  account numbers before a sample image is stored on a requirement.
- **Library-aware prefill** — when a saved document already satisfies a new
  program's rules on re-check, offer a one-tap "apply to all matching slots".
- **3D / immersive shell** — scroll-linked depth on the landing page, a tilted
  phone mock showing the live checklist, layered parallax panels. Deliberately
  *not* applied to the renter flow, which must stay fast and legible on old
  Android phones.
