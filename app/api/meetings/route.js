import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { listAllMeetings, listMeetingsForRM } from '@/lib/queries';

export const runtime = 'nodejs';

export async function GET(req) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const url = new URL(req.url);
  const role = session.user.role;
  const userId = session.user.id;

  if (role === 'admin') {
    const rmFilter = url.searchParams.get('rm');
    const since = url.searchParams.get('since');
    const sinceDate = since ? new Date(since) : null;
    const meetings = await listAllMeetings({ rmFilter, since: sinceDate });
    return NextResponse.json({ meetings });
  }

  const meetings = await listMeetingsForRM(userId);
  return NextResponse.json({ meetings });
}
