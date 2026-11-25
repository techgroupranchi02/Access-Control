/**
 * PermissionGate Component
 * Renders children ONLY if the user has the specified permission.
 * This is the core component for granular access control in the UI.
 * 
 * Usage:
 *   <PermissionGate permission="submission:view" fallback={<AccessDenied />}>
 *     <PermissionGate permission="submission:edit">
 *       <PermissionGate permission="submission:delete">
 *         <button>Delete</button>
 *       </PermissionGate>
 *     </PermissionGate>
 *   </PermissionGate>
 */

import { usePermissions } from '../hooks/usePermissions';

export default function PermissionGate({ permission, permissions, anyPermissions, fallback = null, children }) {
  const { can, canAll, canAny } = usePermissions();

  // Single permission check
  if (permission) {
    return can(permission) ? children : fallback;
  }

  // Any of multiple permissions check
  if (anyPermissions && Array.isArray(anyPermissions)) {
    return canAny(anyPermissions) ? children : fallback;
  }

  // Multiple permissions check (all required)
  if (permissions && Array.isArray(permissions)) {
    return canAll(permissions) ? children : fallback;
  }

  // No permission specified — render children
  return children;
}
