/**
 * Layout Component
 * Renders the Freecomers workbench shell:
 * - Persistent left sidebar (with off-canvas responsive mobile drawer)
 * - Main viewport with full width and responsive mobile topbar
 */

import React, { useState, useEffect, useRef } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import Sidebar from './Sidebar';
import { useFestivalConfig } from '../hooks/useFestivalConfig';

export default function Layout() {
  const { currentFestival, openFestivalModal } = useFestivalConfig();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isHeaderVisible, setIsHeaderVisible] = useState(true);
  const location = useLocation();
  const lastScrollYRef = useRef(0);
  const mainViewportRef = useRef(null);

  // Automatically close mobile menu and reset header visibility on page navigation
  useEffect(() => {
    setIsMobileMenuOpen(false);
    setIsHeaderVisible(true);
    if (mainViewportRef.current) {
      mainViewportRef.current.scrollTop = 0;
    }
  }, [location.pathname]);

  // Smart directional scroll: hide on scroll down, reveal on scroll up
  useEffect(() => {
    const el = mainViewportRef.current;
    if (!el) return;

    const handleScroll = () => {
      const currentScrollY = el.scrollTop;
      const prevScrollY = lastScrollYRef.current;
      const diff = currentScrollY - prevScrollY;

      // Always show near the top (within 45px)
      if (currentScrollY <= 45) {
        setIsHeaderVisible(true);
      } else if (diff > 8) {
        // Scrolling down past threshold -> hide header
        setIsHeaderVisible(false);
      } else if (diff < -8) {
        // Scrolling up past threshold -> reveal header
        setIsHeaderVisible(true);
      }

      lastScrollYRef.current = currentScrollY;
    };

    el.addEventListener('scroll', handleScroll, { passive: true });
    return () => el.removeEventListener('scroll', handleScroll);
  }, []);

  return (
    <div className="fc-app-layout">
      {/* Mobile Drawer Backdrop */}
      {isMobileMenuOpen && (
        <div
          className="fc-sidebar-backdrop"
          onClick={() => setIsMobileMenuOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Sidebar with mobile drawer state */}
      <Sidebar
        isMobileOpen={isMobileMenuOpen}
        onCloseMobile={() => setIsMobileMenuOpen(false)}
      />

      <main ref={mainViewportRef} className="fc-main-viewport">
        {/* Mobile Top Header (Hidden on Desktop, Visible on <= 768px) */}
        <header className={`fc-mobile-header ${!isHeaderVisible ? 'is-hidden' : ''}`}>
          <button
            type="button"
            className="fc-mobile-hamburger-btn"
            onClick={() => setIsMobileMenuOpen(true)}
            aria-label="Open navigation menu"
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.4"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <line x1="3" y1="12" x2="21" y2="12" />
              <line x1="3" y1="6" x2="21" y2="6" />
              <line x1="3" y1="18" x2="21" y2="18" />
            </svg>
          </button>

          <div
            className="fc-mobile-header-brand"
            onClick={() => setIsMobileMenuOpen(true)}
          >
            <img
              src="/ffesti-plus-logo.png"
              alt="ffesti Plus"
              className="fc-mobile-brand-icon"
              onError={(e) => {
                e.target.style.display = 'none';
              }}
            />
            <div className="fc-mobile-brand-meta">
              <span className="fc-mobile-brand-title">ffesti Plus</span>
              {currentFestival && (
                <span className="fc-mobile-fest-title">{currentFestival.name}</span>
              )}
            </div>
          </div>

          <button
            type="button"
            className="fc-mobile-fest-switch-btn"
            onClick={openFestivalModal}
            title="Switch Festival"
          >
            <span>Switch</span>
            <svg
              width="12"
              height="12"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </button>
        </header>

        <Outlet key={currentFestival?.id || 'default'} />
      </main>
    </div>
  );
}
