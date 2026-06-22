import { redirect, notFound } from 'next/navigation';
import { auth } from '@/auth';
import SalesShell from '@/components/SalesShell';
import { getSalesVisitById } from '@/lib/salesQueries';
import SalesVisitDetailClient from './client';

export const dynamic = 'force-dynamic';

export default async function SalesVisitDetailPage({ params }) {
  const session = await auth();
  if (!session?.user) redirect('/login');

  const role = session.user.role;
  if (role !== 'sales_rm' && role !== 'admin') {
    redirect(role === 'admin' ? '/admin' : '/dashboard');
  }

  const { id } = await params;
  const visit = await getSalesVisitById(id);
  if (!visit) notFound();

  if (visit.sales_rm_id !== session.user.id && role !== 'admin') {
    redirect('/sales');
  }

  return (
    <SalesShell user={session.user} current="home">
      <SalesVisitDetailClient initialVisit={JSON.parse(JSON.stringify(visit))} />
    </SalesShell>
  );
}
