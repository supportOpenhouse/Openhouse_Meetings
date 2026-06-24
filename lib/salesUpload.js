'use client';

import { upload } from '@vercel/blob/client';
import { buildRecordingFilename, withCorrectMime } from '@/lib/recordingName';
import { track } from '@/lib/track';

// Field-sales upload helpers. Split into upload-audio and create-visit so the
// new-visit screen can push the audio to Vercel Blob in the BACKGROUND while the
// rep fills the assessment form — by the time they hit Submit the upload is
// usually already done, so saving feels instant.

// Uploads just the audio to Vercel Blob (via the shared /api/upload-url token
// route). Returns the public blob URL. Throws on failure.
export async function uploadVisitAudio({
  blob,
  durSec,
  userId,
  cp,
  startedAt,
  onProgress,
  onStatus,
} = {}) {
  if (!blob) throw new Error('blob is required');

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
  // The blob lands under meetings/{userId}/ (the path the shared upload route
  // authorises) — it's just storage. The filename stays self-describing.
  const filename = `meetings/${userId}/${buildRecordingFilename(
    {
      cp_code: cp?.cp_id || 'SALES',
      cp_mobile: cp?.phone_primary || '',
      cp_name: cp?.cp_name || '',
      meeting_type: 'first_visit',
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

  onStatus?.('done');
  track('visit_audio_uploaded', { cp_code: cp?.cp_id || null, duration_seconds: durSec });
  return newBlob.url;
}

// Creates the visit row from the manual form + the already-uploaded audio URL,
// then fires the background processor (fire-and-forget, keepalive). Returns the
// new visit id.
export async function createSalesVisit({ visit, audioUrl, durSec } = {}) {
  if (!visit?.cp_code) throw new Error('cp_code is required');
  if (!audioUrl) throw new Error('audioUrl is required');

  const createRes = await fetch('/api/sales/visits', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      ...visit,
      audio_url: audioUrl,
      duration_seconds: durSec,
    }),
    keepalive: true,
  });
  if (!createRes.ok) {
    const errData = await createRes.json().catch(() => ({}));
    track('visit_create_failed', { cp_code: visit.cp_code, status: createRes.status });
    throw new Error(errData.error || `Create returned ${createRes.status}`);
  }
  const { id: visitId } = await createRes.json();
  track('visit_created', {
    cp_code: visit.cp_code,
    meeting_type: visit.meeting_type || null,
    duration_seconds: durSec,
    inventory_received: visit.inventory_received === true,
  });

  try {
    fetch(`/api/sales/visits/${visitId}/process`, { method: 'POST', keepalive: true });
  } catch {}

  return visitId;
}

// Back-compat one-shot: upload then create.
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
  const audioUrl = await uploadVisitAudio({ blob, durSec, userId, cp, startedAt, onProgress, onStatus });
  onStatus?.('creating');
  return createSalesVisit({ visit, audioUrl, durSec });
}
