// FARNÍ AGENDA - DETAIL OSOBY (/osoby/[id])
// Stránka pro zobrazení kompletních informací o jedné osobě

import { createClient } from '@/lib/supabase/client';
import Link from 'next/link';
import OsobaForm from '@/components/features/osoba-form';
import KrestniZapisForm from '@/components/features/krestni-zapis-form';

export default async function OsobaDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const supabase = createClient();
  
  // Next 16: params je Promise — unwrap přes await (bez něj je params.id undefined)
  const { id } = await params;

  const { data: osoba, error } = await supabase
    .from('osoby')
    .select('*')
    .eq('id', id)
    .single();

  if (error || !osoba) {
    return (
      <div className="card text-center py-12">
        <p className="text-6xl mb-4">👤</p>
        <h3 className="text-lg font-semibold text-gray-900 mb-2">Osoba nenalezena</h3>
        <Link href="/osoby" className="btn-primary inline-block">Zpět na seznam osob</Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Detail osoby</h1>
          <p className="text-sm text-gray-600 mt-1">{osoba.krestni_jmeno} {osoba.prijmeni}</p>
        </div>

        {/* Actions */}
        <div className="flex gap-3">
          <Link href={`/osoby/${id}/edit`} className="btn-primary inline-flex items-center gap-2">
            ✏️ Upravit
          </Link>
          <Link href="/osoby" className="btn-secondary inline-flex items-center gap-2">
            ← Zpět na seznam
          </Link>
        </div>
      </div>

      {/* Main info card */}
      <div className="card p-6 bg-gradient-to-r from-blue-50 to-indigo-50 border-l-4 border-blue-500">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">{osoba.krestni_jmeno} {osoba.prijmeni}</h2>

        {/* Status badges */}
        <div className="flex gap-2 flex-wrap mb-4">
          <span className={`badge ${
            osoba.clenstvi_status === 'aktivni' ? 'badge-active' 
              : osoba.clenstvi_status === 'bez_farnosti' ? 'bg-yellow-100 text-yellow-800 border-yellow-200'
                : 'badge-inactive'}`}>
            {osoba.clenstvi_status || '—'}
          </span>
        </div>

        {/* Basic info */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
          <div>
            <p className="text-gray-500 font-medium">Datum narození</p>
            <p className="font-semibold">{new Date(osoba.datum_narozeni).toLocaleDateString('cs-CZ')}</p>
          </div>
          <div>
            <p className="text-gray-500 font-medium">Místo narození</p>
            <p className="font-semibold">{osoba.misto_narozeni || '—'}</p>
          </div>
          <div>
            <p className="text-gray-500 font-medium">Farnost</p>
            <p className="font-semibold">{osoba.farnost_id || '—'}</p>
          </div>
        </div>

        {/* Contact info */}
        <div className="mt-4 pt-4 border-t border-blue-200">
          <h3 className="text-sm font-semibold text-gray-700 mb-2">📞 Kontakt</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
            {osoba.email && (
              <div>
                <p className="text-gray-500">E-mail</p>
                <a href={`mailto:${osoba.email}`} className="text-blue-600 hover:text-blue-700">{osoba.email}</a>
              </div>
            )}
            {osoba.telefon && (
              <div>
                <p className="text-gray-500">Telefon</p>
                <a href={`tel:${osoba.telefon}`} className="font-semibold">{osoba.telefon}</a>
              </div>
            )}
          </div>
        </div>

        {/* Sacraments */}
        <div className="mt-4 pt-4 border-t border-blue-200">
          <h3 className="text-sm font-semibold text-gray-700 mb-2">✝️ Svátosti</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
            {osoba.svatost_krst && (
              <div>
                <p className="text-gray-500">Křest</p>
                <p className="font-semibold">{new Date(osoba.svatost_krst).toLocaleDateString('cs-CZ')}</p>
              </div>
            )}
            {osoba.svatost_birovani && (
              <div>
                <p className="text-gray-500">Birování</p>
                <p className="font-semibold">{new Date(osoba.svatost_birovani).toLocaleDateString('cs-CZ')}</p>
              </div>
            )}
            {osoba.svatost_svadba && (
              <div>
                <p className="text-gray-500">Svadba</p>
                <p className="font-semibold">{new Date(osoba.svatost_svadba).toLocaleDateString('cs-CZ')}</p>
              </div>
            )}
          </div>
        </div>

        {/* Additional info */}
        {osoba.poznámka && (
          <div className="mt-4 pt-4 border-t border-blue-200">
            <h3 className="text-sm font-semibold text-gray-700 mb-2">📝 Poznámky</h3>
            <p className="text-sm text-gray-600">{osoba.poznámka}</p>
          </div>
        )}
      </div>

      {/* Forms */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <KrestniZapisForm osobaId={id} />
        <OsobaForm editId={id} />
      </div>
    </div>
  );
}
