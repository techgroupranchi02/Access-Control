/**
 * Auth Controller
 * Handles registration, credential login, Google OAuth login, logout, and profile endpoints.
 */

const authService = require('../services/auth.service');
const env = require('../../config/environment');

/**
 * Helper to set auth cookies on response.
 * @param {object} req 
 * @param {object} res 
 * @param {string} token 
 */
function setAuthCookies(req, res, token) {
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
  if (isHttps) {
    res.cookie('access-token', token, { ...cookieOptions, secure: true });
  }
}

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
 * Standard Email & Password authentication.
 */
async function login(req, res) {
  try {
    const { email, password } = req.body;
    const { token, user } = await authService.login(email, password);

    setAuthCookies(req, res, token);
    res.json({ message: 'Login successful.', user, token });
  } catch (error) {
    const statusCode = error.statusCode || (error.message.includes('Access Denied') ? 403 : 401);
    res.status(statusCode).json({ error: error.message });
  }
}

/**
 * POST /api/auth/google
 * Google Sign-In verification via Google ID token.
 */
async function googleLogin(req, res) {
  try {
    const { credential, id_token } = req.body;
    const tokenToVerify = credential || id_token;

    if (!tokenToVerify) {
      return res.status(400).json({ error: 'Google credential / ID token is required.' });
    }

    const { token, user } = await authService.loginWithGoogle(tokenToVerify);

    setAuthCookies(req, res, token);
    res.json({ message: 'Google login successful.', user, token });
  } catch (error) {
    const statusCode = error.statusCode || (error.message.includes('Access Denied') ? 403 : 401);
    res.status(statusCode).json({ error: error.message });
  }
}

/**
 * POST /api/auth/logout
 */
async function logout(req, res) {
  const cookieName = env.nodeEnv === 'production' ? env.cookieName : 'access-token';
  res.clearCookie(cookieName, { path: '/' });
  res.clearCookie('access-token', { path: '/' });
  res.json({ message: 'Logged out successfully.' });
}

/**
 * GET /api/auth/me
 * Returns current user profile + permissions for the specified festival.
 */
async function me(req, res) {
  try {
    const eventId = req.headers['x-event-id'] || req.headers['x-edition-id'] || req.headers['x-festival-id'] || req.query.eventId || req.query.editionId || req.query.festivalId || null;
    const profile = await authService.getProfile(req.user.id, req.user.role, eventId);
    res.json(profile);
  } catch (error) {
    res.status(404).json({ error: error.message });
  }
}

/**
 * GET /api/auth/google/redirect
 * Initiates standard Google OAuth 2.0 Web redirect flow.
 */
async function googleRedirect(req, res) {
  const clientId = env.googleClientId;
  const redirectUri = env.googleRedirectUrl;

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: 'openid email profile',
    access_type: 'online',
    prompt: 'select_account',
  });

  return res.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`);
}

/**
 * GET /api/auth/google/callback
 * Handles Google OAuth callback, exchanges code for token, authenticates user, and redirects.
 */
async function googleCallback(req, res) {
  const frontendUrl = (env.frontendUrl || 'https://ffestiplus.autovertest.com').replace(/\/$/, '');
  const { code, error: oauthError } = req.query;

  if (oauthError || !code) {
    return res.redirect(`${frontendUrl}/login?error=${encodeURIComponent(oauthError || 'Google authentication was cancelled.')}`);
  }

  try {
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: env.googleClientId,
        client_secret: env.googleClientSecret,
        redirect_uri: env.googleRedirectUrl,
        grant_type: 'authorization_code',
      }).toString(),
    });

    const tokenData = await tokenRes.json();
    if (!tokenRes.ok || (!tokenData.id_token && !tokenData.access_token)) {
      throw new Error(tokenData.error_description || 'Failed to exchange authorization code with Google.');
    }

    let authResult;
    if (tokenData.id_token) {
      authResult = await authService.loginWithGoogle(tokenData.id_token);
    } else {
      const userRes = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
        headers: { Authorization: `Bearer ${tokenData.access_token}` },
      });
      const userData = await userRes.json();
      if (!userData.email) throw new Error('No verified email address returned by Google.');
      throw new Error('Google did not return an ID token.');
    }

    setAuthCookies(req, res, authResult.token);
    return res.redirect(`${frontendUrl}/login?token=${encodeURIComponent(authResult.token)}&status=success`);
  } catch (error) {
    console.error('[Google Callback Error]:', error.message);
    const msg = error.message || 'Google authentication failed.';
    return res.redirect(`${frontendUrl}/login?error=${encodeURIComponent(msg)}`);
  }
}

module.exports = { register, login, googleLogin, googleRedirect, googleCallback, logout, me };
