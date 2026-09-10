/**
 * Layout Component
 * App shell with sidebar, header, and main content area.
 */

import { Outlet, useLocation } from 'react-router-dom';
import Sidebar from './Sidebar';
import { useFestivalConfig } from '../hooks/useFestivalConfig';

const PAGE_TITLES = {
  '/dashboard': 'Dashboard',
  '/submission': 'Submissions',
  '/team': 'Team Management',
  '/jury': 'Jury Panel',
  '/custom-a': 'Custom A',
  '/admin': 'Admin Panel',
};

export default function Layout() {
  const location = useLocation();
  const { currentFestival } = useFestivalConfig();

  const pageTitle = PAGE_TITLES[location.pathname] || 'Access Control';

  return (
    <div className="app-layout">
      <Sidebar />
      <div className="app-main">
        <header className="app-header">
          <h1 className="header-title">{pageTitle}</h1>
          {currentFestival && (
            <span className="header-subtitle">
              {currentFestival.name}
            </span>
          )}
        </header>
        <main className="app-content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
