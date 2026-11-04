/**
 * Route Permission Helpers
 * Determines whether a route is accessible for given modules and permissions,
 * and calculates the primary default landing route for any role / persona.
 */

export function checkRouteAccess(pathname, isModuleEnabled, hasPermission, isSuperAdmin, userGroup) {
  if (!pathname || pathname === '/' || pathname === '') return true;
  const isAdmin = Boolean(isSuperAdmin || userGroup === 'admin');
  const canAccess = (perm) => isAdmin || (hasPermission && hasPermission(perm));
  const isModOn = (mod) => isModuleEnabled ? isModuleEnabled(mod) : true;

  // Clean pathname without query parameters
  const path = pathname.split('?')[0].split('#')[0];

  // Dashboard
  if (path.startsWith('/dashboard')) {
    return isModOn('dashboard') && (isAdmin || canAccess('dashboard.view') || canAccess('dashboard.manage'));
  }

  // Submissions & Reviews
  if (path.startsWith('/submissions') || path.startsWith('/review') || path.startsWith('/submission')) {
    return isModOn('submissions') && (isAdmin || canAccess('submission.view') || canAccess('review.view') || canAccess('review.score') || canAccess('jury.submit_ballot'));
  }

  // Team
  if (path.startsWith('/team')) {
    return isModOn('team') && (isAdmin || canAccess('team.view') || canAccess('team.manage'));
  }

  // Payouts / Payments
  if (path.startsWith('/payouts') || path.startsWith('/payments')) {
    return (isModOn('payouts') || isModOn('payments')) && (isAdmin || canAccess('payouts.view') || canAccess('payment.view'));
  }

  // Audience Settings
  if (path.startsWith('/settings/audience')) {
    return isModOn('audience') && (isAdmin || canAccess('audience.view') || canAccess('audience.manage') || canAccess('settings.view'));
  }

  // General Settings & Review Stages
  if (path.startsWith('/settings') || path.startsWith('/setting')) {
    return isModOn('settings') && (isAdmin || canAccess('settings.view') || canAccess('settings.manage'));
  }

  // Tasks & Schedule
  if (path.startsWith('/tasks') || path.startsWith('/schedule') || path.startsWith('/calendar')) {
    return (isModOn('tasks') || isModOn('schedule')) && (isAdmin || canAccess('task.view') || canAccess('schedule.view') || canAccess('calendar.view'));
  }

  // Audience: Attendance
  if (path.startsWith('/attendance')) {
    return isModOn('audience') && (isAdmin || canAccess('attendance.view') || canAccess('attendance.scan_checkin') || canAccess('audience.view'));
  }

  // Audience: Voting
  if (path.startsWith('/voting') || path.startsWith('/vote')) {
    return isModOn('audience') && (isAdmin || canAccess('voting.view_results') || canAccess('voting.vote') || canAccess('audience.view'));
  }

  // Audience: Registration & Passes
  if (path.startsWith('/audience') || path.startsWith('/registration')) {
    return isModOn('audience') && (isAdmin || canAccess('registration.view') || canAccess('registration.create') || canAccess('audience.view'));
  }

  // Guests
  if (path.startsWith('/guests')) {
    return isModOn('guests') && (isAdmin || canAccess('guest.view'));
  }

  // Sponsors
  if (path.startsWith('/sponsors')) {
    return isModOn('sponsors') && (isAdmin || canAccess('sponsors.view'));
  }

  // Comms / Chat
  if (path.startsWith('/chat') || path.startsWith('/comms')) {
    return (isModOn('chat') || isModOn('comms')) && (isAdmin || canAccess('chat.view'));
  }

  return true;
}

export function getPrimaryAccessibleRoute(isModuleEnabled, hasPermission, isSuperAdmin, userGroup) {
  const isAdmin = Boolean(isSuperAdmin || userGroup === 'admin');
  const canAccess = (perm) => isAdmin || (hasPermission && hasPermission(perm));
  const isModOn = (mod) => isModuleEnabled ? isModuleEnabled(mod) : true;

  // 1. Admin: prefer Dashboard -> Submissions -> Audience -> Schedule -> Team
  if (isAdmin) {
    if (isModOn('dashboard') && canAccess('dashboard.view')) return '/dashboard';
    if (isModOn('submissions')) return '/submissions';
    if (isModOn('audience')) return '/audience';
    if (isModOn('tasks') || isModOn('schedule')) return '/schedule';
    if (isModOn('team')) return '/team';
    return '/dashboard';
  }

  // 2. Jury: prefer Submissions
  if (userGroup === 'jury' || userGroup === 'judge' || canAccess('review.score') || canAccess('jury.submit_ballot')) {
    if (isModOn('submissions') && (canAccess('submission.view') || canAccess('review.view') || canAccess('review.score') || canAccess('jury.submit_ballot'))) {
      return '/submissions';
    }
  }

  // 3. Submissions (if permitted for any role)
  if (isModOn('submissions') && (canAccess('submission.view') || canAccess('review.view'))) {
    return '/submissions';
  }

  // 4. Audience & Voting (Volunteer, Operations, Reception Desk)
  if (isModOn('audience')) {
    if (canAccess('registration.view') || canAccess('audience.view')) return '/audience';
    if (canAccess('attendance.view')) return '/attendance';
    if (canAccess('voting.view_results')) return '/voting';
    return '/audience';
  }

  // 5. Tasks & Schedule
  if ((isModOn('tasks') || isModOn('schedule')) && (canAccess('schedule.view') || canAccess('task.view') || canAccess('calendar.view'))) {
    return '/schedule';
  }

  // 6. Payouts
  if ((isModOn('payouts') || isModOn('payments')) && (canAccess('payouts.view') || canAccess('payment.view'))) {
    return '/payouts';
  }

  // 7. Team
  if (isModOn('team') && canAccess('team.view')) {
    return '/team';
  }

  // 8. Guests
  if (isModOn('guests') && canAccess('guest.view')) {
    return '/guests';
  }

  // 9. Comms
  if ((isModOn('comms') || isModOn('chat')) && canAccess('chat.view')) {
    return '/chat';
  }

  // 10. Settings
  if (isModOn('settings') && (canAccess('settings.view') || canAccess('settings.manage'))) {
    return '/settings';
  }

  // Default fallback
  if (isModOn('audience')) return '/audience';
  return '/dashboard';
}

