/**
 * Festival Context
 * Manages current festival selection, feature config, and user permissions.
 */

import { createContext, useState, useEffect, useCallback } from 'react';
import api from '../services/api';

export const FestivalContext = createContext(null);

export function FestivalProvider({ children }) {
  const [festivals, setFestivals] = useState([]);
  const [currentFestival, setCurrentFestival] = useState(null);
  const [features, setFeatures] = useState([]);
  const [userPermissions, setUserPermissions] = useState({});
  const [permissionDetails, setPermissionDetails] = useState([]);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [loading, setLoading] = useState(false);

  // Load editions/festivals on mount
  useEffect(() => {
    loadFestivals();
  }, []);

  const loadFestivals = async () => {
    try {
      const res = await api.get('/events');
      setFestivals(res.data);

      // Auto-select saved edition/festival or first one
      const savedId = localStorage.getItem('currentEditionId') || localStorage.getItem('currentFestivalId');
      if (savedId) {
        const saved = res.data.find(f => f.id === parseInt(savedId, 10));
        if (saved) {
          selectFestival(saved);
          return;
        }
      }
      if (res.data.length > 0) {
        selectFestival(res.data[0]);
      }
    } catch {
      console.error('Failed to load editions/festivals');
    }
  };

  const selectFestival = useCallback(async (festival) => {
    setLoading(true);
    setCurrentFestival(festival);
    localStorage.setItem('currentFestivalId', festival.id);
    localStorage.setItem('currentEditionId', festival.id);

    try {
      // Load edition config (modules / features)
      const configRes = await api.get(`/events/${festival.id}/config`, {
        headers: { 'X-Festival-Id': festival.id, 'X-Edition-Id': festival.id },
      });
      const mods = configRes.data.modules || configRes.data.features || [];
      setFeatures(mods);

      // Load user permissions for this event / edition
      const meRes = await api.get('/auth/me', {
        headers: { 'X-Festival-Id': festival.id, 'X-Edition-Id': festival.id, 'X-Event-Id': festival.id },
      });
      const perms = meRes.data.permissions || {};
      setUserPermissions(perms);
      setIsSuperAdmin(Boolean((perms && perms['*']) || (Array.isArray(perms) && perms.includes('*')) || meRes.data.isSuperAdmin));
    } catch (err) {
      console.error('Failed to load edition config');
    } finally {
      setLoading(false);
    }
  }, []);

  const isFeatureEnabled = useCallback((key) => {
    if (!key) return true;
    return features.some(f => (f.module_key === key || f.feature_key === key) && (f.is_enabled === 1 || f.is_enabled === true));
  }, [features]);

  const isModuleEnabled = isFeatureEnabled;

  const hasPermission = useCallback((permissionKey) => {
    if (!permissionKey) return true;
    if (isSuperAdmin) return true;

    const checkKey = (k) => {
      if (Array.isArray(userPermissions)) return userPermissions.includes(k);
      return Boolean(userPermissions && userPermissions[k]);
    };

    if (checkKey('*') || checkKey(permissionKey)) return true;

    // Check alias between dot-notation and colon-notation
    if (permissionKey.includes('.')) {
      const [mod, act] = permissionKey.split('.');
      const actionMap = { view: 'read', edit: 'update', delete: 'delete', manage: 'update' };
      const colonAction = actionMap[act] || act;
      if (checkKey(`${mod}:${colonAction}`) || checkKey(`${mod}:${act}`)) return true;
    } else if (permissionKey.includes(':')) {
      const [mod, act] = permissionKey.split(':');
      const actionMap = { read: 'view', update: 'edit', delete: 'delete' };
      const dotAction = actionMap[act] || act;
      if (checkKey(`${mod}.${dotAction}`) || checkKey(`${mod}.${act}`)) return true;
    }

    return false;
  }, [userPermissions, isSuperAdmin]);

  const getScope = useCallback((permissionKey) => {
    return 'all';
  }, []);

  const getEnabledFeatures = useCallback(() => {
    return features.filter(f => f.is_enabled === 1 || f.is_enabled === true);
  }, [features]);

  const getEnabledModules = getEnabledFeatures;

  const refreshConfig = useCallback(async () => {
    if (currentFestival) {
      await selectFestival(currentFestival);
    }
  }, [currentFestival, selectFestival]);

  const value = {
    // Edition terminology
    editions: festivals,
    currentEdition: currentFestival,
    modules: features,
    isModuleEnabled,
    getEnabledModules,
    getScope,
    isSuperAdmin,
    // Festival terminology (backwards compat)
    festivals,
    currentFestival,
    features,
    userPermissions,
    loading,
    selectFestival,
    selectEdition: selectFestival,
    isFeatureEnabled,
    hasPermission,
    getEnabledFeatures,
    refreshConfig,
    loadFestivals,
  };

  return (
    <FestivalContext.Provider value={value}>
      {children}
    </FestivalContext.Provider>
  );
}
