# ADR 0006: FestiPlus emails the updated delegate confirmation

- **Status:** Accepted
- **Date:** 2026-11-13
- **Area:** Audience addon: registration, delegate edits, email
- **Relation:** The first confirmation is still sent by Freecomers Laravel (`FestivalDelegateRegistrationMail`) when a delegate registers on the public site.

## Context
- Staff change delegates in FestiPlus (`/registration/edit/:id`), for example from a Day Pass to a Full-Festival Pass. The delegate's confirmation then needs to reach them again, but only Laravel could send it, and only once, at registration. FestiPlus had no way to send email.
- The same edit exposed a bug. Switching to a Full-Festival Pass only hid the day checkboxes, so the old days were saved too (`custom_data.pass_days`). The public confirmation on the Freecomers site reads that field through Laravel `my-delegate-pass`, so it showed "Full-Festival Pass" with "Valid days: Nov 21st".

## Decision
1. **Only a Day Pass keeps days.** A pass type containing "Day Pass" (e.g. "Day Pass (Choose Days)") is a Day Pass. Every other pass saves `pass_days: []`, which is what Laravel saves.
   - The rule is applied in the edit and on-spot forms, and again by the backend (`updateAttendee`, `registerAttendee`), using `isDayPass()` in `delegateConfirmationEmail.js`.
   - Migration `025_clear_stale_pass_days.js` clears days already saved on non-Day passes. It changes JSON data only; there is no schema change to the shared table.
2. **FestiPlus sends email itself** through `core/services/mail.service.js` (nodemailer). It uses the same `MAIL_*` keys as the Laravel `.env`, and the same account on dev. Without `MAIL_HOST` nothing is sent and the save reports "Email isn't set up on the server". A failed email never undoes a save.
3. **The updated confirmation** (`core/services/delegateConfirmationEmail.js`) follows the layout of the Laravel email. Every value comes from the festival's records:
   - the festival name (`events`);
   - the venue card (`registration_form_schema.venue_info`: venue, address, dates, desk timing, screening hours `show_timing`, instructions, and an optional donation link `donation_url`);
   - the category (`audience_categories`) and the delegate's own details;
   - a link to the festival page on the public site (`FREECOMERS_SITE_URL`, defaulting to next.autovertest.com on autovertest and freecomers.com otherwise).

   Sections without data are left out. The KASHISH app block and the donation QR image in the Laravel email are not copied: they are hard-coded there, and the QR comes from an external QR service.
4. **Staff choose when to send.** The edit form has "Email the updated confirmation to {email}" above Save.
   - It is ticked by default when something on the confirmation changed: name, email, phone, pass type, days or category. Staff can untick it, or tick it to resend.
   - The API takes `send_confirmation: true` and returns `confirmation_email: { sent, to, reason }`. The Audience page's success message says whether it was sent.
5. Settings › Audience › Step 4 (venue card) gains **Screening Hours** and **Donation Link (optional)**, both used by the email.

## Consequences
- Two systems now send delegate confirmations: Laravel at registration, FestiPlus after edits. Their layouts match, but a change to one template has to be made in the other by hand.
- Each environment's backend `.env` needs the `MAIL_*` keys for FestiPlus to send email.

## Amendment 1: Same design as the first confirmation (2026-11-13)
- **Context:** the first version used its own layout. The team wants the updated email to look exactly like the confirmation Laravel sends at registration.
- **Decision:**
  - `delegateConfirmationEmail.js` now copies the markup and styles of `resources/views/email/festival_delegate_registration.blade.php`: the green status pill, serif heading, Pass holder / Category / Credential code row, venue with pin, schedule box, instruction line, donation block with QR and button, app block with Android and iOS QR codes, and footer.
  - As in the first email, "Category" shows the pass type; a Day Pass also lists its days ("Day Pass · Nov 21st"), because the first email doesn't show days anywhere.
  - Text the Laravel template has written in comes from settings instead. Settings › Audience › Step 4 › **Confirmation email**: Venue Address, Organiser Name, Help Desk Email (defaults to `MAIL_FROM_ADDRESS`), Donation Message, App Name, App Description, Android App Link, iOS App Link. These sit alongside the existing Donation Link and Screening Hours. Blocks without data are left out.
  - QR codes are generated in FestiPlus with the `qrcode` package, and the venue pin is stored at `backend/src/assets/email/pin-filled.png`. All of these are sent as inline (`cid:`) images: no external QR service, and nothing depends on a host that only exists on dev.
  - Only the subject marks it as an update ("Delegate Registration Confirmation (updated) — …").
- **Consequence:** a design change to the Laravel email has to be copied here by hand.

