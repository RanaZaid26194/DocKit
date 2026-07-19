# Suggested features — not implemented

These are ideas we thought of while building v1. Do **not** implement any
of these without an explicit go-ahead.

## 1. Low-bandwidth / lightweight fallback mode (deliberately deferred)
A slim variant of the renter flow for slow networks and older phones:
skip Tesseract, skip client-side image previews, skip PWA install prompts.
The renter uploads a photo, we defer OCR to a background job on the server,
and we surface pass/fix/flag when the check completes. Trade-off: images
briefly leave the device before OCR, so the privacy story shifts. Would
also let us support feature phones through a plain HTML form fallback.

## 2. PDF document uploads
Wire `pdf.js` to rasterize the first N pages of an uploaded PDF, run
Tesseract on each page image, then combine the OCR text. Useful for
benefits letters and reference letters that renters have as PDFs already.

## 3. In-app messaging (bounded)
When a document is marked "needs fixing", let the property manager write
a short note the renter sees on their next visit. Text-only, no
attachments. Keeps the loop closed without adding a full chat surface.

## 4. Automatic team-member linking
Currently a team invite stores the email; the invitee gets access once
they sign up. Add a `handle_new_user` extension that backfills
`team_members.user_id` when the email matches.

## 5. Multi-language beyond EN/ES
Add Vietnamese, Simplified Chinese, Haitian Creole — the top-request set
from HUD language-access data. Keep the dictionary approach; no runtime
translation.

## 6. Manager-triggered document re-request
A one-click "please retake this one" that resets a single document
status and notifies the renter via email (Resend).

## 7. Accessibility audit + screen-reader script
Full VoiceOver / TalkBack walkthrough, add landmarks, add live regions on
the OCR checking state. WCAG AA is passed today but AAA is worth chasing.

## 8. Application snapshots
Every state change captures a signed hash of the packet contents. Useful
for audit-trail requirements in some jurisdictions.

## 9. Configurable retention window
Property managers set the auto-purge window (30/60/90 days) per program
instead of the hard-coded 90.

## 10. Bulk export
CSV export today is per program. Add a bulk ZIP of packets for an
approved cohort (only where retention still allows the images).

## 11. Delegated caseworker checklist
Managers can pre-answer specific requirements on behalf of a renter
(e.g. "we already have their birth certificate on file"). Renter then
only sees the remaining items.

## 12. Simple email/SMS nudges for stalled applications
If an application has been idle for 7 days, send one gentle reminder to
the renter's provided email. Requires Resend for email; SMS would need a
separate connector.
