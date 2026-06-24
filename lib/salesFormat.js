// Display helpers + label maps shared across the sales client components.
// Pure functions — safe to import into client components. All timestamps that
// arrive are UTC ISO strings. Everything is pinned to IST (Asia/Kolkata) so the
// server (UTC runtime) and the browser (IST) produce IDENTICAL strings — an
// unpinned toLocale* diverges between the two and triggers a React hydration
// mismatch (#422).
const IST = 'Asia/Kolkata';

// The IST calendar day of a date (default: now) as 'YYYY-MM-DD' — independent of
// the runtime timezone, so server and client agree.
function istDayStr(d = new Date()) {
  return d.toLocaleDateString('en-CA', { timeZone: IST });
}
// Whole-day difference between two 'YYYY-MM-DD' strings (target - reference).
function dayDiff(refStr, targetStr) {
  return Math.round((Date.parse(`${targetStr}T00:00:00Z`) - Date.parse(`${refStr}T00:00:00Z`)) / 86400000);
}

export function fmtTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d)) return '';
  return d.toLocaleTimeString('en-IN', { timeZone: IST, hour: 'numeric', minute: '2-digit' });
}

export function fmtDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d)) return '';
  return d.toLocaleDateString('en-IN', { timeZone: IST, day: 'numeric', month: 'short' });
}

export function fmtDateTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d)) return '';
  return d.toLocaleString('en-IN', {
    timeZone: IST,
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
  const m = String(dateStr).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return dateStr;
  const targetStr = `${m[1]}-${m[2]}-${m[3]}`;
  const diffDays = dayDiff(istDayStr(), targetStr); // relative to "today" in IST
  if (diffDays < 0) return diffDays === -1 ? 'Yesterday' : `${Math.abs(diffDays)}d overdue`;
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Tomorrow';
  if (diffDays < 7) return `In ${diffDays}d`;
  return new Date(`${targetStr}T00:00:00+05:30`).toLocaleDateString('en-IN', {
    timeZone: IST,
    day: 'numeric',
    month: 'short',
  });
}

export function isOverdue(dateStr) {
  if (!dateStr) return false;
  const m = String(dateStr).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return false;
  return dayDiff(istDayStr(), `${m[1]}-${m[2]}-${m[3]}`) <= 0; // due today or earlier (IST)
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
