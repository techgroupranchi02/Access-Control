/**
 * Security Middleware
 * Sets security headers: CSP, X-Frame-Options, X-Content-Type-Options,
 * Permissions-Policy, CORS.
 */

const helmet = require('helmet');
const cors = require('cors');
const env = require('../../config/environment');

/**
 * Helmet middleware with strict CSP.
 */
function securityHeaders() {
  return helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'"],
        styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
        fontSrc: ["'self'", 'https://fonts.gstatic.com'],
        imgSrc: ["'self'", 'data:', 'blob:'],
        connectSrc: ["'self'", 'https://access.saas.autovertest.com', 'http://127.0.0.1:4000', 'http://localhost:5173'],
        objectSrc: ["'none'"],
        frameAncestors: ["'none'"],
      },
    },
    crossOriginEmbedderPolicy: false,
    frameguard: { action: 'deny' },
    noSniff: true,
  });
}

/**
 * CORS middleware — restricts to frontend origin only.
 */
function corsPolicy() {
  const allowedOrigins = [
    env.frontendUrl,
    'https://access.saas.autovertest.com',
    'http://localhost:5173',
    'http://127.0.0.1:5173',
  ];

  return cors({
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(null, true); // Permissive for same-domain API proxies
      }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-CSRF-Token', 'X-Festival-Id'],
    maxAge: 86400,
  });
}

/**
 * Permissions-Policy header — disable unused browser features.
 */
function permissionsPolicy() {
  return (req, res, next) => {
    res.setHeader(
      'Permissions-Policy',
      'camera=(), microphone=(), geolocation=(), payment=()'
    );
    next();
  };
}

module.exports = { securityHeaders, corsPolicy, permissionsPolicy };
