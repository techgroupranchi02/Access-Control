/**
 * Display helpers for delegates registered at the desk with only a mobile number.
 *
 * On Spot Registration needs only the mobile (the paper form is entered later), so `name` can be ''
 * until then. Show the mobile instead of a blank, and flag the record as "Details pending" until it
 * has a name and an email (the backend sends `details_pending` from the delegate list).
 */

/**
 * A mobile number with the middle hidden: first 3 and last 4 digits ("7667130178" → "766•••0178").
 * A leading "+" is kept; numbers with fewer than 8 digits are hidden except the last 4.
 */
export function maskPhone(value) {
  const raw = String(value || '').trim();
  const digits = raw.replace(/\D/g, '');
  if (!digits) return raw;
  const plus = raw.startsWith('+') ? '+' : '';
  if (digits.length < 8) return plus + '•'.repeat(Math.max(digits.length - 4, 0)) + digits.slice(-4);
  return plus + digits.slice(0, 3) + '•'.repeat(digits.length - 7) + digits.slice(-4);
}

/**
 * An email with most of the name hidden: first 2 and last 1 characters before the @, domain shown
 * ("sk0807812@gmail.com" → "sk••••••2@gmail.com"); at most 6 dots, so the length stays hidden. Names of 3 characters
 * or fewer keep only the first.
 */
export function maskEmail(value) {
  const raw = String(value || '').trim();
  const at = raw.lastIndexOf('@');
  if (at < 1) return raw;
  const user = raw.slice(0, at);
  const domain = raw.slice(at + 1);
  const shown = user.length <= 3 ? user.slice(0, 1) + '•'.repeat(user.length - 1) : user.slice(0, 2) + '•'.repeat(Math.min(user.length - 3, 6)) + user.slice(-1);
  return `${shown}@${domain}`;
}

/** Name, else mobile (masked with { maskPhone: true }), else a placeholder. */
export function attendeeLabel(attendee, fallback = 'Details pending', { maskPhone: mask = false } = {}) {
  if (!attendee) return fallback;
  const name = typeof attendee.name === 'string' ? attendee.name.trim() : '';
  const phone = attendee.phone ? (mask ? maskPhone(attendee.phone) : attendee.phone) : '';
  return name || phone || attendee.attendee_name || fallback;
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

/**
 * How the delegate registered, from saas_attendees.registration_type:
 * Laravel's public form writes 'online' / 'guest_online'; the FestiPlus desk writes 'desk'.
 * Older rows use 'Pre-Registered' / 'On-Spot' / 'spot'. Anything else is shown as stored.
 */
export function registrationSourceLabel(type) {
  const t = String(type || '').trim();
  if (!t) return '';
  const key = t.toLowerCase().replace(/[\s_-]+/g, '');
  if (key === 'online' || key === 'preregistered') return 'Online';
  if (key === 'guestonline') return 'Online (guest)';
  if (key === 'desk' || key === 'onspot' || key === 'spot') return 'On spot (desk)';
  if (key === 'kashishsync') return 'Kashish import';
  return t.replace(/[_-]+/g, ' ');
}
