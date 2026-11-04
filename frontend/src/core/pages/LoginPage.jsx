/**
 * LoginPage Component — ffesti Plus Festival Operating System
 * Enterprise 2-Column Split Layout for Festival Operations & Unified Authentication
 */

import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { useTheme } from '../context/ThemeContext';

import { LightModeIcon, DarkModeIcon, ShieldIcon, WarningIcon } from '../components/common/Icons';
const GOOGLE_CLIENT_ID =
  import.meta.env.VITE_GOOGLE_CLIENT_ID ||
  '1078451955198-d59jvrlqk7c4krt6o89paij67f5iga0b.apps.googleusercontent.com';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [keepSignedIn, setKeepSignedIn] = useState(true);
  const [error, setError] = useState('');
  const [isAccessDenied, setIsAccessDenied] = useState(false);
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [googleUser, setGoogleUser] = useState(() => {
    try {
      const saved = localStorage.getItem('fc_last_google_user');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed?.email && parsed?.name) return parsed;
      }
    } catch {
      // ignore
    }
    return null;
  });
  const { login, loginWithToken, loginWithGoogle } = useAuth();
  const { toggleTheme, isDark } = useTheme();
  const navigate = useNavigate();

  const getPostLoginRedirect = () => {
    try {
      const urlParams = new URLSearchParams(window.location.search);
      const redirect = urlParams.get('redirect');
      if (redirect && redirect.startsWith('/')) {
        return redirect;
      }
      const festivalParam = urlParams.get('festival') || urlParams.get('edition');
      if (festivalParam) {
        return `/dashboard?festival=${festivalParam}`;
      }
    } catch (e) {
      console.warn('Failed to parse redirect param', e);
    }
    return '/';
  };

  // Handle URL tokens or errors returned by Google OAuth redirect callback
  useEffect(() => {
    try {
      const urlParams = new URLSearchParams(window.location.search);
      const token = urlParams.get('token') || urlParams.get('google-token');
      const err = urlParams.get('error');

      if (err) {
        const decodedErr = decodeURIComponent(err);
        setError(decodedErr);
        if (decodedErr.includes('Access Denied')) {
          setIsAccessDenied(true);
        }
      }

      if (token) {
        setGoogleLoading(true);
        loginWithToken(token)
          .then((userProfile) => {
            if (userProfile?.email) {
              const userObj = {
                name: userProfile.name || userProfile.email.split('@')[0],
                email: userProfile.email,
                initial: (userProfile.name || userProfile.email).charAt(0).toUpperCase(),
              };
              setGoogleUser(userObj);
              localStorage.setItem('fc_last_google_user', JSON.stringify(userObj));
            }
            navigate(getPostLoginRedirect());
          })
          .catch((e) => {
            setError(e.message || 'Authentication failed.');
          })
          .finally(() => {
            setGoogleLoading(false);
          });
      }
    } catch (e) {
      console.warn('Failed to parse OAuth callback parameters', e);
    }
  }, [loginWithToken, navigate]);

  const handleGoogleClick = () => {
    if (googleLoading || loading) return;
    setError('');
    setIsAccessDenied(false);
    setGoogleLoading(true);
    // Direct browser to backend OAuth redirect flow using authorized callback URI
    window.location.href = `/api/auth/google/redirect${keepSignedIn ? '?remember=1' : ''}`;
  };

  const handleSubmit = async (e) => {
    if (e) e.preventDefault();
    if (!email || !password) {
      setError('Please enter both email and password.');
      return;
    }
    setError('');
    setIsAccessDenied(false);
    setLoading(true);

    try {
      const loginRes = await login(email, password, keepSignedIn);
      if (email) {
        const userObj = {
          name: loginRes?.user?.name?.split(' ')[0] || email.split('@')[0],
          email: loginRes?.user?.email || email,
          initial: (loginRes?.user?.name || email).charAt(0).toUpperCase(),
        };
        localStorage.setItem('fc_last_google_user', JSON.stringify(userObj));
      }
      navigate(getPostLoginRedirect());
    } catch (err) {
      const status = err.response?.status;
      const msg = err.response?.data?.error || err.message || 'Login failed. Please check your credentials.';
      if (status === 403 || msg.includes('Access Denied')) {
        setIsAccessDenied(true);
      }
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = (e) => {
    e.preventDefault();
    alert(
      'To recover or reset your festival workbench credentials, please contact your Festival Administrator or ffesti Plus Operations Support at support@ffesti.com'
    );
  };

  return (
    <div className="fc-login-centered-page">
      {/* Ambient Radial Cinema Glow */}
      <div className="fc-login-ambient-glow" />

      {/* Floating Theme Switcher */}
      <button
        type="button"
        id="login-theme-toggle"
        className="fc-login-theme-toggle"
        onClick={toggleTheme}
        title={isDark ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
        aria-label="Toggle theme mode"
      >
        <span style={{ display: 'inline-flex' }}>{isDark ? <LightModeIcon size={18} /> : <DarkModeIcon size={18} />}</span>
        <span>{isDark ? 'Light' : 'Dark'}</span>
      </button>

      {/* Centered Cinema Console Card */}
      <div className="fc-console-card">
        {/* Main Title */}
        <h1 className="fc-console-title">Sign In</h1>

        {/* Error Alert */}
        {error && (
          <div
            id="login-error-alert"
            className={`fc-login-alert ${isAccessDenied ? 'warning' : 'error'}`}
            role="alert"
          >
            <span style={{ fontSize: '1.1rem', lineHeight: 1 }}>
              {isAccessDenied ? <ShieldIcon size={20} /> : <WarningIcon size={20} />}
            </span>
            <div style={{ flex: 1 }}>
              <strong style={{ display: 'block', marginBottom: '2px' }}>
                {isAccessDenied ? 'Role Restriction' : 'Authentication Error'}
              </strong>
              <span>{error}</span>
            </div>
          </div>
        )}

        {/* Custom Branded Google Sign-In */}
        <div className="fc-login-google-wrapper">
          <div
            id="custom-google-signin-btn"
            className="fc-custom-google-btn"
            onClick={handleGoogleClick}
            role="button"
            tabIndex={0}
            style={{
              opacity: googleLoading || loading ? 0.6 : 1,
              pointerEvents: googleLoading || loading ? 'none' : 'auto',
              padding: '12px 28px 12px 20px',
              borderRadius: '16px',
              minHeight: '60px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              boxSizing: 'border-box',
              gap: '16px',
            }}
          >
            {/* Left Side: Avatar and Account info */}
            <div
              className="fc-google-btn-left"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                minWidth: 0,
                flex: 1,
              }}
            >
              {googleUser ? (
                <>
                  <div className="fc-google-avatar-badge" style={{ flexShrink: 0 }}>
                    <span>{googleUser.initial}</span>
                  </div>
                  <div className="fc-google-account-text" style={{ minWidth: 0, overflow: 'hidden' }}>
                    <span className="fc-google-account-name" style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>Continue as {googleUser.name}</span>
                    <span className="fc-google-account-email" style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{googleUser.email}</span>
                  </div>
                </>
              ) : (
                <>
                  <div className="fc-google-avatar-badge" style={{ flexShrink: 0 }}>
                    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                      <circle cx="12" cy="7" r="4" />
                    </svg>
                  </div>
                  <div className="fc-google-account-text" style={{ minWidth: 0, overflow: 'hidden' }}>
                    <span className="fc-google-account-name" style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>Continue with Google</span>
                    <span className="fc-google-account-email" style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>Use your Google Account</span>
                  </div>
                </>
              )}
            </div>

            {/* Right Side: Clean 4-color Google G icon with generous right margin */}
            <div
              className="fc-google-g-logo"
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
                marginRight: '8px',
                marginLeft: '12px',
              }}
            >
              <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
              </svg>
            </div>
          </div>

          {googleUser && (
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '6px' }}>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  localStorage.removeItem('fc_last_google_user');
                  setGoogleUser(null);
                }}
                style={{
                  background: 'transparent',
                  border: 'none',
                  padding: '2px 4px',
                  color: 'var(--fc-text-muted, #8c827a)',
                  fontSize: '0.74rem',
                  cursor: 'pointer',
                  textDecoration: 'underline'
                }}
              >
                Use a different account
              </button>
            </div>
          )}

          {googleLoading && (
            <div className="fc-google-loading-note">
              Verifying Google identity & festival roles...
            </div>
          )}
        </div>

        {/* Visual Divider */}
        <div className="fc-login-divider">
          <div className="fc-login-divider-line" />
          <span className="fc-login-divider-text">Or sign in with email</span>
          <div className="fc-login-divider-line" />
        </div>

        {/* Credentials Form */}
        <form onSubmit={handleSubmit}>
          <div className="fc-login-form-group">
            <div className="fc-login-label-row">
              <label htmlFor="login-email" className="fc-login-label">
                EMAIL ADDRESS
              </label>
            </div>
            <div className="fc-input-wrapper">
              <span className="fc-input-icon">
                <svg
                  width="17"
                  height="17"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <rect x="2" y="4" width="20" height="16" rx="2" />
                  <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
                </svg>
              </span>
              <input
                id="login-email"
                type="email"
                className="fc-login-input with-icon"
                placeholder="freecomersfilmworks@gmail.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
              />
            </div>
          </div>

          <div className="fc-login-form-group">
            <div className="fc-login-label-row">
              <label htmlFor="login-password" className="fc-login-label">
                PASSWORD
              </label>
            </div>
            <div className="fc-input-wrapper">
              <span className="fc-input-icon">
                <svg
                  width="17"
                  height="17"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M21 2l-2 2m-1.5 1.5L14 9l-1.5-1.5-2.5 2.5 1.5 1.5-1.5 1.5-2-2-4 4a4 4 0 1 0 5.66 5.66l4-4-2-2 1.5-1.5 1.5 1.5 2.5-2.5-1.5-1.5 3.5-3.5 2 2" />
                </svg>
              </span>
              <input
                id="login-password"
                type={showPassword ? 'text' : 'password'}
                className="fc-login-input with-icon"
                placeholder="••••••••••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="current-password"
              />
              <button
                type="button"
                id="toggle-password-btn"
                className="fc-pwd-toggle-btn"
                onClick={() => setShowPassword(!showPassword)}
                title={showPassword ? 'Hide password' : 'Show password'}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? (
                  <svg
                    width="18"
                    height="18"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                    <line x1="1" y1="1" x2="23" y2="23" />
                  </svg>
                ) : (
                  <svg
                    width="18"
                    height="18"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                    <circle cx="12" cy="12" r="3" />
                  </svg>
                )}
              </button>
            </div>
          </div>

          {/* Remember me: 30-day session instead of 24 hours */}
          <div className="fc-options-row">
            <label className="fc-checkbox-label">
              <input
                type="checkbox"
                checked={keepSignedIn}
                onChange={(e) => setKeepSignedIn(e.target.checked)}
                className="fc-checkbox"
              />
              <span>Remember me</span>
            </label>
          </div>

          {/* Primary Submit Action */}
          <button
            id="login-submit-btn"
            type="submit"
            disabled={loading || googleLoading}
            className="fc-console-submit-btn"
          >
            {loading ? 'Authenticating...' : 'Sign In'}
          </button>
        </form>
      </div>
    </div>
  );
}
