import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { listRMs, createRM, getUserByEmail } from '@/lib/queries';

export const runtime = 'nodejs';

export async function GET() {
  const session = await auth();
  if (!session?.user || session.user.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  const rms = await listRMs();
  return NextResponse.json({ rms });
}

export async function POST(req) {
  const session = await auth();
  if (!session?.user || session.user.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const body = await req.json();
  const email = body.email?.toString().trim().toLowerCase();
  const name = body.name?.toString().trim() || null;
  const role = ['admin', 'direct_rm', 'rm'].includes(body.role) ? body.role : 'rm';

  if (!email || !email.includes('@')) {
    return NextResponse.json({ error: 'valid email required' }, { status: 400 });
  }

  const existing = await getUserByEmail(email);
  if (existing) {
    return NextResponse.json({ error: 'user with this email already exists' }, { status: 409 });
  }

  const u = await createRM({ email, name, role, created_by: session.user.id });
  return NextResponse.json({ rm: u });
}
