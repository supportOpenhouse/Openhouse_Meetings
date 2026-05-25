'use client';

import { upload } from '@vercel/blob/client';
import { buildRecordingFilename, withCorrectMime } from '@/lib/recordingName';

// Single source of truth for "send a recording to the server". Used by:
//   - app/new-meeting/client.jsx (live flow)
//   - components/PendingUploads.jsx (retry of an IndexedDB-queued recording)
//
// Caller passes in callbacks for progress / stall reporting; the function
// itself doesn't touch React state. Throws on any failure — caller decides
// whether to surface the error or fall back to the local queue.
//
// Returns the new meeting id on success.

export async function uploadAndCreateMeeting({
  blob,
  form,
  durSec,
  userId,
  startedAt,
  onProgress, // (pct: number) => void
  onStatus,   // ('preflight'|'uploading'|'creating') => void
} = {}) {
  if (!blob) throw new Error('blob is required');
  if (!form) throw new Error('form is required');

  // Single chokepoint for MIME correctness — covers fresh recordings, retries
  // of older mis-tagged queue items, and restored device files alike. Magic
  // bytes decide the real container regardless of what blob.type claims.
  blob = await withCorrectMime(blob);

  onStatus?.('preflight');
  const pre = await fetch('/api/upload-url', { method: 'GET' });
  if (!pre.ok) throw new Error(`Preflight returned ${pre.status}`);
  const preJson = await pre.json();
  if (!preJson.ok) {
    const err = new Error(
      'Server is not configured for uploads (BLOB_READ_WRITE_TOKEN missing).'
    );
    err.code = 'upload-config';
    throw err;
  }

  onStatus?.('uploading');
  // Structured, self-describing name. Extension matches the real recording
  // format (webm on Android, m4a on iOS).
  const filename = `meetings/${userId}/${buildRecordingFilename(
    form,
    startedAt,
    durSec,
    blob.type
  )}`;

  const newBlob = await upload(filename, blob, {
    access: 'public',
    handleUploadUrl: '/api/upload-url',
    contentType: blob.type || 'audio/webm',
    // Each retry gets a fresh blob path — prevents the "blob already exists"
    // error when re-uploading from the IndexedDB queue after an earlier
    // attempt partially or fully committed without our client seeing it.
    addRandomSuffix: true,
    onUploadProgress: (e) => {
      const pct = Math.round(e.percentage || 0);
      onProgress?.(pct);
    },
  });

  // Empty strings → null. Some flows (direct-RM visit, onboarding) leave
  // optional fields blank; the schema and dashboard expect null, not ''.
  const nz = (v) => {
    if (v == null) return null;
    const s = String(v).trim();
    return s === '' ? null : s;
  };

  onStatus?.('creating');
  const createRes = await fetch('/api/meetings/create', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      audio_url: newBlob.url,
      cp_code: form.is_onboarding ? null : nz(form.cp_code),
      cp_mobile: nz(form.cp_mobile),
      cp_name: nz(form.cp_name),
      cp_city: form.is_onboarding ? null : nz(form.cp_city),
      purpose: form.is_onboarding ? null : nz(form.purpose),
      meeting_type: form.is_onboarding ? 'onboarding' : form.meeting_type,
      duration_seconds: durSec,
      started_at: startedAt,
      // Carried through from the IndexedDB-queued form when present.
      location_lat: form.location_lat ?? null,
      location_lng: form.location_lng ?? null,
      location_accuracy: form.location_accuracy ?? null,
    }),
    keepalive: true,
  });
  if (!createRes.ok) {
    const errData = await createRes.json().catch(() => ({}));
    throw new Error(errData.error || `Create returned ${createRes.status}`);
  }
  const { id: meetingId } = await createRes.json();

  // Fire-and-forget the heavy server-side processing. keepalive:true ensures
  // the request survives the navigation the caller is about to do.
  try {
    fetch(`/api/meetings/${meetingId}/process`, { method: 'POST', keepalive: true });
  } catch {}

  return meetingId;
}
