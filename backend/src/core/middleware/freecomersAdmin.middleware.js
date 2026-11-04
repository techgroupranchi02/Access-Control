/**
 * Freecomers Admin Middleware
 *
 * Guards the SaaS console routes (/api/admin/saas/*) used by the Freecomers
 * admin panel (admin.freecomers.com / admin.autovertest.com).
 *
 * The admin panel authenticates against the Freecomers Laravel backend and holds
 * a Laravel `admin`-guard JWT. This middleware delegates validation of that token
 * to Laravel (`GET /api/v1/admin/verify-token`), so no secret is shared and a
 * logout / disabled admin on Laravel takes effect here too. See docs/adr/0002.
 *
 * Fail-closed: any missing token, non-200 response or network error denies access.
 */

const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const env = require('../../config/environment');

const CACHE_TTL_MS = 60 * 1000;
const CACHE_MAX_ENTRIES = 500;
const VERIFY_TIMEOUT_MS = 5000;

// sha256(token) -> { expiresAt, adminId }
const verifiedTokens = new Map();

function cacheKey(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function getCached(key) {
  const entry = verifiedTokens.get(key);
  if (!entry) return null;
  if (entry.expiresAt <= Date.now()) {
    verifiedTokens.delete(key);
    return null;
  }
  return entry;
}

function setCached(key, adminId) {
  if (verifiedTokens.size >= CACHE_MAX_ENTRIES) {
    // Drop the oldest entry (Map preserves insertion order)
    verifiedTokens.delete(verifiedTokens.keys().next().value);
  }
  verifiedTokens.set(key, { expiresAt: Date.now() + CACHE_TTL_MS, adminId });
}

async function verifyWithLaravel(token) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), VERIFY_TIMEOUT_MS);
  try {
    const res = await fetch(`${env.freecomersAdminApiUrl}/api/v1/admin/verify-token`, {
      method: 'GET',
      headers: { Accept: 'application/json', Authorization: `Bearer ${token}` },
      signal: controller.signal,
    });
    if (!res.ok) return false;
    const body = await res.json().catch(() => ({}));
    return body.token_valid === true;
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Requires a valid Freecomers (Laravel) admin JWT as `Authorization: Bearer <token>`.
 * On success attaches req.freecomersAdmin = { id } (Laravel `sub` claim, may be null).
 */
async function requireFreecomersAdmin(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
  if (!token) {
    return res.status(401).json({ error: 'Freecomers admin authentication required.' });
  }

  const key = cacheKey(token);
  let entry = getCached(key);

  if (!entry) {
    try {
      const valid = await verifyWithLaravel(token);
      if (!valid) {
        return res.status(401).json({ error: 'Invalid or expired Freecomers admin session.' });
      }
    } catch (err) {
      console.error('[FreecomersAdmin] Token verification failed:', err.message);
      return res.status(503).json({ error: 'Unable to verify admin session. Please try again.' });
    }

    // Token already validated by Laravel; decode only to read the admin id.
    const decoded = jwt.decode(token);
    const adminId = decoded && decoded.sub != null ? parseInt(decoded.sub, 10) || null : null;
    setCached(key, adminId);
    entry = { adminId };
  }

  req.freecomersAdmin = { id: entry.adminId };
  return next();
}

module.exports = { requireFreecomersAdmin };
