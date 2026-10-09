/**
 * ProtectedRoute Component
 * Wraps routes that require authentication.
 * Redirects to /login if not authenticated.
 */

import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';

export default function ProtectedRoute({ children }) {
  const { isAuthenticated, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh' }}>
        <div className="skeleton" style={{ width: '200px', height: '20px' }}></div>
      </div>
    );
  }

  if (!isAuthenticated) {
    const returnPath = location.pathname + location.search;
    const loginUrl = returnPath && returnPath !== '/' ? `/login?redirect=${encodeURIComponent(returnPath)}` : '/login';
    return <Navigate to={loginUrl} replace />;
  }

  return children;
}
