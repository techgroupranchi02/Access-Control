/**
 * News & Publications Page
 * Addon Module: news
 * Permissions:
 * - news.view
 * - news.create
 * - news.publish
 * - news.delete
 */

import { useState, useEffect } from 'react';
import api from '../services/api';
import PermissionGate from '../components/PermissionGate';
import { usePermissions } from '../hooks/usePermissions';

export default function NewsPage() {
  const [news, setNews] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [newPost, setNewPost] = useState({ title: '', category: 'Announcements' });
  const [statusMsg, setStatusMsg] = useState('');
  const { can } = usePermissions();

  const loadNews = async () => {
    try {
      const res = await api.get('/news');
      setNews(res.data);
    } catch {
      console.error('Failed to load news');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadNews();
  }, []);

  const handlePublish = async (e) => {
    e.preventDefault();
    try {
      await api.post('/news', newPost);
      setStatusMsg(`Article "${newPost.title}" published.`);
      setShowModal(false);
      setNewPost({ title: '', category: 'Announcements' });
      loadNews();
    } catch {
      alert('Failed to publish article.');
    }
  };

  return (
    <div className="animate-fade-in">
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h2 className="page-title">📰 News & Announcements</h2>
          <p className="page-description">
            Broadcast press updates, awards announcements, and internal communications.
          </p>
        </div>
        <PermissionGate permission="news.publish">
          <button className="btn btn-primary" onClick={() => setShowModal(true)}>
            ✍️ Publish Article
          </button>
        </PermissionGate>
      </div>

      {statusMsg && (
        <div className="alert alert-success" style={{ marginBottom: 'var(--space-md)' }}>
          {statusMsg}
        </div>
      )}

      <div className="alert alert-info" style={{ marginBottom: 'var(--space-lg)', display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
        <span>🔑 <strong>News Permissions:</strong></span>
        <span className={`badge ${can('news.view') ? 'badge-success' : 'badge-danger'}`}>news.view</span>
        <span className={`badge ${can('news.publish') ? 'badge-success' : 'badge-danger'}`}>news.publish</span>
      </div>

      <div className="card">
        <div className="card-header">
          <h3 className="card-title">Published Editions Bulletins</h3>
          <p className="card-subtitle"><span className="permission-section-badge">Requires: news.view</span></p>
        </div>

        {loading ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {[1, 2, 3].map(i => <div key={i} className="skeleton" style={{ height: '48px' }}></div>)}
          </div>
        ) : (
          <div className="table-container">
            <table className="table">
              <thead>
                <tr>
                  <th>Headline</th>
                  <th>Category</th>
                  <th>Author</th>
                  <th>Published Date</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {news.map(n => (
                  <tr key={n.id}>
                    <td style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{n.title}</td>
                    <td><span className="badge badge-info">{n.category}</span></td>
                    <td>👤 {n.author}</td>
                    <td>{n.publishedAt || 'Unpublished (Draft)'}</td>
                    <td><span className={`badge ${n.status === 'Published' ? 'badge-success' : 'badge-muted'}`}>{n.status}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showModal && (
        <div className="card" style={{ marginTop: 'var(--space-lg)', border: '1px solid var(--color-primary)' }}>
          <div className="card-header">
            <h3 className="card-title">Compose Festival Press Release</h3>
            <p className="card-subtitle"><span className="permission-section-badge">Requires: news.publish</span></p>
          </div>
          <form onSubmit={handlePublish} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-md)' }}>
            <div className="form-group">
              <label className="form-label">Article Headline</label>
              <input
                required
                className="form-input"
                placeholder="e.g. Masterclass with Award-Winning Director Announced"
                value={newPost.title}
                onChange={e => setNewPost({ ...newPost, title: e.target.value })}
              />
            </div>
            <div className="form-group">
              <label className="form-label">Category</label>
              <select
                className="form-input"
                value={newPost.category}
                onChange={e => setNewPost({ ...newPost, category: e.target.value })}
              >
                <option value="Announcements">Announcements</option>
                <option value="Internal Updates">Internal Updates</option>
                <option value="Press Releases">Press Releases</option>
              </select>
            </div>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button type="submit" className="btn btn-success">Publish Now</button>
              <button type="button" className="btn btn-secondary" onClick={() => setShowModal(false)}>Cancel</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
