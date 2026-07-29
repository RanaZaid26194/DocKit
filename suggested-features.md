# Suggested features — not implemented

These are ideas we thought of while building DocKit v1. Do **not**
implement any of these without an explicit go-ahead. Items that were
part of the original suggested-features list and have since shipped
were removed from this file — see `pending-remaining-tasks.md` for the
round-by-round changelog.

## 1. Low-bandwidth / lightweight fallback mode
A slim variant of the renter flow for slow networks and older phones:
skip Tesseract, skip client-side image previews, skip PWA install
prompts. The renter uploads a photo, we defer OCR to a background job
on the server, and we surface pass/fix/flag when the check completes.
Trade-off: images briefly leave the device before OCR, so the privacy
story shifts. Would also let us support feature phones through a plain
HTML form fallback.

## 2. Multi-page PDF OCR
Currently the PDF path rasterizes only page 1. Extend to N pages with a
progress indicator; useful for benefits letters that run 3+ pages.

## 3. In-app messaging (bounded, threaded)
Manager notes exist as a single field today. Extend to a small threaded
message log per document so back-and-forth ("please retake") does not
overwrite context.

## 4. Native translations for ZH/VI/HT/TL/SO/AR
The dictionary structure lists all eight HUD-priority languages, but
only EN/ES have full coverage today. Hand off `src/lib/i18n.ts` to a
qualified translator per language and expand each partial dictionary.

## 5. Snapshot audit trail UI
The `application_snapshots` table records a SHA-256 for every state
change but nothing renders it. Add an "Audit trail" card on the review
page that lists each snapshot with `state`, `packet_sha256`, `taken_at`
and a copy button.

## 6. Program-level default pre-marked requirements
Per-application `pre_marked_requirements` works today (schema + renter
checklist honors it). Add a Settings-tab control that seeds new
applications with a default set, so a caseworker doesn't have to update
every row by hand.

## 7. Bulk actions on the applications list
Extend the Applications tab: multi-select rows, then bulk approve,
bulk withdraw, or bulk export. Pair with a confirmation modal that
lists exactly what will change.

## 8. Renter SMS nudges for stalled applications
Reminder email exists conceptually via MailerSend. Add optional SMS
via a separate connector (Twilio, MessageBird) for the 7-day idle
nudge — many renters check SMS more reliably than email.

## 9. Configurable rule presets marketplace
Housing offices reinvent the same programs (Section 8, LIHTC,
public housing) with tiny variations. Ship a "starter templates"
directory that offices can fork and share with each other.

## 10. Accessibility AAA + full screen-reader walkthrough
WCAG AA is passed today; landmarks and live regions are in place.
AAA-level contrast, focus indicator polish, and a scripted
VoiceOver/TalkBack walkthrough per critical flow would raise the
floor further.

## 11. Renter document library
Once a renter has verified documents in one program, let them reuse
those verified images (with fresh EXIF/OCR re-checks) in a second
program — cuts repeat effort without weakening the per-program review.

## 12. Explainability panel on the manager review page
Show the raw OCR text, extracted dates, and which rules fired (with
which regex) so reviewers can trust the "Needs fixing" verdict
before overriding it.
