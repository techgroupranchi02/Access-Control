/**
 * Display helpers for delegates registered at the desk with only a mobile number.
 *
 * On Spot Registration needs only the mobile (the paper form is entered later), so `name` can be ''
 * until then. Show the mobile instead of a blank, and flag the record as "Details pending" until it
 * has a name and an email (the backend sends `details_pending` from the delegate list).
 */

/** Name, else mobile, else a placeholder. */
export function attendeeLabel(attendee, fallback = 'Details pending') {
  if (!attendee) return fallback;
  const name = typeof attendee.name === 'string' ? attendee.name.trim() : '';
  return name || attendee.phone || attendee.attendee_name || fallback;
}

/** True while the record is missing a name or an email. */
export function isDetailsPending(attendee) {
  if (!attendee) return false;
  if (typeof attendee.details_pending === 'boolean') return attendee.details_pending;
  if (attendee.details_pending === 0 || attendee.details_pending === 1) return Boolean(attendee.details_pending);
  const name = typeof attendee.name === 'string' ? attendee.name.trim() : '';
  const email = typeof attendee.email === 'string' ? attendee.email.trim() : '';
  return !name || !email;
}

/** Digits of a mobile number; valid desk numbers have 10 to 15. */
export function phoneDigitsOf(value) {
  return String(value || '').replace(/\D/g, '');
}

export function isValidMobile(value) {
  const n = phoneDigitsOf(value).length;
  return n >= 10 && n <= 15;
}
