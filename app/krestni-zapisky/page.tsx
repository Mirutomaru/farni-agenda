// FARNÍ AGENDA - KŘESTNÍ ZÁPISY (/krestni-zapisky)
// Stránka pro správu křestních, birovacích a svatebních zápisů

import { createClient } from '@/lib/supabase/server';
import Link from 'next/link';
import KrestniZapisForm from '@/components/features/krestni-zapis-form';
import SvatbaForm from '@/components/features/svatba-form';
import { mergeSvatosti, filterByTyp, certificateTypeFor, groupSvedkoveBySvatba } from '@/lib/services/svatosti-service';

const ZAPIS_TYPES = [
  { value: 'krest', label: '⛪ Křest', color: 'bg-blue-100 text-blue-800 border-blue-200' },
  { value: 'birovani', label: '🕊️ Birování', color: 'bg-green-100 text-green-800 border-green-200' },
  { value: 'svadba', label: '💒 Svadba', color: 'bg-purple-100 text-purple-800 border-purple-200' },
];

export default async function KrestniZapiskyPage({ searchParams }: { searchParams?: Promise<{ typ?: string }> }) {
  // Next.js 15+: searchParams je Promise — bez await se filtr nikdy nečetl a stránka zůstala statická
  const typeFilter = (await searchParams)?.typ || '';
  
  const supabase = await createClient();

  // Schéma nemá společnou tabulku ani sloupec "typ" — načteme všechny tři tabulky paralelně
  const [krestyRes, birovaniRes, svatbyRes, osobyRes, farnostiRes, svedkoveRes] = await Promise.all([
    supabase.from('krestni_zapis').select('*'),
    supabase.from('birovani_zapis').select('*'),
    supabase.from('svatby').select('*'),
    supabase.from('osoby').select('id, krestni_jmeno, prijmeni, farnost_id'),
    supabase.from('farnosti').select('id, nazev'),
    // Svědkové svatby (relace svatba_svedkove) — pro zobrazení u svatebních zápisů
    supabase.from('svatba_svedkove').select('svatba_id, svedek_id'),
  ]);

  const error = krestyRes.error || birovaniRes.error || svatbyRes.error;

  // Svědkové seskupení podle svatby (idempotentní lookup pro tabulku)
  const svedkoveMap = groupSvedkoveBySvatba(svedkoveRes.data);

  // Lookup jména osob a názvů farností pro zobrazení v tabulce
  const osobaNames = new Map<string, string>();
  const osobaFarnostId = new Map<string, string | null>();
  if (!osobyRes.error && osobyRes.data) {
    for (const o of osobyRes.data as any[]) {
      osobaNames.set(o.id, `${o.krestni_jmeno} ${o.prijmeni}`);
      osobaFarnostId.set(o.id, o.farnost_id ?? null);
    }
  }
  const farnostNazvy = new Map<string, string>();
  if (!farnostiRes.error && farnostiRes.data) {
    for (const f of farnostiRes.data as any[]) {
      farnostNazvy.set(f.id, f.nazev);
    }
  }

  // Sloučení + řazení sestupně podle data (oprava: starý kód queryoval neexistující tabulku "krestni_zapisky")
  const merged = mergeSvatosti(krestyRes.data, birovaniRes.data, svatbyRes.data, 50);
  const zapisy = filterByTyp(merged, typeFilter);

  // Statistiky dashboardu — počítají z celého datasetu (oprava: dříve jen z prvních 50 řádků)
  const celkemKresty = krestyRes.error ? 0 : (krestyRes.data || []).length;
  const celkemBirovani = birovaniRes.error ? 0 : (birovaniRes.data || []).length;
  const celkemSvatby = svatbyRes.error ? 0 : (svatbyRes.data || []).length;

  // Pomocné funkce pro zobrazení
  const displayName = (id?: string | null) => (id ? osobaNames.get(id) ?? 'Neznámá osoba' : '—');
  const farnostName = (osobaId?: string | null) => {
    if (!osobaId) return '—';
    const fid = osobaFarnostId.get(osobaId);
    return fid ? farnostNazvy.get(fid) ?? '—' : '—';
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">✝️ Křestní zápisy</h1>
          <p className="text-sm text-gray-600 mt-1">Správa křestních, birovacích a svatebních zápisů s generováním certifikátů</p>
        </div>

        {/* Přidat zápis + Export (P2) */}
        <div className="flex gap-2">
          <Link href="/api/export-csv?typ=krestni-zapisky" className="btn-secondary whitespace-nowrap">📥 CSV</Link>
          <Link href="/api/export-pdf?typ=krestni-zapisky" className="btn-secondary whitespace-nowrap">📄 PDF</Link>
          <Link href="/krestni-zapisky/new" className="btn-primary whitespace-nowrap">
            ➕ Přidat zápis
          </Link>
        </div>
      </div>

      {/* Statistiky */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {/* Celkem záznamů */}
        <div className="card flex items-center gap-3 border-l-4 border-blue-500">
          <span className="text-3xl">📋</span>
          <div>
            <p className="text-sm text-gray-500 font-medium">Celkem záznamů</p>
            <p className="text-2xl font-bold text-blue-600">{zapisy?.length || 0}</p>
          </div>
        </div>

        {/* Křty */}
        <Link href="/krestni-zapisky?typ=krest" className="card flex items-center gap-3 hover:bg-blue-50 transition-colors block">
          <span className="text-3xl">⛪</span>
          <div>
            <p className="text-sm text-gray-500 font-medium">Křty</p>
            <p className="text-2xl font-bold">{celkemKresty}</p>
          </div>
        </Link>

        {/* Birování */}
        <Link href="/krestni-zapisky?typ=birovani" className="card flex items-center gap-3 hover:bg-green-50 transition-colors block">
          <span className="text-3xl">🕊️</span>
          <div>
            <p className="text-sm text-gray-500 font-medium">Birování</p>
            <p className="text-2xl font-bold">{celkemBirovani}</p>
          </div>
        </Link>

        {/* Svatby */}
        <Link href="/krestni-zapisky?typ=svadba" className="card flex items-center gap-3 hover:bg-purple-50 transition-colors block">
          <span className="text-3xl">💒</span>
          <div>
            <p className="text-sm text-gray-500 font-medium">Svatby</p>
            <p className="text-2xl font-bold">{celkemSvatby}</p>
          </div>
        </Link>
      </div>

      {/* Filtry */}
      {zapisy && zapisy.length > 0 ? (
        <div className="card p-4">
          <form action="/krestni-zapisky" method="get" className="flex gap-3 flex-wrap items-center">
            <label className="text-sm font-medium text-gray-700 self-center">Filtrovat podle typu:</label>
            
            {ZAPIS_TYPES.map((type) => (
              <Link
                key={type.value}
                href={`/krestni-zapisky?${typeFilter && typeFilter !== type.value ? `q=${encodeURIComponent(typeFilter)}&` : ''}typ=${type.value}`}
                className={`badge px-3 py-1 text-sm border ${typeFilter === type.value 
                  ? 'bg-blue-600 text-white border-blue-600' 
                  : type.color}`}
              >
                {type.label}
              </Link>
            ))}

            <Link href="/krestni-zapisky" className="text-sm text-blue-600 hover:text-blue-700 self-center ml-auto">Všechny</Link>
          </form>
        </div>
      ) : null}

      {/* Chyba při načítání */}
      {error && (
        <div className="card bg-red-50 border border-red-200 text-center">
          <p className="text-red-700 font-medium mb-2">⚠️ Chyba při načítání zápisů</p>
          <p className="text-sm text-red-600">{error.message}</p>
        </div>
      )}

      {/* Seznam zápisů */}
      {!error && zapisy && zapisy.length > 0 ? (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50">
                <th className="text-left px-4 py-3 font-semibold text-gray-700">Osoba</th>
                <th className="hidden sm:table-cell text-left px-4 py-3 font-semibold text-gray-700">Typ zápisu</th>
                <th className="hidden md:table-cell text-left px-4 py-3 font-semibold text-gray-700">Datum</th>
                <th className="hidden lg:table-cell text-left px-4 py-3 font-semibold text-gray-700">Farnost</th>
                <th className="text-right px-4 py-3 font-semibold text-gray-700">Akce</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {zapisy.map((zapis) => (
                <tr key={zapis.id} className="hover:bg-blue-50 transition-colors">
                  <td className="px-4 py-3">
                    <div>
                      {/* Osoba — jméno z lookupu osoby (oprava: dříve se zobrazovalo UUID) */}
                      <span className="font-medium text-gray-900">{displayName(zapis.osobaId)}</span>
                      {zapis.druhOsobaId ? (
                        <div className="text-xs text-gray-500">+ {displayName(zapis.druhOsobaId)}</div>
                      ) : null}
                      {/* Svědkové svatby — z relace svatba_svedkove */}
                      {zapis.typ === 'svadba' && svedkoveMap.get(zapis.id) ? (
                        <div className="text-xs text-purple-600 mt-1">
                          🕊️ Svědkové: {svedkoveMap.get(zapis.id)!.map((id) => displayName(id)).join(', ')}
                        </div>
                      ) : null}
                    </div>
                  </td>
                  <td className="hidden sm:table-cell px-4 py-3">
                    {/* Typ badge — typ je odvozen z tabulky, ne ze sloupce */}
                    <span className={`badge border ${ZAPIS_TYPES.find(t => t.value === zapis.typ)?.color || 'bg-gray-100 border-gray-200'}`}>
                      {ZAPIS_TYPES.find(t => t.value === zapis.typ)?.label || zapis.typ}
                    </span>
                  </td>
                  <td className="hidden md:table-cell px-4 py-3 text-gray-600">
                    {/* Datum svátosti */}
                    {zapis.datum ? new Date(zapis.datum).toLocaleDateString('cs-CZ') : '—'}
                  </td>
                  <td className="hidden lg:table-cell px-4 py-3 text-gray-600">
                    {/* Farnost osoby — z lookupu farností */}
                    {farnostName(zapis.osobaId)}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {/* Detail button */}
                    <Link href={`/krestni-zapisky/${zapis.id}`} className="text-blue-600 hover:text-blue-700 font-medium mr-2">Detail</Link>
                    
                    {/* Edit button */}
                    <Link href={`/krestni-zapisky/${zapis.id}/edit`} className="text-gray-500 hover:text-gray-700 mr-2">✏️</Link>
                    
                    {/* Generate certificate — kontrakt service: personId + type ('krest'|'birovan') */}
                    {certificateTypeFor(zapis.typ) ? (
                      <button 
                        onClick={async () => {
                          const certType = certificateTypeFor(zapis.typ);
                          if (!certType || !zapis.osobaId) return;
                          const response = await fetch('/api/generate-certificate', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ personId: zapis.id, type: certType })
                          });
                          if (response.ok) {
                            const blob = await response.blob();
                            const url = window.URL.createObjectURL(blob);
                            const a = document.createElement('a');
                            a.href = url;
                            a.download = `krestni-zapis-${zapis.id}.pdf`;
                            a.click();
                          }
                        }}
                        className="text-green-600 hover:text-green-700"
                      >
                        📄 Certifikát
                      </button>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Celkový součet */}
          <div className="px-4 py-3 border-t bg-gray-50 text-sm text-gray-600">
            Zobrazeno {zapisy.length} z celkem {celkemKresty + celkemBirovani + celkemSvatby} svátostí
          </div>
        </div>
      ) : !error ? (
        <div className="card text-center py-12">
          <p className="text-6xl mb-4">✝️</p>
          <h3 className="text-lg font-semibold text-gray-900 mb-2">Žádné křestní zápisy nenalezeny</h3>
          {typeFilter ? (
            <>
              <p className="text-gray-500 mb-4">Zkuste změnit filtr nebo přidat nový zápis.</p>
              <Link href="/krestni-zapisky" className="btn-secondary inline-block mr-2">Vymazat filtr</Link>
            </>
          ) : (
            <>
              <p className="text-gray-500 mb-4">Začněte přidáním prvního křestního zápisu.</p>
              <Link href="/krestni-zapisky/new" className="btn-primary inline-block">Přidat zápis</Link>
            </>
          )}
        </div>
      ) : null}

      {/* Form pro přidání nového zápisu */}
      {zapisy && zapisy.length < 50 ? (
        <section className="card bg-gradient-to-r from-blue-50 to-purple-50 border-l-4 border-blue-500">
          <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
            ✝️ Přidat nový křestní zápis
          </h3>

          {/* Inline form */}
        </section>
      ) : null}

      {/* Statistiky a grafické znázornění */}
      {celkemKresty + celkemBirovani + celkemSvatby > 0 ? (
        <section className="card">
          <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
            📊 Přehled svátostí
          </h3>

          {/* Bar chart - CSS based */}
          <div className="space-y-4">
            {ZAPIS_TYPES.map((type) => (
              <div key={type.value} className="grid grid-cols-12 gap-4 items-center">
                <div className="col-span-3 sm:col-span-2 text-sm font-medium text-gray-700">{type.label}</div>
                
                {/* Bar */}
                <div className="col-span-9 sm:col-span-8">
                  <div className="w-full bg-gray-100 rounded-full h-6 overflow-hidden flex">
                    {/* Křty */}
                    {type.value === 'krest' && celkemKresty > 0 && (
                      <div 
                        className="bg-blue-500 h-full flex items-center justify-center text-xs text-white font-medium"
                        style={{ width: `${Math.round((celkemKresty / (celkemKresty + celkemBirovani + celkemSvatby)) * 100)}%` }}
                      >
                        {celkemKresty}
                      </div>
                    )}

                    {/* Birování */}
                    {type.value === 'birovani' && celkemBirovani > 0 && (
                      <div 
                        className="bg-green-500 h-full flex items-center justify-center text-xs text-white font-medium"
                        style={{ width: `${Math.round((celkemBirovani / (celkemKresty + celkemBirovani + celkemSvatby)) * 100)}%` }}
                      >
                        {celkemBirovani}
                      </div>
                    )}

                    {/* Svatby */}
                    {type.value === 'svadba' && celkemSvatby > 0 && (
                      <div 
                        className="bg-purple-500 h-full flex items-center justify-center text-xs text-white font-medium"
                        style={{ width: `${Math.round((celkemSvatby / (celkemKresty + celkemBirovani + celkemSvatby)) * 100)}%` }}
                      >
                        {celkemSvatby}
                      </div>
                    )}

                    {/* Empty */}
                  </div>
                </div>

                {/* Legend */}
              </div>
            ))}
          </div>

          {/* Summary */}
          <div className="mt-6 pt-4 border-t flex justify-between items-center">
            <span className="text-sm font-semibold text-gray-700">Celkem svátostí:</span>
            <span className="text-lg font-bold text-blue-600">{celkemKresty + celkemBirovani + celkemSvatby}</span>
          </div>

          {/* Legend */}
        </section>
      ) : null}

      {/* Export tlačítka */}
      <div className="flex gap-3 flex-wrap">
        <button className="btn-primary inline-flex items-center gap-2 bg-green-600 hover:bg-green-700">
          💾 Generovat měsíční report
        </button>
        <Link href="/api/export-csv" className="btn-secondary inline-flex items-center gap-2">
          📥 Export do CSV
        </Link>
      </div>

      {/* Formuláře pro nové zápisy — křest a svatba (svědkové se zapisují do svatba_svedkove) */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <KrestniZapisForm />
        <SvatbaForm />
      </div>
    </div>
  );
}
