/**
 * Edition Settings Page
 * Core Module: edition_settings
 * Permissions:
 * - settings.view
 * - settings.edit_general
 * - settings.manage_addons
 * - settings.audit_log_view
 */

import { useState, useEffect } from 'react';
import api from '../services/api';
import PermissionGate from '../components/PermissionGate';
import { usePermissions } from '../hooks/usePermissions';
import { useFestivalConfig } from '../hooks/useFestivalConfig';

export default function SettingsPage() {
  const [configModules, setConfigModules] = useState([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState(null);
  const [statusMsg, setStatusMsg] = useState('');
  const { can } = usePermissions();
  const { currentFestival, refreshConfig } = useFestivalConfig();

  const loadSettings = async () => {
    try {
      const res = await api.get('/settings');
      setConfigModules(res.data.modules || []);
    } catch {
      console.error('Failed to load edition settings');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSettings();
  }, [currentFestival]);

  const handleToggleAddon = async (module) => {
    setSavingId(module.module_id);
    const newStatus = !module.is_enabled;
    try {
      await api.post(`/settings/modules/${module.module_id}/toggle`, {
        isEnabled: newStatus,
      });
      setStatusMsg(`Module "${module.name}" is now ${newStatus ? 'ENABLED' : 'DISABLED'}.`);
      await refreshConfig();
      await loadSettings();
    } catch {
      alert('Failed to update module state.');
    } finally {
      setSavingId(null);
    }
  };

  const coreMods = configModules.filter(m => m.module_type === 'core');
  const addonMods = configModules.filter(m => m.module_type === 'addon');
  const customMods = configModules.filter(m => m.module_type === 'custom');

  return (
    <div className="animate-fade-in">
      <div className="page-header">
        <h2 className="page-title">⚙️ Edition Settings & Modules</h2>
        <p className="page-description">
          Manage active edition configuration, toggle addon capabilities, and view system declarations.
        </p>
      </div>

      {statusMsg && (
        <div className="alert alert-success" style={{ marginBottom: 'var(--space-md)' }}>
          {statusMsg}
        </div>
      )}

      <div className="alert alert-info" style={{ marginBottom: 'var(--space-lg)', display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
        <span>🔑 <strong>Settings Permissions:</strong></span>
        <span className={`badge ${can('settings.view') ? 'badge-success' : 'badge-danger'}`}>settings.view</span>
        <span className={`badge ${can('settings.manage_addons') || can('settings.toggle_addons') ? 'badge-success' : 'badge-danger'}`}>settings.manage_addons</span>
        <span className={`badge ${can('settings.edit_general') || can('settings.update_general') ? 'badge-success' : 'badge-danger'}`}>settings.edit_general</span>
      </div>

      {/* Addon Modules Section (Toggable) */}
      <div className="card" style={{ marginBottom: 'var(--space-xl)' }}>
        <div className="card-header">
          <div>
            <h3 className="card-title">🧩 Addon Modules (Toggable Capabilities)</h3>
            <p className="card-subtitle">Enable or disable optional capabilities per festival edition</p>
          </div>
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
                  <th>Module</th>
                  <th>Key</th>
                  <th>Route</th>
                  <th>State</th>
                  <th>Toggle Switch</th>
                </tr>
              </thead>
              <tbody>
                {addonMods.map(m => (
                  <tr key={m.module_id}>
                    <td style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{m.name}</td>
                    <td><code>{m.module_key}</code></td>
                    <td><code>{m.route}</code></td>
                    <td>
                      <span className={`badge ${m.is_enabled ? 'badge-success' : 'badge-muted'}`}>
                        {m.is_enabled ? 'Active / Enabled' : 'Disabled'}
                      </span>
                    </td>
                    <td>
                      <PermissionGate permission="settings.manage_addons">
                        <button
                          className={`btn btn-sm ${m.is_enabled ? 'btn-danger' : 'btn-success'}`}
                          disabled={savingId === m.module_id}
                          onClick={() => handleToggleAddon(m)}
                        >
                          {savingId === m.module_id ? 'Saving...' : m.is_enabled ? 'Disable Module' : 'Enable Module'}
                        </button>
                      </PermissionGate>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Core Modules Section */}
      <div className="card" style={{ marginBottom: 'var(--space-xl)' }}>
        <div className="card-header">
          <div>
            <h3 className="card-title">🏛️ Core Platform Modules</h3>
            <p className="card-subtitle">Foundational modules that remain permanent across editions</p>
          </div>
        </div>
        <div className="table-container">
          <table className="table">
            <thead>
              <tr>
                <th>Module Name</th>
                <th>Module Key</th>
                <th>Route</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {coreMods.map(m => (
                <tr key={m.module_id}>
                  <td style={{ fontWeight: 600 }}>{m.name}</td>
                  <td><code>{m.module_key}</code></td>
                  <td><code>{m.route}</code></td>
                  <td><span className="badge badge-success">Always Enabled (Core)</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Custom Plugins Section */}
      {customMods.length > 0 && (
        <div className="card">
          <div className="card-header">
            <div>
              <h3 className="card-title">🔌 Custom Plugin Modules</h3>
              <p className="card-subtitle">Independently loaded extensions (CustomA, CustomB, CustomC)</p>
            </div>
          </div>
          <div className="table-container">
            <table className="table">
              <thead>
                <tr>
                  <th>Plugin</th>
                  <th>Key</th>
                  <th>Route</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {customMods.map(m => (
                  <tr key={m.module_id}>
                    <td style={{ fontWeight: 600 }}>{m.name}</td>
                    <td><code>{m.module_key}</code></td>
                    <td><code>{m.route}</code></td>
                    <td><span className="badge badge-info">Custom Extension</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
