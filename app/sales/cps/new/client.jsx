'use client';

import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import CpForm from '@/components/CpForm';

export default function SalesCpNewClient() {
  const router = useRouter();

  const handleSubmit = async (payload) => {
    const res = await fetch('/api/sales/cps', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data?.error || `Could not register partner (${res.status})`);
    }
    const { cp } = await res.json();
    router.push(`/sales/cps/${cp.id}`);
  };

  return (
    <div>
      <Link href="/sales/cps" className="sx-back">
        <ArrowLeft size={16} /> Partners
      </Link>
      <h1 className="oh-h1" style={{ marginTop: 8 }}>
        Register a <em>partner</em>
      </h1>
      <p className="oh-sub">Add a channel partner to the shared registry.</p>

      <CpForm submitLabel="Register partner" onSubmit={handleSubmit} />

      <style jsx>{`
        .sx-back {
          all: unset;
          cursor: pointer;
          display: inline-flex;
          align-items: center;
          gap: 6px;
          font-size: 13px;
          color: var(--accent);
          font-weight: 500;
        }
      `}</style>
    </div>
  );
}
