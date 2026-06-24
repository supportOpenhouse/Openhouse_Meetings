import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import SalesShell from '@/components/SalesShell';
import { teamMapData, myMapData } from '@/lib/salesMapQueries';
import SalesMapClient from './client';

export const dynamic = 'force-dynamic';

export default async function SalesMapPage() {
  const session = await auth();
  if (!session?.user) redirect('/login');

  const role = session.user.role;
  if (role !== 'supply_rm' && role !== 'admin') {
    redirect(role === 'admin' ? '/admin' : '/dashboard');
  }

  // Admins watch the whole team; reps see their own day.
  const initial = role === 'admin' ? await teamMapData() : await myMapData(session.user.id);

  return (
    <SalesShell user={session.user} current="map">
      <SalesMapClient
        initial={JSON.parse(JSON.stringify(initial))}
        user={{
          id: session.user.id,
          name: session.user.name || '',
          email: session.user.email,
          role,
        }}
        mapsKey={process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || ''}
      />
    </SalesShell>
  );
}
