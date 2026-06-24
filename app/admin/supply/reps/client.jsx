'use client';

import { Users } from 'lucide-react';
import { AdminSalesTabs, RepCard } from '@/components/SalesAdmin';

export default function AdminSalesRepsClient({ reps }) {
  return (
    <div className="oh-sales">
      <AdminSalesTabs current="reps" />

      <h1 className="oh-h1" style={{ fontSize: 36 }}>
        Sales <em>reps</em>
      </h1>
      <p className="oh-sub">
        {reps.length} {reps.length === 1 ? 'rep' : 'reps'}, ranked by visits logged.
      </p>

      {reps.length === 0 ? (
        <div className="sx-empty">
          <div className="ico">
            <Users size={22} />
          </div>
          <div className="t">No supply reps yet</div>
          <div className="s">Assign a user the “supply_rm” role to get started.</div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {reps.map((rep) => (
            <RepCard key={rep.id} rep={rep} />
          ))}
        </div>
      )}
    </div>
  );
}
