// FARNÍ AGENDA - MAJETEK / SPRÁVA MAJETKU
// Stránka /majetek — přehled farního majetku s kategoriemi a inventářem

import { createClient } from '@/lib/supabase/client';
import Link from 'next/link';

const KATEGORIE_LABELS: Record<string, string> = {
  nemovitost: '🏠 Nemovitost',
  movitost: '🪑 Movitost',
  duchovní_pomůcky: '⛪ Duchovní pomůcky',
  finance: '💰 Finance'
};

const KATEGORIE_COLORS: Record<string, string> = {
  nemovitost: 'bg-blue-100 text-blue-800 border-blue-200',
  movitost: 'bg-green-100 text-green-800 border-green-200',
  duchovní_pomůcky: 'bg-purple-100 text-purple-800 border-purple-200',
  finance: 'bg-yellow-100 text-yellow-800 border-yellow-200'
};

export default async function MajetekPage({ searchParams }: { searchParams?: Promise<{ kategorie?: string }> }) {
  // Next.js 15+: searchParams je Promise — bez await se filtr nikdy nečetl a stránka zůstala statická
  const kategorieFilter = ((await searchParams) || {}).kategorie || '';
  
  const supabase = createClient();

  const query = supabase.from('majetek').select('*').order('nazev');
  
  if (kategorieFilter) {
    query.eq('kategorie', kategorieFilter);
  }

  // Celkové hodnocení majetku
  const { data: financeStats } = await supabase.rpc('get_monthly_statistics', { 
    rok: new Date().getFullYear(), 
    mesic: new Date().getMonth() + 1 
  });

  const totalMembers = financeStats?.reduce((sum: number, s: any) => sum + (s.celkem_clenu || 0), 0) || 0;
  const activeMembers = financeStats?.reduce((sum: number, s: any) => sum + (s.aktivni_clenu || 0), 0) || 0;

  const { data: items }: any = await query;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Majetek farnosti</h1>
          <p className="text-sm text-gray-600 mt-1">Správa farního majetku, inventáře a nemovitostí</p>
        </div>

        {/* Přidat majetek button */}
        <Link href="/majetek/new" className="btn-primary whitespace-nowrap">
          ➕ Přidat položku
        </Link>
      </div>

      {/* Statistiky */}
      {items && items.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {/* Celkem položek */}
          <div className="card flex items-center gap-3">
            <span className="text-3xl">📋</span>
            <div>
              <p className="text-sm text-gray-500">Celkem položek</p>
              <p className="text-2xl font-bold text-gray-900">{items.length}</p>
            </div>
          </div>

          {/* Celková hodnota */}
          <div className="card flex items-center gap-3">
            <span className="text-3xl">💰</span>
            <div>
              <p className="text-sm text-gray-500">Celková hodnota</p>
              <p className="text-2xl font-bold text-green-600">
                {items.reduce((sum: number, item: any) => sum + (parseFloat(String(item.aktuální_hodnota || item.počiáteční_hodnota)) || 0), 0).toLocaleString('cs-CZ')} Kč
              </p>
            </div>
          </div>

          {/* Kategorie breakdown */}
          <div className="card flex items-center gap-3">
            <span className="text-3xl">📂</span>
            <div>
              <p className="text-sm text-gray-500">Kategorie</p>
              <p className="text-sm font-semibold text-blue-600">
                {new Set(items.map((i: any) => i.kategorie)).size} typů
              </p>
            </div>
          </div>

          {/* Členové farnosti */}
          <Link href="/osoby" className="card flex items-center gap-3 hover:shadow-md transition-shadow block">
            <span className="text-3xl">👥</span>
            <div>
              <p className="text-sm text-gray-500">Členové farnosti</p>
              <p className="text-sm font-semibold text-blue-600">{activeMembers} aktivních</p>
            </div>
          </Link>
        </div>
      ) : null}

      {/* Filtry podle kategorií */}
      {items && items.length > 0 ? (
        <div className="card p-4">
          <form action="/majetek" method="get" className="flex gap-3 flex-wrap">
            <label className="text-sm font-medium text-gray-700 self-center">Filtrovat:</label>
            
            {Object.keys(KATEGORIE_LABELS).map((cat) => (
              <Link
                key={cat}
                href={`/majetek?${kategorieFilter && kategorieFilter !== cat ? `q=${encodeURIComponent(kategorieFilter)}&` : ''}kategorie=${cat}`}
                className={`badge px-3 py-1 text-sm border ${kategorieFilter === cat 
                  ? 'bg-blue-600 text-white border-blue-600' 
                  : KATEGORIE_COLORS[cat] || 'border-gray-200'}`}
              >
                {KATEGORIE_LABELS[cat]}
              </Link>
            ))}

            <Link href="/majetek" className="text-sm text-blue-600 hover:text-blue-700 self-center ml-auto">Všechny</Link>
          </form>
        </div>
      ) : null}

      {/* Tabulka majetku */}
      {!items ? (
        <div className="card p-8 text-center text-gray-500">Načítání...</div>
      ) : items.length > 0 ? (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50">
                <th className="text-left px-4 py-3 font-semibold text-gray-700">Název</th>
                <th className="hidden sm:table-cell text-left px-4 py-3 font-semibold text-gray-700">Kategorie</th>
                <th className="hidden md:table-cell text-right px-4 py-3 font-semibold text-gray-700">Hodnota (Kč)</th>
                <th className="hidden lg:table-cell text-left px-4 py-3 font-semibold text-gray-700">Umístění</th>
                <th className="text-right px-4 py-3 font-semibold text-gray-700">Akce</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {items.map((item: any) => (
                <tr key={item.id} className="hover:bg-blue-50 transition-colors">
                  <td className="px-4 py-3">
                    <div>
                      <span className="font-medium text-gray-900">{item.název}</span>
                      {item.inventární_cislo && (
                        <p className="text-xs text-gray-500 mt-0.5">INV: {item.inventární_cislo}</p>
                      )}
                    </div>
                  </td>
                  <td className="hidden sm:table-cell px-4 py-3">
                    <span className={`badge border ${KATEGORIE_COLORS[item.kategorie] || 'bg-gray-100 border-gray-200'}`}>
                      {KATEGORIE_LABELS[item.kategorie] || item.kategorie}
                    </span>
                  </td>
                  <td className="hidden md:table-cell px-4 py-3 text-right font-mono">
                    <span className={`${item.aktuální_hodnota && parseFloat(item.aktuální_hodnota) > 0 ? 'text-green-600' : 'text-gray-500'}`}>
                      {parseFloat(String(item.aktuální_hodnota || item.počiáteční_hodnota)).toLocaleString('cs-CZ')} Kč
                    </span>
                  </td>
                  <td className="hidden lg:table-cell px-4 py-3 text-gray-600">{item.umístění}</td>
                  <td className="px-4 py-3 text-right">
                    <Link href={`/majetek/${item.id}/edit`} className="text-blue-600 hover:text-blue-700 font-medium mr-2">✏️</Link>
                    <Link href="/api/export-pdf" className="text-gray-500 hover:text-gray-700">📄</Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Celková hodnota v patičce */}
          {items.length > 1 && (
            <div className="px-4 py-3 border-t bg-gray-50 flex justify-between items-center">
              <span className="text-sm text-gray-600 font-medium">Celkem:</span>
              <span className="font-bold text-green-700">
                {items.reduce((sum: number, item: any) => sum + (parseFloat(String(item.aktuální_hodnota || item.počiáteční_hodnota)) || 0), 0).toLocaleString('cs-CZ')} Kč
              </span>
            </div>
          )}
        </div>
      ) : (
        <div className="card text-center py-12">
          <p className="text-6xl mb-4">🏛️</p>
          <h3 className="text-lg font-semibold text-gray-900 mb-2">Žádný majetek nenalezen</h3>
          <p className="text-gray-500 mb-4">Začněte přidáním první položky farního majetku.</p>
          <Link href="/majetek/new" className="btn-primary inline-block">Přidat položku</Link>
        </div>
      )}
    </div>
  );
}
