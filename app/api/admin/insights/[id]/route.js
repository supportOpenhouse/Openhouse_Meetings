import { NextResponse } from 'next/server';
import { neon } from '@neondatabase/serverless';
import { auth } from '@/auth';

export const runtime = 'nodejs';

// DELETE /api/admin/insights/[id]
// Removes a generated insight row — used by the "Delete" button on saved
// insight cards. If the deleted row happened to be the latest for its key,
// the next-most-recent generation will surface on the next page load.
export async function DELETE(request, { params }) {
  const session = await auth();
  if (!session?.user || session.user.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  const { id } = await params;

  const sql = neon(process.env.DATABASE_URL);
  const rows = await sql`DELETE FROM insights WHERE id = ${id} RETURNING id`;
  if (rows.length === 0) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json({ ok: true });
}
