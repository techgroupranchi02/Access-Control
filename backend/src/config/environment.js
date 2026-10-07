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
  jwtExpiresIn: '8h',

  // Google OAuth
  googleClientId: process.env.GOOGLE_CLIENT_ID || '1078451955198-c4u9hngm78im37rjdc4h89f6ivsce7ug.apps.googleusercontent.com',

  // Cookie
  cookieName: '__Host-access-token',
  cookieSecure: process.env.NODE_ENV === 'production',
  cookieSameSite: 'lax',
};

module.exports = env;
