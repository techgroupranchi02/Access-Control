/**
 * Environment Configuration
 * Loads environment variables and provides secure secret resolution.
 * 
 * Secret resolution order: env var → local file → ephemeral random (with warning)
 */

const dotenv = require('dotenv');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

/**
 * Resolves a secret value using a multi-tiered fallback strategy.
 * 1. Environment variable
 * 2. Local file (e.g., jwt_secret.txt)
 * 3. Ephemeral random value + severe warning
 * 
 * @param {string} envKey - Environment variable name
 * @param {string} fileName - Local file name for fallback
 * @returns {string} The resolved secret
 */
function resolveSecret(envKey, fileName) {
  // Tier 1: Environment variable
  if (process.env[envKey]) {
    return process.env[envKey];
  }

  // Tier 2: Local file
  const filePath = path.resolve(__dirname, '../../', fileName);
  if (fs.existsSync(filePath)) {
    return fs.readFileSync(filePath, 'utf-8').trim();
  }

  // Tier 3: Ephemeral random value
  console.warn(
    `[SECURITY WARNING] ${envKey} not set. Generating ephemeral secret. ` +
    `This instance is isolated and sessions will not survive restarts. ` +
    `Set ${envKey} in .env for production!`
  );
  return crypto.randomBytes(32).toString('hex');
}

const FREECOMERS_API_URL = (
  process.env.FREECOMERS_API_URL ||
  ((process.env.FRONTEND_URL || '').includes('autovertest.com')
    ? 'https://api.autovertest.com'
    : 'https://api.freecomers.com')
).replace(/\/$/, '');

const env = {
  // Application
  nodeEnv: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.APP_PORT, 10) || 4000,
  frontendUrl: process.env.FRONTEND_URL || 'http://localhost:5173',

  // Database
  db: {
    host: process.env.DB_HOST || '127.0.0.1',
    port: parseInt(process.env.DB_PORT, 10) || 3306,
    database: process.env.DB_DATABASE || 'access_control_database',
    user: process.env.DB_USERNAME || 'root',
    // TODO(security): Create a dedicated DB user with restricted permissions for production.
    // Using root is acceptable only for development.
    password: process.env.DB_PASSWORD || '',
  },

  // JWT
  jwtSecret: resolveSecret('JWT_SECRET_KEY', 'jwt_secret.txt'),
  jwtExpiresIn: '24h',
  // Lifetime when the user ticks "Remember me" on the login page
  jwtRememberExpiresIn: '30d',

  // Google OAuth
  googleClientId: process.env.GOOGLE_CLIENT_ID || '',
  googleClientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
  googleRedirectUrl: process.env.GOOGLE_REDIRECT_URL || 'https://apiffestiplus.freecomers.com/api/v1/auth/google/callback',

  // Cookie
  cookieName: '__Host-access-token',
  cookieSecure: process.env.NODE_ENV === 'production',
  cookieSameSite: 'lax',

  // Freecomers Laravel API for this environment: media URLs, login fallback, admin-panel JWT
  // verification (docs/adr/0002). Set FREECOMERS_API_URL; otherwise it follows the environment
  // family of FRONTEND_URL (autovertest = dev/staging, anything else = production).
  freecomersApiUrl: FREECOMERS_API_URL,
  freecomersAdminApiUrl: process.env.FREECOMERS_ADMIN_API_URL
    ? process.env.FREECOMERS_ADMIN_API_URL.replace(/\/$/, '')
    : FREECOMERS_API_URL,

  // Kashish External Votes API
  // No fallback: the key must come from .env (the old fallback was published in Kashish's docs)
  kashishApiKey: process.env.KASHISH_API_KEY || '',
  kashishApiUrl: process.env.KASHISH_API_URL || 'https://kashish-admin.vercel.app/api/v1/votes',
};

module.exports = env;
