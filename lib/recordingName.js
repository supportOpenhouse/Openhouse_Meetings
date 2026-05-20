// Encodes meeting metadata into a downloadable filename so a recording saved
// to the device's Downloads folder is self-describing — and can be restored
// back into the upload flow later just from the file.
//
// Format — 6 underscore-separated fields, each sanitised to be _-free:
//   {cpcode}_{mobile}_{name}_{type}_{durationSec}_{timestamp}.webm
// Examples:
//   CP00670_9716484000_Sahaj-Dureja_engagement_324_2026-05-20T13-45-02.webm
//   NEW_nomobile_Ramesh-Verma_onboarding_180_2026-05-20T14-02-10.webm

function clean(s, fallback) {
  const c = String(s ?? '')
    .trim()
    .replace(/[^a-zA-Z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return c || fallback;
}

// `form` shape: { cp_code, cp_mobile, cp_name, meeting_type, is_onboarding }
export function buildRecordingFilename(form, startedAt, durationSeconds) {
  const isOnb = form?.is_onboarding || form?.meeting_type === 'onboarding';
  const cpcode = clean(isOnb ? 'NEW' : form?.cp_code, 'NOCODE');
  const mobile = clean(form?.cp_mobile, 'nomobile');
  const name = clean(form?.cp_name, 'noname');
  const type = clean(form?.meeting_type || (isOnb ? 'onboarding' : 'engagement'), 'engagement');
  const dur = Math.max(0, Math.round(Number(durationSeconds) || 0));
  const ts = new Date(startedAt || Date.now()).toISOString().slice(0, 19).replace(/:/g, '-');
  return `${cpcode}_${mobile}_${name}_${type}_${dur}_${ts}.webm`;
}

// Reverse of buildRecordingFilename. Returns null if the name isn't ours.
export function parseRecordingFilename(filename) {
  const base = String(filename || '').replace(/\.[a-z0-9]+$/i, '');
  const parts = base.split('_');
  if (parts.length !== 6) return null;
  const [cpcode, mobile, name, type, dur, ts] = parts;
  const iso = ts.replace(/^(\d{4}-\d{2}-\d{2}T\d{2})-(\d{2})-(\d{2})$/, '$1:$2:$3');
  const tsValid = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/.test(iso);
  const knownType = ['engagement', 'visit', 'onboarding'].includes(type) ? type : 'engagement';
  const isOnb = knownType === 'onboarding' || cpcode === 'NEW';
  return {
    cp_code: cpcode === 'NEW' || cpcode === 'NOCODE' ? '' : cpcode,
    cp_mobile: mobile === 'nomobile' ? '' : mobile,
    cp_name: name === 'noname' ? '' : name.replace(/-/g, ' '),
    cp_city: '',
    purpose: '',
    meeting_type: knownType,
    is_onboarding: isOnb,
    duration_seconds: Math.max(0, parseInt(dur, 10) || 0),
    started_at: tsValid ? new Date(iso).toISOString() : new Date().toISOString(),
  };
}

// Human-facing label for banners / lists.
export function buildRecordingLabel(form) {
  const isOnb = form?.is_onboarding || form?.meeting_type === 'onboarding';
  const bits = [];
  if (isOnb) bits.push('NEW CP');
  else if (form?.cp_code) bits.push(form.cp_code);
  if (form?.cp_name) bits.push(form.cp_name);
  return bits.join(' · ') || 'Recording';
}

// Triggers a real browser download (lands in the device Downloads folder /
// Files app). Returns true on success.
export function triggerDownload(blob, filename) {
  if (typeof window === 'undefined') return false;
  try {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    return true;
  } catch {
    return false;
  }
}
