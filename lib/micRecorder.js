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

export async function startMicRecording() {
  await MicRecorder.startRecording();
}

export async function pauseMicRecording() {
  await MicRecorder.pauseRecording();
}

export async function resumeMicRecording() {
  await MicRecorder.resumeRecording();
}

// Returns { filePath, mimeType, sizeBytes }.
export async function stopMicRecording() {
  const res = await MicRecorder.stopRecording();
  return res?.value || null;
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
export async function readRecordingAsBlob({ filePath, mimeType }) {
  const url = Capacitor.convertFileSrc(filePath);
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Could not read recording file (${response.status})`);
  }
  const blob = await response.blob();
  // The fetched blob's type may be empty or text/plain depending on how
  // the WebView serves the file scheme — force the real mime so downstream
  // upload + transcription don't get confused.
  if (mimeType && blob.type !== mimeType) {
    return blob.slice(0, blob.size, mimeType);
  }
  return blob;
}
