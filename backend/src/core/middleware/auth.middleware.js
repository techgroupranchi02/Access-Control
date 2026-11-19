/**
 * Auth Middleware
 * Verifies JWT from HttpOnly cookie. Attaches req.user on success.
 * 
 * Security:
 * - Rejects 'none' algorithm
 * - Hardcoded algorithm for verification (HS256)
 * - Validates 'exp' claim
 * - Fail-closed: denies access on any verification failure
 */

const jwt = require('jsonwebtoken');
const env = require('../../config/environment');

/**
 * req.user from a verified token. `id` is always a `users` table id, or null.
 *
 * Freecomers admin tokens (Launch Festival Portal and the admins-table logins; the only ones with role 'admin' +
 * isSuperAdmin) carry the `admins` table id, which is a different table: users.id 1 is a real person
 * (2026-11-19: the admin was shown as "SHASHANK" and recorded as him). For those, id is null and the admin id
 * is `adminId`; see docs/adr/0007-freecomers-admin-identity.md and utils/actor.js.
 */
function toRequestUser(decoded) {
  const role = decoded.role || (decoded.isSuperAdmin ? 'admin' : 'user');
  const isFreecomersAdmin = role === 'admin' && Boolean(decoded.isSuperAdmin);
  return {
    id: isFreecomersAdmin ? null : decoded.id,
    email: decoded.email,
    name: decoded.name,
    userIds: isFreecomersAdmin ? [] : (decoded.userIds || [decoded.id]),
    role,
    isSuperAdmin: Boolean(decoded.isSuperAdmin),
    isFreecomersAdmin,
    adminId: isFreecomersAdmin ? decoded.id : null,
    targetFestivalId: decoded.targetFestivalId || null,
  };
}

/**
 * Middleware that requires a valid JWT in the cookie.
 * On success, attaches req.user = { id, email, name }.
 */
function authenticate(req, res, next) {
  try {
    // Read token: prioritize Authorization: Bearer <token> over cookies to avoid stale cookie override on SSO
    let token = null;
    let isBearer = false;
    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer ')) {
      token = req.headers.authorization.split(' ')[1];
      isBearer = true;
    } else if (req.cookies) {
      const cookieName = env.nodeEnv === 'production' ? env.cookieName : 'access-token';
      token = req.cookies[cookieName] || req.cookies['access-token'];
    }

    if (!token) {
      return res.status(401).json({ error: 'Authentication required. Please log in.' });
    }

    // Verify with hardcoded algorithm — never derive from token header
    const decoded = jwt.verify(token, env.jwtSecret, {
      algorithms: ['HS256'],
    });

    // Reject if no exp claim (defense in depth)
    if (!decoded.exp) {
      return res.status(401).json({ error: 'Invalid token: missing expiration.' });
    }

    // Attach user info to request
    req.user = toRequestUser(decoded);
    if (isBearer) {
      req.bearerToken = token;
    }

    next();
  } catch (error) {
    // Fail-closed: deny access on any error
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Session expired. Please log in again.' });
    }
    return res.status(401).json({ error: 'Invalid authentication token.' });
  }
}

/**
 * Optional auth — attaches req.user if token present, but doesn't block.
 */
function optionalAuth(req, res, next) {
  try {
    let token = null;
    let isBearer = false;
    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer ')) {
      token = req.headers.authorization.split(' ')[1];
      isBearer = true;
    } else if (req.cookies) {
      const cookieName = env.nodeEnv === 'production' ? env.cookieName : 'access-token';
      token = req.cookies[cookieName] || req.cookies['access-token'];
    }
    if (token) {
      const decoded = jwt.verify(token, env.jwtSecret, { algorithms: ['HS256'] });
      req.user = toRequestUser(decoded);
      if (isBearer) {
        req.bearerToken = token;
      }
    }
  } catch {
    // Silently ignore — user remains unauthenticated
  }
  next();
}

module.exports = { authenticate, optionalAuth };
