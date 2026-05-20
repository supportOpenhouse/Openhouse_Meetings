import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { touchLastSeen } from '@/lib/activityLog';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Called every ~60s from AppShell while a user is on an authenticated page.
// Only updates users.last_seen_at — does NOT write to activity_logs (would
// be too noisy). "Online now" is derived from last_seen_at + a recent window.
export async function POST() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }
  await touchLastSeen(session.user.id);
  return NextResponse.json({ ok: true });
}
