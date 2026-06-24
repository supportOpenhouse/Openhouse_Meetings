import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Reports the build id of the CURRENTLY DEPLOYED server. VersionGate (client)
// compares it against the build id baked into the running bundle; a mismatch
// means a newer deploy is live and the client should refresh. Never cached.
export async function GET() {
  return NextResponse.json(
    { buildId: process.env.NEXT_PUBLIC_BUILD_ID || 'dev' },
    { headers: { 'Cache-Control': 'no-store, max-age=0' } }
  );
}
