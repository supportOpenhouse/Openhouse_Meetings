import { getMicStatus, getOrphanRecording } from '@/lib/micRecorder';
import { getRecordingSession } from '@/lib/recordingSession';

// Recovery for recordings whose app process was killed mid-recording — most
// often an OEM battery manager during a phone call. The native recorder's
// file survives in app cache and the recording session (form metadata)
// survives in localStorage; this pairs them back up so the owning page can
// offer "Recover previous recording" instead of a blank form.
//
// Used by RecordingGuard (redirect + telemetry) and by the owning pages
// (/new-meeting for flow 'demand', /supply/visits/new for flow 'supply').

// The native side persists the file path when the mic starts, which is
// after the JS session is created — so a file much older than the session
// belongs to some earlier recording whose metadata is gone.
const SESSION_MATCH_SLACK_MS = 60_000;

function sessionFlow(sess) {
  return sess?.flow || 'demand';
}

function orphanMatchesSession(orphan, sess) {
  if (!orphan?.startedAtMs || !sess?.startedAtMs) return true;
  return orphan.startedAtMs >= sess.startedAtMs - SESSION_MATCH_SLACK_MS;
}

// Returns { sess, orphan } when a killed recording can be recovered, else
// null. Pass `flow` to only match sessions owned by that page.
export async function findRecoverableRecording(flow) {
  const status = await getMicStatus();
  // A live recording is restored by the normal resume path, not this one.
  if (status === 'recording' || status === 'paused') return null;
  const sess = getRecordingSession();
  if (!sess) return null;
  if (flow && sessionFlow(sess) !== flow) return null;
  // Recording already stopped and handed to the upload flow.
  if (sess.step === 'finalized') return null;
  const orphan = await getOrphanRecording({ sinceMs: sess.startedAtMs });
  if (!orphan || !orphanMatchesSession(orphan, sess)) return null;
  return { sess, orphan };
}

