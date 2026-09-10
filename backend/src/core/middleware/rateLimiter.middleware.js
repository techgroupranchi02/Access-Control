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
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later.' },
});

/**
 * Auth-specific rate limiter — 20 requests per 15 minutes.
 * Stricter to prevent brute-force attacks.
 */
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many authentication attempts, please try again later.' },
});

module.exports = { generalLimiter, authLimiter };
