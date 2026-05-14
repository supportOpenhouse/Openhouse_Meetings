'use client';

import { CheckCircle2, AlertCircle } from 'lucide-react';

export default function Toast({ toast }) {
  if (!toast) return null;
  return (
    <div className={`oh-toast ${toast.type || ''}`}>
      {toast.type === 'success' && <CheckCircle2 size={16} />}
      {toast.type === 'error' && <AlertCircle size={16} />}
      {toast.msg}
    </div>
  );
}
