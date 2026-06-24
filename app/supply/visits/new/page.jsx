import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import SalesShell from '@/components/SalesShell';
import SalesNewVisitClient from './client';

export const dynamic = 'force-dynamic';

export default async function SalesNewVisitPage({ searchParams }) {
  const session = await auth();
  if (!session?.user) redirect('/login');

  const role = session.user.role;
  if (role !== 'supply_rm' && role !== 'admin') {
    redirect(role === 'admin' ? '/admin' : '/dashboard');
  }

  const sp = await searchParams;
  const preselectedCpId = typeof sp?.cp === 'string' ? sp.cp : null;

  return (
    <SalesShell user={session.user} current="new">
      <SalesNewVisitClient
        user={{ id: session.user.id, name: session.user.name || '', email: session.user.email }}
        preselectedCpId={preselectedCpId}
      />
    </SalesShell>
  );
}
