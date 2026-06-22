import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { updateRM, deleteRM } from '@/lib/queries';

export const runtime = 'nodejs';

export async function PATCH(req, { params }) {
  const session = await auth();
  if (!session?.user || session.user.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  const { id } = await params;
  if (id === session.user.id) {
    return NextResponse.json({ error: 'Cannot modify your own account here' }, { status: 400 });
  }

  const body = await req.json();
  const patch = {};
  if (typeof body.is_active === 'boolean') patch.is_active = body.is_active;
  if (['admin', 'rm', 'direct_rm', 'sales_rm'].includes(body.role)) patch.role = body.role;
  if (typeof body.name === 'string') patch.name = body.name.trim() || null;

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: 'nothing to update' }, { status: 400 });
  }

  const u = await updateRM(id, patch);
  return NextResponse.json({ rm: u });
}

export async function DELETE(req, { params }) {
  const session = await auth();
  if (!session?.user || session.user.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  const { id } = await params;
  if (id === session.user.id) {
    return NextResponse.json({ error: 'Cannot delete your own account' }, { status: 400 });
  }
  try {
    await deleteRM(id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json(
      { error: 'Cannot delete — RM has meetings. Deactivate instead.' },
      { status: 409 }
    );
  }
}
