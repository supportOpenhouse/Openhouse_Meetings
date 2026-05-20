// Browser-only IndexedDB queue for meetings that finished recording but
// couldn't (or didn't) get uploaded — typically because the RM was offline or
// the connection stalled. The recording (Blob) and its form metadata sit here
// until the user retries from the dashboard banner.
//
// Storage shape (one row per pending recording):
//   {
//     id: string,                  // crypto.randomUUID()
//     blob: Blob,                  // the actual audio bytes
//     mime: string,
//     duration_seconds: number,
//     form: {                      // everything the create endpoint needs
//       cp_code, cp_mobile, cp_name, cp_city, purpose, meeting_type,
//       is_onboarding: boolean,
//     },
//     started_at: string,          // ISO of when recording started
//     created_at: string,          // ISO of when we queued it
//   }

const DB_NAME = 'oh-meetings-queue';
const DB_VERSION = 1;
const STORE_NAME = 'pending';

function openDb() {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB is not available in this environment'));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        store.createIndex('created_at', 'created_at');
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function tx(db, mode = 'readonly') {
  return db.transaction(STORE_NAME, mode).objectStore(STORE_NAME);
}

export async function saveLocalRecording({ blob, durSec, form, startedAt }) {
  const db = await openDb();
  const id = (crypto.randomUUID && crypto.randomUUID()) || `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  const row = {
    id,
    blob,
    mime: blob.type || 'audio/webm',
    duration_seconds: durSec,
    form,
    started_at: startedAt || new Date().toISOString(),
    created_at: new Date().toISOString(),
  };
  await new Promise((resolve, reject) => {
    const op = tx(db, 'readwrite').put(row);
    op.onsuccess = () => resolve();
    op.onerror = () => reject(op.error);
  });
  return id;
}

export async function listLocalRecordings() {
  try {
    const db = await openDb();
    return await new Promise((resolve, reject) => {
      const op = tx(db).getAll();
      op.onsuccess = () => {
        // Drop the blob from the listing payload — callers that need it call
        // getLocalRecording. Listings stay cheap to render.
        const rows = (op.result || []).map((r) => ({
          id: r.id,
          mime: r.mime,
          duration_seconds: r.duration_seconds,
          form: r.form,
          started_at: r.started_at,
          created_at: r.created_at,
          blob_bytes: r.blob?.size || 0,
        }));
        rows.sort((a, b) => a.created_at.localeCompare(b.created_at));
        resolve(rows);
      };
      op.onerror = () => reject(op.error);
    });
  } catch (e) {
    console.warn('[localQueue] list failed', e?.message || e);
    return [];
  }
}

export async function getLocalRecording(id) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const op = tx(db).get(id);
    op.onsuccess = () => resolve(op.result || null);
    op.onerror = () => reject(op.error);
  });
}

export async function deleteLocalRecording(id) {
  try {
    const db = await openDb();
    await new Promise((resolve, reject) => {
      const op = tx(db, 'readwrite').delete(id);
      op.onsuccess = () => resolve();
      op.onerror = () => reject(op.error);
    });
  } catch (e) {
    console.warn('[localQueue] delete failed', e?.message || e);
  }
}
