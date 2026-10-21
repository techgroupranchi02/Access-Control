/**
 * Layout Component
 * Renders the Freecomers workbench shell:
 * - Persistent left sidebar
 * - Main viewport with warm ivory surface (#f7f5f2)
 */

import React from 'react';
import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';
import { useFestivalConfig } from '../hooks/useFestivalConfig';

export default function Layout() {
  const { currentFestival } = useFestivalConfig();

  return (
    <div className="fc-app-layout">
      <Sidebar />
      <main className="fc-main-viewport">
        <Outlet key={currentFestival?.id || 'default'} />
      </main>
    </div>
  );
}
