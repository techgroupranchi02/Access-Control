/**
 * Login Page
 * Ultra-premium glassmorphism design with interactive persona switcher,
 * custom icons, dark theme autofill support, and smooth micro-animations.
 */

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';

const DEMO_PERSONAS = [
  {
    key: 'admin',
    email: 'admin@demo.com',
    role: 'Admin',
    icon: '👑',
    scopeBadge: 'Full Access',
    badgeClass: 'scope-admin',
    desc: 'Unrestricted full CRUD access across all modules.',
  },
  {
    key: 'lead',
    email: 'lead@demo.com',
    role: 'Group Lead',
    icon: '💼',
    scopeBadge: 'Dept Lead',
    badgeClass: 'scope-lead',
    desc: 'Management and workforce operational tasks.',
  },
  {
    key: 'reviewer',
    email: 'reviewer@demo.com',
    role: 'Reviewer',
    icon: '✍️',
    scopeBadge: 'Reviewer',
    badgeClass: 'scope-reviewer',
    desc: 'Evaluate and manage festival submissions.',
  },
  {
    key: 'jury',
    email: 'jury@demo.com',
    role: 'Jury',
    icon: '⚖️',
    scopeBadge: 'Jury Member',
    badgeClass: 'scope-jury',
    desc: 'Jury panel evaluations and scoring.',
  },
  {
    key: 'volunteer',
    email: 'viewer@demo.com',
    role: 'Volunteer',
    icon: '🤝',
    scopeBadge: 'Operations',
    badgeClass: 'scope-volunteer',
    desc: 'Access to festival calendar & task checklist.',
  },
];

export default function LoginPage() {
  const [email, setEmail] = useState('admin@demo.com');
  const [password, setPassword] = useState('Demo@12345');
  const [selectedPersona, setSelectedPersona] = useState('admin');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  const handleSelectPersona = (persona) => {
    setSelectedPersona(persona.key);
    setEmail(persona.email);
    setPassword('Demo@12345');
    setError('');
  };

  const handleSubmit = async (e) => {
    if (e) e.preventDefault();
    setError('');
    setLoading(true);

    try {
      await login(email, password);
      navigate('/dashboard');
    } catch (err) {
      setError(err.response?.data?.error || 'Login failed. Please verify credentials.');
    } finally {
      setLoading(false);
    }
  };

  const currentPersona = DEMO_PERSONAS.find(p => p.key === selectedPersona);

  return (
    <div className="login-page">
      <div className="login-card">
        {/* Brand Header */}
        <div className="login-logo">
          <div className="login-logo-icon">🔐</div>
          <span className="login-logo-text">Access Control</span>
        </div>
        <p className="login-subtitle">
          Declarative Access & Module Control System
        </p>

        {error && (
          <div className="alert alert-error" style={{ marginBottom: '1.25rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span>⚠️</span>
            <span>{error}</span>
          </div>
        )}

        {/* Credentials Form */}
        <form onSubmit={handleSubmit}>
          <div className="form-group" style={{ marginBottom: '1.1rem' }}>
            <label className="form-label" htmlFor="login-email">Email Address</label>
            <div className="input-with-icon">
              <span className="input-icon">✉️</span>
              <input
                id="login-email"
                className="login-input"
                type="email"
                placeholder="name@example.com"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  setSelectedPersona(null);
                }}
                required
                autoComplete="email"
              />
            </div>
          </div>

          <div className="form-group" style={{ marginBottom: '1.25rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-xs)' }}>
              <label className="form-label" htmlFor="login-password" style={{ marginBottom: 0 }}>Password</label>
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--text-muted)',
                  fontSize: '0.75rem',
                  cursor: 'pointer',
                  padding: 0,
                }}
              >
                {showPassword ? 'Hide 👁️' : 'Show 👁️'}
              </button>
            </div>
            <div className="input-with-icon">
              <span className="input-icon">🔒</span>
              <input
                id="login-password"
                className="login-input"
                type={showPassword ? 'text' : 'password'}
                placeholder="••••••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="current-password"
              />
            </div>
          </div>

          <button
            type="submit"
            className="btn-login-submit"
            disabled={loading}
          >
            {loading ? '⏳ Authenticating...' : '🚀 Sign In'}
          </button>
        </form>

        {/* Interactive Persona Picker */}
        <div className="persona-divider">
          <span>Quick Demo Personas</span>
        </div>

        <div className="persona-grid">
          {DEMO_PERSONAS.map(p => {
            const isSelected = selectedPersona === p.key;
            return (
              <div
                key={p.key}
                className={`persona-chip ${isSelected ? 'active' : ''}`}
                onClick={() => handleSelectPersona(p)}
                title={p.desc}
              >
                <span className="persona-chip-icon">{p.icon}</span>
                <span className="persona-chip-name">{p.role}</span>
                <span className={`persona-chip-scope ${p.badgeClass}`}>
                  {p.scopeBadge}
                </span>
              </div>
            );
          })}
        </div>

        {/* Selected Persona Detail Banner */}
        {currentPersona && (
          <div className="persona-detail-card">
            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
              <span style={{ fontSize: '0.725rem', color: '#94a3b8' }}>
                {currentPersona.desc}
              </span>
              <span className="persona-detail-email">{currentPersona.email}</span>
            </div>
            <button
              type="button"
              className="btn btn-sm btn-primary"
              style={{ padding: '0.35rem 0.75rem', fontSize: '0.75rem', whiteSpace: 'nowrap' }}
              onClick={handleSubmit}
              disabled={loading}
            >
              Log In &rarr;
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
