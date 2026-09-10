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
 * Middleware that requires a valid JWT in the cookie.
 * On success, attaches req.user = { id, email, name }.
 */
function authenticate(req, res, next) {
  try {
    // Read token from HttpOnly cookie or Authorization header
    const cookieName = env.nodeEnv === 'production' ? env.cookieName : 'access-token';
    let token = req.cookies && (req.cookies[cookieName] || req.cookies['access-token']);
    if (!token && req.headers.authorization && req.headers.authorization.startsWith('Bearer ')) {
      token = req.headers.authorization.split(' ')[1];
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
    req.user = {
      id: decoded.id,
      email: decoded.email,
      name: decoded.name,
    };

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
    const cookieName = env.nodeEnv === 'production' ? env.cookieName : 'access-token';
    let token = req.cookies && (req.cookies[cookieName] || req.cookies['access-token']);
    if (!token && req.headers.authorization && req.headers.authorization.startsWith('Bearer ')) {
      token = req.headers.authorization.split(' ')[1];
    }
    if (token) {
      const decoded = jwt.verify(token, env.jwtSecret, { algorithms: ['HS256'] });
      req.user = { id: decoded.id, email: decoded.email, name: decoded.name };
    }
  } catch {
    // Silently ignore — user remains unauthenticated
  }
  next();
}

module.exports = { authenticate, optionalAuth };
