/**
 * useCanViewRoster — can the current user open the full Audience delegate list (/audience)
 * and Bulk QR badge stock?
 *
 * Driven by the `registration:view_roster` permission (granted to the admin group by default,
 * not to volunteers; editable per group). Platform admins and festival admins always pass,
 * matching the admin rule in utils/routePermissions.js.
 */
import { useFestivalConfig } from './useFestivalConfig';

export function useCanViewRoster() {
  const { hasPermission, isSuperAdmin, currentUserGroup } = useFestivalConfig();
  return Boolean(
    isSuperAdmin ||
    currentUserGroup === 'admin' ||
    (hasPermission && (hasPermission('registration.view_roster') || hasPermission('registration:view_roster')))
  );
}
