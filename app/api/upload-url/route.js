import { handleUpload } from '@vercel/blob/client';
import { put as blobPut, del as blobDel } from '@vercel/blob';
import { NextResponse } from 'next/server';
import { auth } from '@/auth';

export const runtime = 'nodejs';

// Generates a single-use token the browser uses to upload directly to Vercel Blob.
// Required because Vercel serverless functions cap request bodies at 4.5 MB —
// a 60-min recording is ~11 MB.

function tokenFingerprint(token) {
  if (!token) return null;
  // vercel_blob_rw_<storeId>_<secret> — surface the store hint, never the secret.
  const m = /^vercel_blob_(rw|ro)_([A-Za-z0-9]+)_/.exec(token);
  return m ? { kind: m[1], storeHint: m[2], length: token.length } : { kind: 'unknown', length: token.length };
}

// Preflight: lets the client confirm the server has a token wired up
// before recording, so we fail fast with a clear message instead of stalling at 0%.
// Also supports ?selftest=1 to perform a tiny server-side put() — this bypasses the
// browser CORS shield, so the actual error from Vercel Blob is captured in our logs.
export async function GET(request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  const fp = tokenFingerprint(token);

  const url = new URL(request.url);
  if (url.searchParams.get('selftest') === '1') {
    if (!token) {
      return NextResponse.json({ ok: false, error: 'No token configured' }, { status: 500 });
    }
    const probePath = `meetings/${session.user.id}/_probe-${Date.now()}.txt`;
    try {
      const res = await blobPut(probePath, 'ok', {
        access: 'public',
        token,
        contentType: 'text/plain',
        addRandomSuffix: false,
      });
      // Clean up immediately so we don't litter the store.
      try {
        await blobDel(res.url, { token });
      } catch (e) {
        console.warn('[upload-url] selftest cleanup failed', e?.message);
      }
      console.log('[upload-url] selftest OK', { storeHint: fp?.storeHint, url: res.url });
      return NextResponse.json({
        ok: true,
        selftest: 'passed',
        token: fp,
        probedUrl: res.url,
      });
    } catch (e) {
      console.error('[upload-url] selftest FAILED', {
        message: e?.message,
        name: e?.name,
        cause: e?.cause?.message,
        storeHint: fp?.storeHint,
      });
      return NextResponse.json(
        {
          ok: false,
          selftest: 'failed',
          token: fp,
          error: e?.message || 'put() failed',
        },
        { status: 500 }
      );
    }
  }

  return NextResponse.json({
    ok: !!token,
    token: fp,
  });
}

export async function POST(request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    console.error('[upload-url] BLOB_READ_WRITE_TOKEN is not configured');
    return NextResponse.json(
      { error: 'BLOB_READ_WRITE_TOKEN is not configured' },
      { status: 500 }
    );
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const fp = tokenFingerprint(process.env.BLOB_READ_WRITE_TOKEN);
  console.log('[upload-url] handleUpload start', {
    userId: session.user.id,
    bodyType: body?.type,
    pathname: body?.payload?.pathname,
    contentType: body?.payload?.callbackUrl ? undefined : body?.payload?.contentType,
    tokenStoreHint: fp?.storeHint,
    tokenKind: fp?.kind,
  });

  try {
    const jsonResponse = await handleUpload({
      body,
      request,
      token: process.env.BLOB_READ_WRITE_TOKEN,
      onBeforeGenerateToken: async (pathname, clientPayload, multipart) => {
        // Force the path into a user-scoped namespace so users can't write to each other's prefixes
        const userPrefix = `meetings/${session.user.id}/`;
        if (!pathname.startsWith(userPrefix)) {
          console.warn('[upload-url] rejected pathname', { pathname, userPrefix });
          throw new Error('Invalid path');
        }
        console.log('[upload-url] generating client token', { pathname, multipart });
        return {
          // audio/* are what we normally send. video/webm + video/mp4 are
          // tolerated because some OS file pickers (Android) mislabel a
          // restored .webm/.mp4 as video/* — the bytes are still our audio
          // recording, so accept rather than block the upload.
          allowedContentTypes: [
            'audio/webm',
            'audio/webm;codecs=opus',
            'audio/mp4',
            'audio/m4a',
            'audio/x-m4a',
            'audio/aac',
            'audio/ogg',
            'audio/mpeg',
            'audio/mp3',
            'audio/wav',
            'audio/x-wav',
            'audio/amr',
            'audio/3gpp',
            'video/webm',
            'video/mp4',
          ],
          maximumSizeInBytes: 500 * 1024 * 1024, // 500 MB ceiling
          // Append a random suffix so a retry (after a failed /create or a
          // stalled commit) doesn't fail with "blob already exists" — the
          // deterministic CP+timestamp filename would otherwise collide with
          // whatever bytes the previous attempt committed. The client cannot
          // set this itself; it has to be authorised here at token-sign time.
          addRandomSuffix: true,
          tokenPayload: JSON.stringify({
            userId: session.user.id,
            email: session.user.email,
          }),
        };
      },
      onUploadCompleted: async ({ blob }) => {
        console.log('[upload-url] upload completed', { url: blob?.url, size: blob?.size });
        // (the meeting row is created by /api/process-meeting after transcription)
      },
    });

    return NextResponse.json(jsonResponse);
  } catch (e) {
    console.error('[upload-url] handleUpload error', {
      message: e?.message,
      name: e?.name,
      stack: e?.stack?.split('\n').slice(0, 4).join('\n'),
    });
    return NextResponse.json({ error: e.message || 'Upload token failed' }, { status: 400 });
  }
}
