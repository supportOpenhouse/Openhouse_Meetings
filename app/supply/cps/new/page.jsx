import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import SalesShell from '@/components/SalesShell';
import SalesCpNewClient from './client';

export const dynamic = 'force-dynamic';

export default async function SalesCpNewPage() {
  const session = await auth();
  if (!session?.user) redirect('/login');

  const role = session.user.role;
  if (role !== 'supply_rm' && role !== 'admin') {
    redirect(role === 'admin' ? '/admin' : '/dashboard');
  }

  return (
    <SalesShell user={session.user} current="cps">
      <SalesCpNewClient />
    </SalesShell>
  );
}
