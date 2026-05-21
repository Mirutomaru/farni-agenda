// FARNÍ AGENDA - UPRavit OSOBU (/osoby/[id]/edit)
// Formulář pro úpravu existujícího záznamu osoby

'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import OsobaForm from '@/components/OsobaForm';

export default function EditOsobaPage({ params }: { params: { id: string } }) {
  const [saved, setSaved] = useState(false);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">✏️ Upravit osobu</h1>
          <p className="text-sm text-gray-600 mt-1">{params.id}</p>
        </div>

        {/* Navigace zpět */}
        <Link href={`/osoby/${params.id}`} className="btn-secondary inline-flex items-center gap-2">
          ← Zpět na detail osoby
        </Link>
      </div>

      {/* Formulář pro úpravu osoby */}
    </div>
  );
}
