/**
 * Rate Limiter Middleware
 * Applies rate limiting to all API endpoints, with stricter limits on auth endpoints.
 */

const rateLimit = require('express-rate-limit');

/**
 * General API rate limiter — 100 requests per 15 minutes.
 */
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 50000,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later.' },
});

/**
 * Auth-specific rate limiter
 */
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10000,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many authentication attempts, please try again later.' },
});

// ── Credential endpoints (docs/adr/0001) ────────────────────────────────────
// Festival venues often put hundreds of voters behind one Wi-Fi IP, so these limiters count
// FAILED attempts only (skipSuccessfulRequests) and key public voting per badge as well as per IP.

const credentialKey = (req) => String(req.body?.badge_number || '').trim().toLowerCase().slice(0, 64);

/** Public vote submit: failed attempts per client IP (stops enumeration from one source). */
const publicVoteIpLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 60,
  skipSuccessfulRequests: true,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many failed verification attempts from this network. Please wait a few minutes.' },
});

/** Public vote submit: failed attempts per badge (stops guessing the phone digits of one badge). */
const publicVoteBadgeLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 8,
  skipSuccessfulRequests: true,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => `badge:${req.params.token}:${credentialKey(req)}`,
  skip: (req) => !credentialKey(req),
  message: { error: 'Too many failed attempts for this badge. Please wait 15 minutes or ask a volunteer.' },
});

/** Public vote data fetch: generous per-IP cap (read-only, shared venue IPs). */
const publicVoteReadLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 600,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again shortly.' },
});

/** Staff credential lookups (gate scan, badge check): failed attempts per signed-in user. */
const staffCredentialLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: 100,
  skipSuccessfulRequests: true,
  // badge-check answers "not found" with 200 + res.locals.credentialMiss; count those as failures
  requestWasSuccessful: (req, res) => res.statusCode < 400 && !res.locals.credentialMiss,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => (req.user?.id ? `user:${req.user.id}` : `ip:${req.ip}`),
  message: { error: 'Too many unrecognised badges in a short time. Please wait a few minutes.' },
});

module.exports = {
  generalLimiter,
  authLimiter,
  publicVoteIpLimiter,
  publicVoteBadgeLimiter,
  publicVoteReadLimiter,
  staffCredentialLimiter,
};
