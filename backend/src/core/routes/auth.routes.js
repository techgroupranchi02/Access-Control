/**
 * Auth Routes
 * POST /api/auth/register
 * POST /api/auth/login
 * POST /api/auth/logout
 * GET  /api/auth/me
 */

const express = require('express');
const router = express.Router();
const authController = require('../controllers/auth.controller');
const { authenticate } = require('../middleware/auth.middleware');
const { authLimiter } = require('../middleware/rateLimiter.middleware');

// Public routes (rate limited)
router.post('/register', authLimiter, authController.register);
router.post('/login', authLimiter, authController.login);
router.post('/google', authLimiter, authController.googleLogin);
router.get('/google/redirect', authController.googleRedirect);
router.get('/google/callback', authController.googleCallback);

// Protected routes
router.post('/logout', authenticate, authController.logout);
router.get('/me', authenticate, authController.me);

/**
 * /api/v1/auth keeps only the Google OAuth callback: it is the redirect URI registered in the Google Cloud
 * console (GOOGLE_REDIRECT_URL). Every other /api/v1/auth alias was removed (API review A5, nginx logs
 * 24 Nov 2026: only this path is called).
 */
const v1Router = express.Router();
v1Router.get('/google/callback', authController.googleCallback);

module.exports = router;
module.exports.v1Router = v1Router;
