/**
 * ReviewPage Component
 * Role-aware Review Dashboard:
 * - When role is Judge: renders JudgeReviewDashboardShell (13-criteria star rating, queue, completed badges, notes)
 * - When role is Admin: renders AdminReviewDashboardWizard (6-step pipeline stepper, 1. Assign checkboxes, 2. Scores + 10 metric cards + Judge Progress Matrix, 3. Decisions)
 */

import React, { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import JudgeReviewDashboardShell from '../components/review/JudgeReviewDashboardShell';
import AdminReviewDashboardWizard from '../components/review/AdminReviewDashboardWizard';

export default function ReviewPage() {
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();

  const roleKey = user?.current_group || (user?.isSuperAdmin ? 'admin' : 'judge');
  const isDefaultJudge = roleKey === 'judge' && !user?.isSuperAdmin;

  // Allow query param ?view=judge or ?view=admin or local toggle
  const paramView = searchParams.get('view');
  const [viewOverride, setViewOverride] = useState(paramView || null);

  const activeView = viewOverride || (isDefaultJudge ? 'judge' : 'admin');

  const handleSwitchToAdmin = () => {
    setViewOverride('admin');
    const next = new URLSearchParams(searchParams);
    next.set('view', 'admin');
    setSearchParams(next);
  };

  const handleSwitchToJudge = () => {
    setViewOverride('judge');
    const next = new URLSearchParams(searchParams);
    next.set('view', 'judge');
    setSearchParams(next);
  };

  return (
    <div className="fc-review-page-container">
      {activeView === 'judge' ? (
        <JudgeReviewDashboardShell onSwitchToAdmin={handleSwitchToAdmin} />
      ) : (
        <AdminReviewDashboardWizard onSwitchToJudge={handleSwitchToJudge} />
      )}
    </div>
  );
}
