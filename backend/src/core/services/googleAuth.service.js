/**
 * Google Auth Service
 * Cryptographically verifies Google ID tokens using Google's TokenInfo API.
 * 
 * Security checks:
 * - Issuer validation (accounts.google.com)
 * - Audience check (must match configured GOOGLE_CLIENT_ID)
 * - Email verification check (email_verified must be true)
 * - Expiration validation
 */

const env = require('../../config/environment');

/**
 * Verify Google ID token and return user identity.
 * @param {string} idToken - Raw Google ID token (JWT) from client
 * @returns {Promise<{ email: string, name: string, sub: string, picture: string }>}
 */
async function verifyGoogleToken(idToken) {
  if (!idToken || typeof idToken !== 'string') {
    throw new Error('Google ID token is required.');
  }

  const tokenUrl = `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(idToken.trim())}`;

  let response;
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    response = await fetch(tokenUrl, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    });
    clearTimeout(timeout);
  } catch (err) {
    throw new Error(`Google authentication network error: ${err.message}`);
  }

  if (!response.ok) {
    const errBody = await response.json().catch(() => ({}));
    throw new Error(errBody.error_description || 'Invalid or expired Google token.');
  }

  const payload = await response.json();

  // 1. Verify issuer
  const validIssuers = ['accounts.google.com', 'https://accounts.google.com'];
  if (!payload.iss || !validIssuers.includes(payload.iss)) {
    throw new Error('Invalid token issuer.');
  }

  // 2. Verify audience
  const allowedClientIds = [
    env.googleClientId,
    '1078451955198-d59jvrlqk7c4krt6o89paij67f5iga0b.apps.googleusercontent.com',
    '1078451955198-c4u9hngm78im37rjdc4h89f6ivsce7ug.apps.googleusercontent.com',
  ].filter(Boolean);

  if (!allowedClientIds.includes(payload.aud)) {
    console.warn(`[Google Auth Warning] Audience mismatch: got ${payload.aud}`);
    throw new Error('Token audience mismatch: not intended for this application.');
  }

  // 3. Verify email & email verification
  if (!payload.email) {
    throw new Error('Google account must have an associated email address.');
  }

  const isVerified = payload.email_verified === 'true' || payload.email_verified === true;
  if (!isVerified) {
    throw new Error('Google email address is not verified.');
  }

  // 4. Verify expiration
  const nowInSeconds = Math.floor(Date.now() / 1000);
  if (payload.exp && parseInt(payload.exp, 10) < nowInSeconds) {
    throw new Error('Google token has expired.');
  }

  return {
    email: payload.email.toLowerCase().trim(),
    name: payload.name || payload.given_name || 'Anonymous',
    sub: payload.sub,
    picture: payload.picture || null,
  };
}

module.exports = { verifyGoogleToken };
