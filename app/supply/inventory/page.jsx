import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import { listInventoryForRm } from '@/lib/salesInventoryQueries';
import { listSalesCps } from '@/lib/salesQueries';
import InventoryClient from './client';

export const dynamic = 'force-dynamic';

export default async function SalesInventoryPage() {
  const session = await auth();
  if (!session?.user) redirect('/login');

  const role = session.user.role;
  if (role !== 'supply_rm' && role !== 'admin') {
    redirect(role === 'admin' ? '/admin' : '/dashboard');
  }

  const [inventory, cps] = await Promise.all([
    listInventoryForRm(session.user.id),
    listSalesCps({}),
  ]);

  return (
      <InventoryClient
        initial={JSON.parse(JSON.stringify(inventory))}
        cps={JSON.parse(JSON.stringify(cps))}
        user={{
          id: session.user.id,
          name: session.user.name || '',
          email: session.user.email,
          role,
        }}
      />
  );
}
