import { handleUpload } from '@vercel/blob/client';
import { NextResponse } from 'next/server';
import { auth } from '@/auth';

export const runtime = 'nodejs';

// Generates a single-use token the browser uses to upload directly to Vercel Blob.
// Required because Vercel serverless functions cap request bodies at 4.5 MB —
// a 60-min recording is ~11 MB.

export async function POST(request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!process.env.BLOB_READ_WRITE_TOKEN) {
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

  try {
    const jsonResponse = await handleUpload({
      body,
      request,
      token: process.env.BLOB_READ_WRITE_TOKEN,
      onBeforeGenerateToken: async (pathname) => {
        // Force the path into a user-scoped namespace so users can't write to each other's prefixes
        const userPrefix = `meetings/${session.user.id}/`;
        if (!pathname.startsWith(userPrefix)) {
          throw new Error('Invalid path');
        }
        return {
          allowedContentTypes: [
            'audio/webm',
            'audio/webm;codecs=opus',
            'audio/mp4',
            'audio/ogg',
            'audio/mpeg',
            'audio/wav',
          ],
          maximumSizeInBytes: 500 * 1024 * 1024, // 500 MB ceiling
          tokenPayload: JSON.stringify({
            userId: session.user.id,
            email: session.user.email,
          }),
        };
      },
      onUploadCompleted: async ({ blob }) => {
        // Hook for analytics / audit — kept empty intentionally
        // (the meeting row is created by /api/process-meeting after transcription)
      },
    });

    return NextResponse.json(jsonResponse);
  } catch (e) {
    return NextResponse.json({ error: e.message || 'Upload token failed' }, { status: 400 });
  }
}
