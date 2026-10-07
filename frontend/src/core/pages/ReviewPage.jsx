/**
 * ReviewPage Component
 * Role-aware Review Dashboard:
 * - When role is Jury: renders JudgeReviewDashboardShell (13-criteria star rating, queue, completed badges, notes)
 * - When role is Admin: renders AdminReviewDashboardWizard (6-step pipeline stepper, 1. Assign checkboxes, 2. Scores + 10 metric cards + Jury Progress Matrix, 3. Decisions)
 */

import React, { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import JudgeReviewDashboardShell from '../components/review/JudgeReviewDashboardShell';
import AdminReviewDashboardWizard from '../components/review/AdminReviewDashboardWizard';

export default function ReviewPage() {
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();

  const roleKey = user?.current_group || (user?.isSuperAdmin ? 'admin' : 'jury');
  const isDefaultJury = (roleKey === 'jury' || roleKey === 'judge') && !user?.isSuperAdmin;

  // Allow query param ?view=jury, ?view=judge or ?view=admin or local toggle
  const paramView = searchParams.get('view');
  const normalizedParamView = (paramView === 'jury' || paramView === 'judge') ? 'jury' : paramView;
  const [viewOverride, setViewOverride] = useState(normalizedParamView || null);

  const activeView = viewOverride || (isDefaultJury ? 'jury' : 'admin');

  const handleSwitchToAdmin = () => {
    setViewOverride('admin');
    const next = new URLSearchParams(searchParams);
    next.set('view', 'admin');
    setSearchParams(next);
  };

  const handleSwitchToJury = () => {
    setViewOverride('jury');
    const next = new URLSearchParams(searchParams);
    next.set('view', 'jury');
    setSearchParams(next);
  };

  return (
    <div className="fc-review-page-container">
      {(activeView === 'jury' || activeView === 'judge') ? (
        <JudgeReviewDashboardShell onSwitchToAdmin={handleSwitchToAdmin} />
      ) : (
        <AdminReviewDashboardWizard onSwitchToJury={handleSwitchToJury} onSwitchToJudge={handleSwitchToJury} />
      )}
    </div>
  );
}
