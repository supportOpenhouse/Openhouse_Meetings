'use client';

import { upload } from '@vercel/blob/client';
import { buildRecordingFilename, withCorrectMime } from '@/lib/recordingName';

// "Send a sales visit to the server" — the field-sales analogue of
// lib/uploadMeeting.js. Uploads the audio straight to Vercel Blob (reusing the
// shared /api/upload-url token route), creates the visit row via
// /api/sales/visits, then fires the background processor. Returns the new
// visit id. Throws on any failure — the caller decides whether to surface it.
//
// `visit` carries the manual form fields; `cp` carries the partner snapshot used
// only to build a self-describing filename.

export async function uploadAndCreateVisit({
  blob,
  durSec,
  userId,
  cp,
  visit,
  startedAt,
  onProgress,
  onStatus,
} = {}) {
  if (!blob) throw new Error('blob is required');
  if (!visit?.sales_cp_id) throw new Error('sales_cp_id is required');

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
  // Reuse the meeting filename builder — it just needs cp_code/name/type to make
  // a self-describing name. The blob still lands under meetings/{userId}/ (the
  // path the shared upload route authorises), which is fine — it's just storage.
  const filename = `meetings/${userId}/${buildRecordingFilename(
    {
      cp_code: cp?.cp_id || 'SALES',
      cp_mobile: cp?.phone_primary || '',
      cp_name: cp?.cp_name || '',
      meeting_type: visit.meeting_type || 'first_visit',
      is_onboarding: false,
    },
    startedAt,
    durSec,
    blob.type
  )}`;

  const newBlob = await upload(filename, blob, {
    access: 'public',
    handleUploadUrl: '/api/upload-url',
    contentType: blob.type || 'audio/webm',
    onUploadProgress: (e) => onProgress?.(Math.round(e.percentage || 0)),
  });

  onStatus?.('creating');
  const createRes = await fetch('/api/sales/visits', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      ...visit,
      audio_url: newBlob.url,
      duration_seconds: durSec,
    }),
    keepalive: true,
  });
  if (!createRes.ok) {
    const errData = await createRes.json().catch(() => ({}));
    throw new Error(errData.error || `Create returned ${createRes.status}`);
  }
  const { id: visitId } = await createRes.json();

  // Fire-and-forget the heavy server-side processing; keepalive survives the
  // navigation the caller is about to do.
  try {
    fetch(`/api/sales/visits/${visitId}/process`, { method: 'POST', keepalive: true });
  } catch {}

  return visitId;
}
