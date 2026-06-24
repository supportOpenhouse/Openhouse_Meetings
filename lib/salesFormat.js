// Display helpers + label maps shared across the sales client components.
// Pure functions — safe to import into client components. All timestamps that
// arrive are UTC ISO strings; we format to the viewer's local time here only.

export function fmtTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d)) return '';
  return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

export function fmtDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d)) return '';
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

export function fmtDateTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d)) return '';
  return d.toLocaleString(undefined, {
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function fmtDuration(seconds) {
  const s = Math.max(0, Math.round(Number(seconds) || 0));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  return `${h}h ${String(m % 60).padStart(2, '0')}m`;
}

// next_followup_date arrives as a plain 'YYYY-MM-DD' date string. Compare it to
// the viewer's local "today" to produce a human label.
export function followupLabel(dateStr) {
  if (!dateStr) return '';
  const [y, m, d] = String(dateStr).split('-').map(Number);
  if (!y || !m || !d) return dateStr;
  const target = new Date(y, m - 1, d);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const diffDays = Math.round((target - today) / 86400000);
  if (diffDays < 0) return diffDays === -1 ? 'Yesterday' : `${Math.abs(diffDays)}d overdue`;
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Tomorrow';
  if (diffDays < 7) return `In ${diffDays}d`;
  return target.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

export function isOverdue(dateStr) {
  if (!dateStr) return false;
  const [y, m, d] = String(dateStr).split('-').map(Number);
  if (!y) return false;
  const target = new Date(y, m - 1, d);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return target <= today;
}

export function initials(name) {
  return (String(name || '?').trim().charAt(0) || '?').toUpperCase();
}

export const ENGAGEMENT_LABELS = {
  positive: 'Positive',
  neutral: 'Neutral',
  disengaged: 'Disengaged',
};

export const OUTCOME_LABELS = {
  onboarded: 'Onboarded',
  follow_up_required: 'Follow-up',
  not_interested: 'Not interested',
  future_potential: 'Future potential',
};

// Maps an outcome to the sx-pill modifier class it should wear.
export const OUTCOME_PILL = {
  onboarded: 'onboarded',
  follow_up_required: 'follow_up',
  not_interested: 'not_interested',
  future_potential: 'future',
};

export const STAGE_LABELS = {
  not_interested: 'Not interested',
  evaluating: 'Evaluating',
  ready_to_onboard: 'Ready to onboard',
  onboarded: 'Onboarded',
};

export const STATUS_LABELS = {
  processing: 'Processing',
  ready: 'Ready',
  failed: 'Failed',
};

export const BUSINESS_LABELS = {
  primary: 'Primary sales',
  resale: 'Resale',
  rental: 'Rentals',
};

export const VERIFICATION_LABELS = {
  visible_signage: 'Visible signage',
  no_signage: 'No signage',
  shared_office: 'Shared office',
  home_based: 'Home-based',
};
