# Suggested features — status after round 5

## Shipped this round

- **#2 Multi-page PDF OCR** — `runOcrOnPdf` rasterizes up to 8 pages with
  per-page progress; used by the sample analyzer.
- **#3 In-app messaging** — `application_messages` table + renter RPCs
  (`renter_list_messages`, `renter_post_message`, rate-limited) and
  `src/lib/messages.ts`.
- **#6 Program-level default pre-marked requirements** — `programs.default_pre_marked`,
  Settings-tab UI, seeded into every new application by `renter_start_application`.
- **#7 Bulk actions** — multi-select on the Applications tab with bulk
  approve / not-approve / withdraw behind a confirmation modal that lists
  exactly which applications change, plus bulk ZIP of the selection.
- **#9 Starter-template directory** — seven forkable presets
  (`TEMPLATE_DIRECTORY`) that can be merged into an existing program.
- **#12 Explainability data** — `runRules` now returns a `RuleTrace[]`
  describing what each rule looked for and what it found.
- **Custom keyword / rule editor** — managers can add, edit and delete every
  rule kind by hand (keyword chips, day windows, regex field probes).
- **Sample documents** — a sample image can be attached to a requirement and
  shown to renters, with an optional photo tip.
- **Better suggestion engine** — image pre-processing (resample, grayscale,
  percentile auto-contrast, S-curve) before OCR, retry-on-empty, plus
  phrase mining with header bias and a paste-text fallback.
- **Enhanced PDF packet** — branded cover, status summary table with page
  numbers, per-document metadata blocks, numbered footers.
- **Mail disabled** — `/api/public/mailersend` is a 501 stub; the full
  implementation is preserved commented out in the same file.

## Still open

### #4 Native translations for ZH/VI/HT/TL/SO/AR
Structure and fallbacks are in place in `src/lib/i18n.ts`; EN/ES are
complete, the other six cover only key strings. Needs a qualified
translator per language — machine translation is not appropriate for
housing paperwork.

### #5 Snapshot audit-trail UI
`application_snapshots` records a SHA-256 at every state change but the
review page still doesn't render it. Add an "Audit trail" card listing
`state`, `packet_sha256`, `taken_at` with a copy button.

### #11 Renter document library
`src/lib/doc-library.ts` ships the local IndexedDB store (save, list,
rank-by-requirement, prune to 24 entries). The renter checklist still
needs the "Reuse a document" picker wired to it, and reused files must be
re-run through OCR + EXIF + that program's rules.

### #10 Accessibility AAA
WCAG AA passes. AAA-level contrast tokens, a full focus-visible pass, and
a scripted VoiceOver/TalkBack walkthrough per critical flow are outstanding.

### Carried over
- **#1 Low-bandwidth fallback mode** — server-side deferred OCR for slow
  phones; shifts the privacy story, needs an explicit decision.
- **#8 Renter SMS nudges** — needs a Twilio/MessageBird connector.

## New ideas from this round

- **Rule dry-run bench** — let a manager drop three sample documents into a
  requirement and see pass/fix/flag for each before publishing the link.
- **Keyword coverage warnings** — flag requirements whose keyword list never
  matched any real upload, so dead rules get noticed.
- **Sample-image redaction** — auto-blur digit runs that look like SSNs or
  account numbers before a sample image is stored on the requirement.
- **3D/immersive shell** — see the note at the end of the round-5 reply:
  scroll-linked depth on the landing page, a tilted phone mock showing the
  live checklist, and layered parallax panels. Deliberately *not* applied to
  the renter flow, which must stay fast and legible on old Android phones.
