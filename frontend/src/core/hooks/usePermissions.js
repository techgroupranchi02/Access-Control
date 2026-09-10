import { useContext, useCallback, useMemo } from 'react';
import { FestivalContext } from '../context/FestivalContext';

export function usePermissions() {
  const context = useContext(FestivalContext);
  if (!context) {
    throw new Error('usePermissions must be used within a FestivalProvider');
  }

  const { hasPermission, isFeatureEnabled, userPermissions } = context;

  const can = useCallback((permissionKey) => {
    return hasPermission(permissionKey);
  }, [hasPermission]);

  const canAll = useCallback((permissionKeys) => {
    return permissionKeys.every(key => hasPermission(key));
  }, [hasPermission]);

  const canAny = useCallback((permissionKeys) => {
    return permissionKeys.some(key => hasPermission(key));
  }, [hasPermission]);

  const permissionsList = useMemo(() => {
    if (Array.isArray(userPermissions)) return userPermissions;
    if (userPermissions && typeof userPermissions === 'object') {
      return Object.keys(userPermissions);
    }
    return [];
  }, [userPermissions]);

  return {
    can,
    canAll,
    canAny,
    isFeatureEnabled,
    permissions: permissionsList,
    permissionMap: userPermissions || {},
    permissionDetails: userPermissions || {},
  };
}
