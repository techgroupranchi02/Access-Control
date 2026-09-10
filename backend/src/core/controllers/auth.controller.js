/**
 * Auth Controller
 * Handles registration, login, logout, and profile endpoints.
 */

const authService = require('../services/auth.service');
const env = require('../../config/environment');

/**
 * POST /api/auth/register
 */
async function register(req, res) {
  try {
    const { name, email, password } = req.body;
    const user = await authService.register(name, email, password);
    res.status(201).json({ message: 'Registration successful.', user });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
}

/**
 * POST /api/auth/login
 */
async function login(req, res) {
  try {
    const { email, password } = req.body;
    const { token, user } = await authService.login(email, password);

    // Set JWT in HttpOnly cookie
    const isHttps = req.secure || req.headers['x-forwarded-proto'] === 'https';
    const cookieOptions = {
      httpOnly: true,
      secure: isHttps,
      sameSite: env.cookieSameSite,
      maxAge: 8 * 60 * 60 * 1000, // 8 hours
      path: '/',
    };

    const cookieName = isHttps ? env.cookieName : 'access-token';

    res.cookie(cookieName, token, cookieOptions);
    // Also set fallback cookie name if HTTPS for universal compatibility
    if (isHttps) {
      res.cookie('access-token', token, { ...cookieOptions, secure: true });
    }
    res.json({ message: 'Login successful.', user, token });
  } catch (error) {
    res.status(401).json({ error: error.message });
  }
}

/**
 * POST /api/auth/logout
 */
async function logout(req, res) {
  const cookieName = env.nodeEnv === 'production' ? env.cookieName : 'access-token';
  res.clearCookie(cookieName, { path: '/' });
  res.json({ message: 'Logged out successfully.' });
}

/**
 * GET /api/auth/me
 * Returns current user profile + permissions for the specified festival.
 */
async function me(req, res) {
  try {
    const eventId = req.headers['x-event-id'] || req.headers['x-edition-id'] || req.headers['x-festival-id'] || req.query.eventId || req.query.editionId || req.query.festivalId || null;
    const profile = await authService.getProfile(req.user.id, eventId);
    res.json(profile);
  } catch (error) {
    res.status(404).json({ error: error.message });
  }
}

module.exports = { register, login, logout, me };
