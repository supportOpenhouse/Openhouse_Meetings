import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import { teamMapData } from '@/lib/salesMapQueries';
import SalesMapClient from '@/app/supply/map/client';

export const dynamic = 'force-dynamic';

// Supply oversight: the all-reps live map. Admins + supply managers only.
export default async function AdminSupplyMapPage() {
  const session = await auth();
  if (!session?.user) redirect('/login');
  const role = session.user.role;
  if (role !== 'admin' && role !== 'supply_manager') {
    redirect(role === 'supply_rm' ? '/supply' : '/dashboard');
  }

  const initial = await teamMapData();

  return (
    <>
      <SalesMapClient
        initial={JSON.parse(JSON.stringify(initial))}
        user={{ id: session.user.id, name: session.user.name || '', email: session.user.email, role }}
        mapsKey={process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || ''}
      />
    </>
  );
}
