import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import { supplyInsightsData } from '@/lib/supplyInsights';
import SupplyInsightsClient from './client';

export const dynamic = 'force-dynamic';

// Supply Insights — the field-visit analog of the demand /admin/insights page.
// Admins + supply managers.
export default async function SupplyInsightsPage() {
  const session = await auth();
  if (!session?.user) redirect('/login');
  const role = session.user.role;
  if (role !== 'admin' && role !== 'supply_manager') {
    redirect(role === 'supply_rm' ? '/supply' : '/dashboard');
  }

  const initial = await supplyInsightsData(90);

  return (
    <>
      <SupplyInsightsClient initial={JSON.parse(JSON.stringify(initial))} />
    </>
  );
}
