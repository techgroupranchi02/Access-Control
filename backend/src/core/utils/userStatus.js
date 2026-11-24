/**
 * Freecomers account status (`users.status`, set by the Freecomers Laravel app) and who may sign in to
 * FestiPlus (docs/adr/0008-team-invitations.md).
 *
 *   0 = signed up, email OTP not verified yet
 *   2 = email verified, Freecomers onboarding (interests / profile) not finished
 *   1 = onboarding finished
 *   3 = deactivated
 *
 * A verified email is enough for FestiPlus: people invited to a festival team often never finish the
 * Freecomers onboarding. Unverified (0) and deactivated (3) accounts can't sign in.
 */

const USER_STATUS = Object.freeze({ UNVERIFIED: 0, ACTIVE: 1, ONBOARDING: 2, DEACTIVATED: 3 });

/** Statuses that may sign in to FestiPlus. */
const SIGN_IN_STATUSES = Object.freeze([USER_STATUS.ACTIVE, USER_STATUS.ONBOARDING]);

/** SQL condition for "this account may sign in", e.g. `WHERE u.email = ? AND ${canSignInSql('u')}`. */
function canSignInSql(alias = '') {
  const col = alias ? `${alias}.status` : 'status';
  return `${col} IN (${SIGN_IN_STATUSES.join(', ')})`;
}

/** 'active' | 'onboarding' | 'unverified' | 'deactivated' for a users.status value. */
function accountState(status) {
  const s = status === null || status === undefined ? USER_STATUS.ACTIVE : Number(status);
  if (s === USER_STATUS.ACTIVE) return 'active';
  if (s === USER_STATUS.ONBOARDING) return 'onboarding';
  if (s === USER_STATUS.UNVERIFIED) return 'unverified';
  return 'deactivated';
}

module.exports = { USER_STATUS, SIGN_IN_STATUSES, canSignInSql, accountState };
