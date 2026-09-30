import { Capacitor, registerPlugin } from '@capacitor/core';

// JS-side wrapper for the native MicRecorder plugin
// (android/app/src/main/java/in/openhouse/meetings/MicRecorderPlugin.java).
// Replaces capacitor-voice-recorder so long recordings don't OOM the WebView
// from holding the whole clip as base64 in JS heap. The native side writes
// straight to an app-cache file; JS reads that file as a Blob via the
// Capacitor file scheme without a base64 round-trip.

const MicRecorder = registerPlugin('MicRecorder');

function isAndroid() {
  try {
    return Capacitor.getPlatform?.() === 'android';
  } catch {
    return false;
  }
}

export async function requestMicPermission() {
  if (!isAndroid()) return { value: true };
  return await MicRecorder.requestPermission();
}

// Returns 'idle' | 'recording' | 'paused'. Used by RecordingGuard to detect
// a recording the user navigated away from. Safe to call before any
// startRecording happens; returns 'idle' on web/iOS.
export async function getMicStatus() {
  if (!isAndroid()) return 'idle';
  try {
    const res = await MicRecorder.getStatus();
    return res?.status || 'idle';
  } catch {
    return 'idle';
  }
}

// Returns { filePath } — the native side also persists it, so the file can
// be found again after a process kill (see getOrphanRecording).
export async function startMicRecording() {
  return (await MicRecorder.startRecording()) || {};
}

export async function pauseMicRecording() {
  await MicRecorder.pauseRecording();
}

export async function resumeMicRecording() {
  await MicRecorder.resumeRecording();
}

// Returns { filePath, mimeType, sizeBytes, recovered, stopError?,
// recorderError?, durationSec?, validBytes? }. recovered=true means the
// recorder had failed (usually a phone call taking the mic) and this is the
// audio written up to that point; durationSec is then the real recorded
// length, which the JS timer overstates.
export async function stopMicRecording() {
  const res = await MicRecorder.stopRecording();
  return res?.value || null;
}

// A recording file left by an app process that died mid-recording.
// Returns { filePath, mimeType, sizeBytes, durationSec, validBytes,
// startedAtMs, lastModifiedMs } or null. sinceMs lets the native side find
// files from app versions that didn't persist the path yet.
export async function getOrphanRecording({ sinceMs } = {}) {
  if (!isAndroid()) return null;
  try {
    const res = await MicRecorder.getOrphanRecording(
      sinceMs ? { sinceMs: Math.floor(sinceMs) } : {}
    );
    return res?.value || null;
  } catch {
    // Older APK without this method.
    return null;
  }
}

// Fires cb({ what, extra }) when the native MediaRecorder errors out
// mid-recording. Returns an unsubscribe function.
export function onMicRecorderError(cb) {
  if (!isAndroid()) return () => {};
  let handle = null;
  let removed = false;
  Promise.resolve(MicRecorder.addListener('recorderError', cb))
    .then((h) => {
      handle = h;
      if (removed) h?.remove?.();
    })
    .catch(() => {});
  return () => {
    removed = true;
    handle?.remove?.();
  };
}

export async function discardMicRecording() {
  try {
    await MicRecorder.discardRecording();
  } catch {}
}

// Called after upload to delete the cached file. Best-effort; if the file
// is already gone (e.g. cache cleared) this just no-ops.
export async function cleanupRecordingFile(filePath) {
  if (!filePath) return;
  try {
    await MicRecorder.cleanupFile({ filePath });
  } catch {}
}

// Read the recording file into a Blob without bouncing through base64.
// Capacitor.convertFileSrc rewrites the absolute filesystem path into a
// WebView-readable URL (capacitor://localhost/_capacitor_file_/...) which
// fetch() can stream into a Blob with a single in-memory copy.
export async function readRecordingAsBlob({ filePath, mimeType, validBytes }) {
  const url = Capacitor.convertFileSrc(filePath);
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Could not read recording file (${response.status})`);
  }
  let blob = await response.blob();
  // A file cut off by a process kill can end mid-frame; drop the partial
  // tail so decoders don't choke on it.
  if (validBytes > 0 && validBytes < blob.size) blob = blob.slice(0, validBytes, blob.type);
  // The fetched blob's type may be empty or text/plain depending on how
  // the WebView serves the file scheme — force the real mime so downstream
  // upload + transcription don't get confused.
  if (mimeType && blob.type !== mimeType) {
    return blob.slice(0, blob.size, mimeType);
  }
  return blob;
}
