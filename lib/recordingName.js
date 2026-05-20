// Encodes meeting metadata into a downloadable filename so a recording saved
// to the device's Downloads folder is self-describing — and can be restored
// back into the upload flow later just from the file.
//
// Format — 6 underscore-separated fields, each sanitised to be _-free:
//   {cpcode}_{mobile}_{name}_{type}_{durationSec}_{timestamp}.{ext}
// The extension MUST match the actual recording format: Android Chrome records
// WebM, but iOS Safari records MP4 — naming an iOS MP4 ".webm" makes Files /
// WhatsApp choke ("cannot be shared", Files crash).
// Examples:
//   CP00670_9716484000_Sahaj-Dureja_engagement_324_2026-05-20T13-45-02.webm
//   CP00670_9716484000_Sahaj-Dureja_engagement_324_2026-05-20T13-45-02.m4a
//   NEW_nomobile_Ramesh-Verma_onboarding_180_2026-05-20T14-02-10.m4a

function clean(s, fallback) {
  const c = String(s ?? '')
    .trim()
    .replace(/[^a-zA-Z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return c || fallback;
}

// Maps a recording MIME type to the correct file extension. audio/mp4 → m4a
// (audio-only MP4) so sharing targets treat it as audio, not video.
export function extForMime(mime) {
  const m = String(mime || '').toLowerCase();
  if (m.includes('mp4') || m.includes('m4a') || m.includes('aac')) return 'm4a';
  if (m.includes('ogg')) return 'ogg';
  if (m.includes('wav')) return 'wav';
  if (m.includes('mpeg') || m.includes('mp3')) return 'mp3';
  if (m.includes('webm')) return 'webm';
  return 'webm';
}

// `form` shape: { cp_code, cp_mobile, cp_name, meeting_type, is_onboarding }
// `mime` is the recording blob's type — drives the file extension.
export function buildRecordingFilename(form, startedAt, durationSeconds, mime) {
  const isOnb = form?.is_onboarding || form?.meeting_type === 'onboarding';
  const cpcode = clean(isOnb ? 'NEW' : form?.cp_code, 'NOCODE');
  const mobile = clean(form?.cp_mobile, 'nomobile');
  const name = clean(form?.cp_name, 'noname');
  const type = clean(form?.meeting_type || (isOnb ? 'onboarding' : 'engagement'), 'engagement');
  const dur = Math.max(0, Math.round(Number(durationSeconds) || 0));
  const ts = new Date(startedAt || Date.now()).toISOString().slice(0, 19).replace(/:/g, '-');
  const ext = extForMime(mime);
  return `${cpcode}_${mobile}_${name}_${type}_${dur}_${ts}.${ext}`;
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

// Determines the REAL audio container by reading a blob's magic bytes — the
// only reliable source. iOS Safari claims WebM support, records MP4 anyway,
// then mis-tags the Blob as `audio/webm`. The bytes never lie:
//   WebM / Matroska : EBML header  1A 45 DF A3
//   MP4 / M4A       : 'ftyp' box type at bytes 4-7
//   OGG             : 'OggS'
// Returns a MIME string, or null if it can't tell (caller keeps its guess).
export async function detectAudioContainer(blob) {
  try {
    const buf = new Uint8Array(await blob.slice(0, 16).arrayBuffer());
    if (buf[0] === 0x1a && buf[1] === 0x45 && buf[2] === 0xdf && buf[3] === 0xa3) {
      return 'audio/webm';
    }
    if (buf[4] === 0x66 && buf[5] === 0x74 && buf[6] === 0x79 && buf[7] === 0x70) {
      return 'audio/mp4';
    }
    if (buf[0] === 0x4f && buf[1] === 0x67 && buf[2] === 0x67 && buf[3] === 0x53) {
      return 'audio/ogg';
    }
  } catch {
    // arrayBuffer read failed — fall back to the caller's guessed type.
  }
  return null;
}

// Returns `blob` unchanged if its type already matches the bytes, otherwise a
// re-wrapped Blob carrying the correct MIME type.
export async function withCorrectMime(blob) {
  const real = await detectAudioContainer(blob);
  if (real && real !== (blob.type || '').split(';')[0]) {
    return new Blob([blob], { type: real });
  }
  return blob;
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
