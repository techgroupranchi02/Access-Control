/**
 * LoginPage Component — Freecomers Festival Operating System
 * Unified Authentication supporting:
 * - Google Sign-In (Freecomers Admin & Festival Admin, Jury, Volunteer)
 * - Email & Password (Credentials matching next.autovertest.com & Platform Admins)
 */

import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';

const GOOGLE_CLIENT_ID =
  import.meta.env.VITE_GOOGLE_CLIENT_ID ||
  '1078451955198-d59jvrlqk7c4krt6o89paij67f5iga0b.apps.googleusercontent.com';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [isAccessDenied, setIsAccessDenied] = useState(false);
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const { login, loginWithGoogle } = useAuth();
  const navigate = useNavigate();
  const googleBtnContainerRef = useRef(null);

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

  // Initialize Google Identity Services
  useEffect(() => {
    let intervalId = null;

    const handleGoogleResponse = async (response) => {
      if (!response?.credential) {
        setError('No credential received from Google. Please try again.');
        return;
      }
      setError('');
      setIsAccessDenied(false);
      setGoogleLoading(true);

      try {
        await loginWithGoogle(response.credential);
        navigate(getPostLoginRedirect());
      } catch (err) {
        const status = err.response?.status;
        const msg = err.response?.data?.error || err.message || 'Google sign-in failed.';
        if (status === 403 || msg.includes('Access Denied')) {
          setIsAccessDenied(true);
        }
        setError(msg);
      } finally {
        setGoogleLoading(false);
      }
    };

    const setupGoogleBtn = () => {
      if (window.google?.accounts?.id && googleBtnContainerRef.current) {
        try {
          window.google.accounts.id.initialize({
            client_id: GOOGLE_CLIENT_ID,
            callback: handleGoogleResponse,
            auto_select: false,
            cancel_on_tap_outside: true,
          });

          // Clear any previous render
          googleBtnContainerRef.current.innerHTML = '';

          window.google.accounts.id.renderButton(googleBtnContainerRef.current, {
            theme: 'outline',
            size: 'large',
            width: googleBtnContainerRef.current.clientWidth || 376,
            text: 'continue_with',
            shape: 'rectangular',
            logo_alignment: 'center',
          });
          return true;
        } catch (e) {
          console.warn('[Google GIS] Setup error:', e);
        }
      }
      return false;
    };

    if (!setupGoogleBtn()) {
      intervalId = setInterval(() => {
        if (setupGoogleBtn()) {
          clearInterval(intervalId);
        }
      }, 350);
    }

    return () => {
      if (intervalId) clearInterval(intervalId);
    };
  }, [loginWithGoogle, navigate]);

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
      await login(email, password);
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

  return (
    <div
      style={{
        minHeight: '100vh',
        width: '100vw',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'var(--fc-surface, #f7f5f2)',
        fontFamily: 'var(--fc-font-family, "Figtree", sans-serif)',
        padding: '24px',
        boxSizing: 'border-box',
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '440px',
          backgroundColor: 'var(--fc-surface-card, #ffffff)',
          borderRadius: '16px',
          border: '1px solid var(--fc-border, #e8e2db)',
          boxShadow: 'var(--shadow-lg, 0 8px 30px rgba(0, 0, 0, 0.05))',
          padding: '40px 32px',
          boxSizing: 'border-box',
        }}
      >
        {/* Brand Header */}
        <div style={{ textAlign: 'center', marginBottom: '28px' }}>
          <div
            style={{
              fontSize: '1.85rem',
              fontWeight: 800,
              color: 'var(--fc-brand, #a82f2f)',
              letterSpacing: '-0.02em',
              lineHeight: 1.1,
            }}
          >
            freecomers
          </div>
          <div
            style={{
              fontSize: '0.625rem',
              fontWeight: 700,
              letterSpacing: '0.08em',
              color: 'var(--fc-text-muted, #8c827a)',
              marginTop: '5px',
              textTransform: 'uppercase',
            }}
          >
            FESTIVAL OPERATING SYSTEM
          </div>
          <p
            style={{
              fontSize: '0.85rem',
              color: 'var(--fc-text-secondary, #57534e)',
              marginTop: '12px',
              marginBottom: 0,
            }}
          >
            Sign in with your Freecomers festival team account
          </p>
        </div>

        {/* Error Alert */}
        {error && (
          <div
            id="login-error-alert"
            style={{
              backgroundColor: isAccessDenied ? '#fffbeb' : '#fef2f2',
              border: `1px solid ${isAccessDenied ? '#fcd34d' : '#fecaca'}`,
              color: isAccessDenied ? '#92400e' : '#991b1b',
              borderRadius: '8px',
              padding: '12px 14px',
              fontSize: '0.825rem',
              lineHeight: 1.45,
              display: 'flex',
              alignItems: 'flex-start',
              gap: '10px',
              marginBottom: '20px',
            }}
          >
            <span style={{ fontSize: '1rem', lineHeight: 1 }}>{isAccessDenied ? '🛡️' : '⚠️'}</span>
            <div style={{ flex: 1 }}>
              <strong style={{ display: 'block', marginBottom: '2px' }}>
                {isAccessDenied ? 'Role Restriction' : 'Authentication Error'}
              </strong>
              <span>{error}</span>
            </div>
          </div>
        )}

        {/* Google One-Click Sign-In */}
        <div style={{ marginBottom: '20px' }}>
          <div
            id="google-signin-btn-container"
            ref={googleBtnContainerRef}
            style={{
              minHeight: '44px',
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'center',
              width: '100%',
              opacity: googleLoading || loading ? 0.6 : 1,
              pointerEvents: googleLoading || loading ? 'none' : 'auto',
            }}
          />
          {googleLoading && (
            <div
              style={{
                textAlign: 'center',
                fontSize: '0.785rem',
                color: 'var(--fc-text-muted, #8c827a)',
                marginTop: '8px',
              }}
            >
              Verifying Google identity & festival roles...
            </div>
          )}
        </div>

        {/* Visual Divider */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            margin: '22px 0',
            gap: '12px',
          }}
        >
          <div style={{ flex: 1, height: '1px', backgroundColor: 'var(--fc-border, #e8e2db)' }} />
          <span
            style={{
              fontSize: '0.7rem',
              fontWeight: 700,
              color: 'var(--fc-text-muted, #8c827a)',
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
            }}
          >
            or sign in with email
          </span>
          <div style={{ flex: 1, height: '1px', backgroundColor: 'var(--fc-border, #e8e2db)' }} />
        </div>

        {/* Credentials Form */}
        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: '16px' }}>
            <label
              htmlFor="login-email"
              style={{
                display: 'block',
                fontSize: '0.75rem',
                fontWeight: 700,
                color: 'var(--fc-text-secondary, #57534e)',
                textTransform: 'uppercase',
                letterSpacing: '0.04em',
                marginBottom: '6px',
              }}
            >
              Email Address
            </label>
            <input
              id="login-email"
              type="email"
              placeholder="name@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
              style={{
                width: '100%',
                padding: '11px 12px',
                borderRadius: '8px',
                border: '1px solid var(--fc-border-strong, #bfb8ae)',
                fontFamily: 'inherit',
                fontSize: '0.875rem',
                backgroundColor: 'var(--fc-surface, #ffffff)',
                color: 'var(--fc-text-main, #1c1917)',
                boxSizing: 'border-box',
                outline: 'none',
              }}
            />
          </div>

          <div style={{ marginBottom: '22px' }}>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '6px',
              }}
            >
              <label
                htmlFor="login-password"
                style={{
                  fontSize: '0.75rem',
                  fontWeight: 700,
                  color: 'var(--fc-text-secondary, #57534e)',
                  textTransform: 'uppercase',
                  letterSpacing: '0.04em',
                }}
              >
                Password
              </label>
              <button
                type="button"
                id="toggle-password-btn"
                onClick={() => setShowPassword(!showPassword)}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--fc-text-muted, #8c827a)',
                  fontSize: '0.725rem',
                  cursor: 'pointer',
                  padding: 0,
                }}
              >
                {showPassword ? 'Hide 👁️' : 'Show 👁️'}
              </button>
            </div>
            <input
              id="login-password"
              type={showPassword ? 'text' : 'password'}
              placeholder="••••••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="current-password"
              style={{
                width: '100%',
                padding: '11px 12px',
                borderRadius: '8px',
                border: '1px solid var(--fc-border-strong, #bfb8ae)',
                fontFamily: 'inherit',
                fontSize: '0.875rem',
                backgroundColor: 'var(--fc-surface, #ffffff)',
                color: 'var(--fc-text-main, #1c1917)',
                boxSizing: 'border-box',
                outline: 'none',
              }}
            />
          </div>

          <button
            id="login-submit-btn"
            type="submit"
            disabled={loading || googleLoading}
            style={{
              width: '100%',
              backgroundColor: 'var(--fc-brand, #a82f2f)',
              color: '#ffffff',
              border: 'none',
              borderRadius: '8px',
              padding: '12px',
              fontFamily: 'inherit',
              fontSize: '0.875rem',
              fontWeight: 700,
              cursor: loading || googleLoading ? 'not-allowed' : 'pointer',
              transition: 'background-color 0.15s ease',
              opacity: loading || googleLoading ? 0.7 : 1,
            }}
          >
            {loading ? 'Authenticating...' : 'Sign In to Workbench →'}
          </button>
        </form>

        {/* Team Role Policy Notice */}
        <div
          style={{
            marginTop: '24px',
            paddingTop: '16px',
            borderTop: '1px solid var(--fc-border, #f0eae1)',
            textAlign: 'center',
            fontSize: '0.75rem',
            color: 'var(--fc-text-muted, #8c827a)',
            lineHeight: 1.5,
          }}
        >
          <span>
            Authorized for <strong>Festival Admins</strong>, <strong>Jury</strong>, and <strong>Volunteers</strong> using credentials from{' '}
            <a
              href="https://next.autovertest.com"
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: 'var(--fc-brand, #a82f2f)', textDecoration: 'none', fontWeight: 600 }}
            >
              Freecomers
            </a>
            .
          </span>
        </div>
      </div>
    </div>
  );
}
