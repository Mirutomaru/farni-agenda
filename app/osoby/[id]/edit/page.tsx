// FARNÍ AGENDA - UPRAVIT OSOBU (/osoby/[id]/edit)
// Formulář pro úpravu existujícího záznamu osoby
// Pozn.: v Next 16 je `params` Promise — ve client komponentě se unwrapuje přes React.use()

'use client';

import { use } from 'react';
import Link from 'next/link';
import OsobaForm from '@/components/features/osoba-form';

export default function EditOsobaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">✏️ Upravit osobu</h1>
          <p className="text-sm text-gray-600 mt-1">{id}</p>
        </div>

        {/* Navigace zpět */}
        <Link href={`/osoby/${id}`} className="btn-secondary inline-flex items-center gap-2">
          ← Zpět na detail osoby
        </Link>
      </div>

      {/* Formulář pro úpravu osoby — načte existující data podle editId */}
      <OsobaForm editId={id} />
    </div>
  );
}
