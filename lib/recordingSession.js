// Persists the form metadata + start time of an in-progress recording so
// the new-meeting page can resume cleanly if the user navigated away (or
// the app got killed) while the native recorder is still running. The
// RecordingGuard uses this together with MicRecorder.getStatus() to keep
// the user pinned to /new-meeting until they finalize or discard.
const KEY = 'oh_active_recording_v1';

export function getRecordingSession() {
  if (typeof window === 'undefined') return null;
  try {
    const v = window.localStorage.getItem(KEY);
    return v ? JSON.parse(v) : null;
  } catch {
    return null;
  }
}

export function setRecordingSession(data) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(data));
  } catch {}
}

export function clearRecordingSession() {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(KEY);
  } catch {}
}
