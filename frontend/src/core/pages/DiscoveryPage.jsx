/**
 * Discovery Feed Page
 * Addon Module: discovery (Disabled by default in standard editions)
 * Permissions:
 * - discovery.browse
 * - discovery.contact_filmmaker
 * - discovery.bookmark
 */

import { useState } from 'react';
import PermissionGate from '../components/PermissionGate';
import { usePermissions } from '../hooks/usePermissions';

export default function DiscoveryPage() {
  const { can } = usePermissions();
  const [bookmarked, setBookmarked] = useState({});

  const toggleBookmark = (id) => {
    setBookmarked(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const discoveryItems = [
    { id: 1, title: 'Echoes of the Arctic', director: 'Kari Lindqvist', country: 'Norway', genre: 'Documentary', length: '88 min' },
    { id: 2, title: 'The Neon Labyrinth', director: 'Kenji Sato', country: 'Japan', genre: 'Sci-Fi Thriller', length: '104 min' },
    { id: 3, title: 'Under the Olive Trees', director: 'Sofia Rossi', country: 'Italy', genre: 'Drama', length: '95 min' },
  ];

  return (
    <div className="animate-fade-in">
      <div className="page-header">
        <h2 className="page-title">🧭 Discovery Feed</h2>
        <p className="page-description">
          Public filmmaker showcase and buyer discovery portal.
        </p>
      </div>

      <div className="alert alert-info" style={{ marginBottom: 'var(--space-lg)', display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
        <span>🔑 <strong>Discovery Permissions:</strong></span>
        <span className={`badge ${can('discovery.browse') || can('discovery.view_public') ? 'badge-success' : 'badge-danger'}`}>discovery.browse</span>
        <span className={`badge ${can('discovery.bookmark') ? 'badge-success' : 'badge-danger'}`}>discovery.bookmark</span>
      </div>

      <div className="card">
        <div className="card-header">
          <h3 className="card-title">Curated Film Talent Showcase</h3>
          <p className="card-subtitle"><span className="permission-section-badge">Requires: discovery.browse</span></p>
        </div>
        <div className="table-container">
          <table className="table">
            <thead>
              <tr>
                <th>Film Title</th>
                <th>Director</th>
                <th>Country</th>
                <th>Genre</th>
                <th>Runtime</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {discoveryItems.map(item => (
                <tr key={item.id}>
                  <td style={{ fontWeight: 600 }}>{item.title}</td>
                  <td>👤 {item.director}</td>
                  <td>🌍 {item.country}</td>
                  <td><span className="badge badge-info">{item.genre}</span></td>
                  <td>⏱️ {item.length}</td>
                  <td>
                    <PermissionGate permission="discovery.bookmark">
                      <button
                        className={`btn btn-sm ${bookmarked[item.id] ? 'btn-primary' : 'btn-secondary'}`}
                        onClick={() => toggleBookmark(item.id)}
                      >
                        {bookmarked[item.id] ? '★ Bookmarked' : '☆ Bookmark'}
                      </button>
                    </PermissionGate>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
