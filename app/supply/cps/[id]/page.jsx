import { redirect, notFound } from 'next/navigation';
import { auth } from '@/auth';
import { getInventoryCpByCode } from '@/lib/salesCp';
import { listSalesVisitsByCpCode, listInventoryByCpCode } from '@/lib/salesQueries';
import SalesCpDetailClient from './client';

export const dynamic = 'force-dynamic';

// The dynamic segment is the real cp_code (CP05443…) from the external inventory.
export default async function SalesCpDetailPage({ params }) {
  const session = await auth();
  if (!session?.user) redirect('/login');

  const role = session.user.role;
  if (role !== 'supply_rm' && role !== 'admin') {
    redirect(role === 'admin' ? '/admin' : '/dashboard');
  }

  const { id } = await params;
  const code = decodeURIComponent(id || '');
  const cp = await getInventoryCpByCode(code);
  if (!cp) notFound();

  const [visits, inventory] = await Promise.all([
    listSalesVisitsByCpCode(cp.cp_code, 50),
    listInventoryByCpCode(cp.cp_code, 50),
  ]);

  return (
      <SalesCpDetailClient
        cp={JSON.parse(JSON.stringify(cp))}
        visits={JSON.parse(JSON.stringify(visits))}
        inventory={JSON.parse(JSON.stringify(inventory))}
      />
  );
}
