// FARNÍ AGENDA - SEZNAM OSOB S VYHLEDÁVÁNÍM A FILTRY
// Stránka /osoby — přehledný seznam s vyhledáváním, filtrováním a rychlými akcemi

import { createClient } from '@/lib/supabase/client';
import Link from 'next/link';
import OsobaForm from '@/components/OsobaForm';

export default async function OsobyPage({ searchParams }: { searchParams?: { q: string; status?: string } }) {
  const query = (searchParams?.q as string) || '';
  const statusFilter = (searchParams?.status as string) || 'all';
  
  const supabase = createClient();

  let osobyQuery = supabase.from('osoby').select('*', { count: 'exact' }).order('prijmeni');
  
  // Aplikace filtrů
  if (query.trim()) {
    const searchTerms = query.split(' ').filter(Boolean);
    // Vyhledávání v krestni_jmeno a prijmeni (LIKE - funguje bez indexu na malé datové sady)
    for (const term of searchTerms) {
      osobyQuery.or(`krestni_jmeno.ilike.%${term}%,prijmeni.ilike.%${term}%`);
    }
  }

  if (statusFilter !== 'all') {
    // Filtr podle clenstvi_status nebo status (oba sloupce)
    const filterValue = `eq.${statusFilter}`;
    osobyQuery.or(`clenstvi_status.${filterValue},status.${filterValue}`);
  }

  const { data: osoby, error, count } = await osobyQuery.limit(100);

  // Statistiky pro filtry
  const { data: statsData } = await supabase.from('osoby').select('clenstvi_status', { count: 'exact' });
  
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Seznam osob</h1>
          <p className="text-sm text-gray-600 mt-1">
            {count !== null ? `${count} výsledků` : 'Načítání...'}
          </p>
        </div>
        
        {/* Přidat osobu button */}
        <Link href="/osoby/new" className="btn-primary whitespace-nowrap">
          ➕ Přidat osobu
        </Link>
      </div>

      {/* Vyhledávání a filtry */}
      <div className="card p-4">
        <form action="/osoby" method="get" className="flex flex-col md:flex-row gap-3">
          {/* Hledat */}
          <div className="flex-1">
            <input
              name="q"
              defaultValue={query}
              placeholder="Hledat jméno nebo příjmení..."
              className="form-input"
            />
          </div>

          {/* Filtr podle statusu */}
          <select name="status" defaultValue={statusFilter} onChange={(e) => { e.target.form?.requestSubmit(); }} className="form-input w-full md:w-48">
            <option value="all">Všechny</option>
            <option value="aktivni">Aktivní</option>
            <option value="bez_farnosti">Bez farnosti</option>
            <option value="inactive">Neaktivní</option>
          </select>

          {/* Tlačítka */}
          <button type="submit" className="btn-primary whitespace-nowrap">Hledat</button>
          {query && (
            <Link href="/osoby" className="btn-secondary text-center whitespace-nowrap">Vymazat</Link>
          )}
        </form>

        {/* Quick status filter buttons */}
        <div className="flex gap-2 mt-3 flex-wrap">
          {(['all', 'aktivni', 'bez_farnosti', 'inactive'] as const).map((status) => (
            <Link
              key={status}
              href={`/osoby?${query ? `q=${encodeURIComponent(query)}&` : ''}status=${status}`}
              className={`badge px-3 py-1 text-sm ${statusFilter === status 
                ? 'bg-blue-600 text-white' 
                : status === 'aktivni' ? 'badge-active bg-green-50 border border-green-200 hover:bg-green-100'
                  : status === 'bez_farnosti' ? 'badge-warning bg-yellow-50 border border-yellow-200 hover:bg-yellow-100'
                    : 'bg-gray-100 text-gray-600 border border-gray-300 hover:bg-gray-200'}`}
            >
              {status === 'all' ? 'Všechny' 
                : status === 'aktivni' ? 'Aktivní'
                  : status === 'bez_farnosti' ? 'Bez farnosti'
                    : 'Neaktivní'}
            </Link>
          ))}
        </div>
      </div>

      {/* Chyba při načítání */}
      {error && (
        <div className="card bg-red-50 border border-red-200 text-center">
          <p className="text-red-700 font-medium mb-2">⚠️ Chyba při načítání dat</p>
          <p className="text-sm text-red-600">{error.message}</p>
          <p className="text-xs text-gray-500 mt-2">Ujistěte se, že je schema.sql aplikováno na Supabase a tabulka 'osoby' existuje.</p>
        </div>
      )}

      {/* Seznam osob - Tabulka */}
      {!error && (osoby && osoby.length > 0) ? (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50">
                <th className="text-left px-4 py-3 font-semibold text-gray-700">Jméno</th>
                <th className="hidden sm:table-cell text-left px-4 py-3 font-semibold text-gray-700">Datum narození</th>
                <th className="hidden md:table-cell text-left px-4 py-3 font-semibold text-gray-700">Status</th>
                <th className="text-right px-4 py-3 font-semibold text-gray-700">Akce</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {osoby.map((osoba: any) => (
                <tr key={osoba.id} className="hover:bg-blue-50 transition-colors">
                  <td className="px-4 py-3">
                    <div>
                      <span className="font-medium text-gray-900">{osoba.krestni_jmeno}</span>{' '}
                      <span className="text-gray-700">{osoba.prijmeni}</span>
                    </div>
                  </td>
                  <td className="hidden sm:table-cell px-4 py-3 text-gray-600">
                    {new Date(osoba.datum_narozeni).toLocaleDateString('cs-CZ')}
                  </td>
                  <td className="hidden md:table-cell px-4 py-3">
                    {/* Status badge */}
                    <span className={`badge ${
                      osoba.clenstvi_status === 'aktivni' ? 'badge-active' 
                        : osoba.clenstvi_status === 'bez_farnosti' ? 'badge-warning'
                          : 'bg-gray-100 text-gray-600 border border-gray-300'}`}
                    >
                      {osoba.clenstvi_status || osoba.status || '—'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Link href={`/osoby/${osoba.id}`} className="text-blue-600 hover:text-blue-700 font-medium mr-3">
                      Detail
                    </Link>
                    <Link href={`/osoby/${osoba.id}/edit`} className="text-gray-500 hover:text-gray-700">
                      ✏️
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Paginace info */}
          {count && count > 100 ? (
            <div className="px-4 py-3 border-t text-sm text-gray-500">
              Zobrazeno prvních 100 z {count} výsledků. Pro přesnější vyhledávání použijte hledací pole.
            </div>
          ) : null}
        </div>
      ) : !error ? (
        <div className="card text-center py-12">
          <p className="text-6xl mb-4">👥</p>
          <h3 className="text-lg font-semibold text-gray-900 mb-2">Žádné osoby nenalezeny</h3>
          {query ? (
            <>
              <p className="text-gray-500 mb-4">Zkuste změnit hledaný výraz nebo filtr.</p>
              <Link href="/osoby" className="btn-secondary inline-block">Vymazat hledání</Link>
            </>
          ) : (
            <>
              <p className="text-gray-500 mb-4">Začněte přidáním první osoby do farnosti.</p>
              <Link href="/osoby/new" className="btn-primary inline-block">Přidat osobu</Link>
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}
