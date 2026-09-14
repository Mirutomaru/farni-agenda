// FARNÍ AGENDA - FINANCE / PŘÍJMY A VÝDAJE
// Stránka /finance — přehled financí farnosti s kategoriemi a dokumenty

import { createClient } from '@/lib/supabase/client';
import Link from 'next/link';

const KATEGORIE_FINANCE: Record<string, string> = {
  dar: '🎁 Dar',
  sbírka: '⛪ Sbírka',
  plat: '💼 Plat duchovního',
  údržba: '🔧 Údržba budov',
  energie: '⚡ Energie',
  voda: '💧 Voda a kanalizace',
  poštovné: '✉️ Poštovné',
  kancelářské_doplňky: '📝 Kancelářské doplňky',
  software: '💻 Software',
  reprezentace: '🤝 Reprezentace',
  sociální_pomoc: '❤️ Sociální pomoc',
  zápisné: '📚 Zápisné',
  jiný_příjem: '📥 Jiný příjem',
  jiný_výdaj: '📤 Jiný výdaj'
};

export default async function FinancePage({ searchParams }: { searchParams?: Promise<{ typ?: string; mesic?: string }> }) {
  // Next.js 15+: searchParams je Promise — bez await se filtry nikdy nečetly a stránka zůstala statická
  const params = (await searchParams) || {};
  const typFilter = params.typ || '';
  const mesicParam = params.mesic || '';
  
  const supabase = createClient();

  let dateRangeFilter: string | null = null;
  if (mesicParam) {
    const [rok, mesice] = mesicParam.split('-');
    const firstDay = `${rok}-${mesice}-01`;
    // Calculate last day of month
    const nextMonth = parseInt(mesice) === 12 ? `${parseInt(rok) + 1}-01` : `${rok}-${String(parseInt(mesice) + 1).padStart(2, '0')}`;
    const lastDay = new Date(nextMonth.replace(/-/g, '/') + '-01').getDate() - 1;
    dateRangeFilter = `datum_příjmu.gte.${firstDay},datum_příjmu.lte.${rok}-${mesice}-${String(lastDay).padStart(2, '0')}`;
  }

  let query = supabase
    .from('finance')
    .select('*')
    .order('datum_příjmu', { ascending: false });
  
  if (typFilter) {
    query = query.eq('typ', typFilter);
  }

  if (dateRangeFilter) {
    const [gteCol, gteVal] = dateRangeFilter.split(',').map(s => {
      const [col, val] = s.split('.');
      return `${col}.gt.${val}`;
    });
    // Use Supabase RPC or rpc for custom filter
  }

  const financeItemsRaw = await query;
  const { data: financeItems }: any = financeItemsRaw || { data: [] };

  // Výpočet součtů
  let celkemPříjem = 0, celkemVýdaj = 0;
  
  if (financeItems && financeItems.length > 0) {
    for (const item of financeItems) {
      const castka = parseFloat(String(item.castka)) || 0;
      if (item.typ === 'příjem') celkemPříjem += castka;
      else celkemVýdaj += castka;
    }
  }

  // Statistika podle kategorií pro graf
  let kategorieStats: Record<string, { příjmy: number; výdaje: number }> = {};
  
  if (financeItems && financeItems.length > 0) {
    for (const item of financeItems) {
      const castka = parseFloat(String(item.castka)) || 0;
      if (!kategorieStats[item.kategorie]) {
        kategorieStats[item.kategorie] = { příjmy: 0, výdaje: 0 };
      }
      if (item.typ === 'příjem') kategorieStats[item.kategorie].příjmy += castka;
      else kategorieStats[item.kategorie].výdaje += castka;
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Finance farnosti</h1>
          <p className="text-sm text-gray-600 mt-1">Příjmy a výdaje s přehledem podle kategorií</p>
        </div>

        {/* Přidat položku button */}
        <Link href="/finance/new" className="btn-primary whitespace-nowrap">
          ➕ Přidat záznam
        </Link>
      </div>

      {/* Přehledné statistiky */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Celkový příjem */}
        <div className="card border-l-4 border-green-500 flex items-center gap-4">
          <span className="text-4xl">📈</span>
          <div>
            <p className="text-sm text-gray-500 font-medium">Celkový příjem</p>
            <p className="text-3xl font-bold text-green-600">{celkemPříjem.toLocaleString('cs-CZ')} Kč</p>
          </div>
        </div>

        {/* Celkové výdaje */}
        <div className="card border-l-4 border-red-500 flex items-center gap-4">
          <span className="text-4xl">📉</span>
          <div>
            <p className="text-sm text-gray-500 font-medium">Celkové výdaje</p>
            <p className="text-3xl font-bold text-red-600">{celkemVýdaj.toLocaleString('cs-CZ')} Kč</p>
          </div>
        </div>

        {/* Saldo */}
        <div className={`card border-l-4 flex items-center gap-4 ${celkemPříjem - celkemVýdaj >= 0 ? 'border-blue-500' : 'border-red-500'}`}>
          <span className="text-4xl">⚖️</span>
          <div>
            <p className="text-sm text-gray-500 font-medium">Saldo</p>
            <p className={`text-3xl font-bold ${celkemPříjem - celkemVýdaj >= 0 ? 'text-blue-600' : 'text-red-600'}`}>
              {(celkemPříjem - celkemVýdaj).toLocaleString('cs-CZ')} Kč
            </p>
          </div>
        </div>
      </div>

      {/* Filtry */}
      <div className="card p-4">
        <form action="/finance" method="get" className="flex flex-col md:flex-row gap-3 items-end">
          
          {/* Typ filtr */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Typ</label>
            <select name="typ" defaultValue={typFilter || 'all'} className="form-input w-full md:w-48">
              <option value="all">Všechny</option>
              <option value="příjem">📈 Příjmy</option>
              <option value="výdaj">📉 Výdaje</option>
            </select>
          </div>

          {/* Měsíc filtr */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Měsíc</label>
            <input 
              name="mesic"
              defaultValue={mesicParam || ''}
              type="month"
              className="form-input w-full md:w-48"
            />
          </div>

          {/* Tlačítka */}
          <button type="submit" className="btn-primary whitespace-nowrap">Filtrovat</button>
          {(typFilter || mesicParam) && (
            <Link href="/finance" className="btn-secondary text-center whitespace-nowrap">Vymazat filtry</Link>
          )}
        </form>

        {/* Quick type buttons */}
        <div className="flex gap-2 mt-3 flex-wrap">
          {(['all', 'příjem', 'výdaj'] as const).map((typ) => (
            <Link
              key={typ}
              href={`/finance?${mesicParam ? `mesic=${encodeURIComponent(mesicParam)}&` : ''}${typFilter && typ !== typFilter ? `q=${encodeURIComponent(typFilter)}&` : ''}typ=${typ}`}
              className={`badge px-3 py-1 text-sm ${typ === 'all' 
                ? (typFilter === 'all' && mesicParam === '' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-700 border border-gray-300 hover:bg-gray-200')
                  : typ === 'příjem' 
                    ? (typFilter === 'příjem' ? 'badge-active bg-green-50 border border-green-200' : 'bg-green-100 text-green-800 border border-green-200 hover:bg-green-200')
                      : 'badge-inactive bg-red-50 border border-red-200 hover:bg-red-100'}`}
            >
              {typ === 'all' ? 'Všechny' 
                : typ === 'příjem' ? '📈 Příjmy' : '📉 Výdaje'}
            </Link>
          ))}
        </div>
      </div>

      {/* Tabulka financí */}
      {!financeItems ? (
        <div className="card p-8 text-center text-gray-500">Načítání...</div>
      ) : financeItems.length > 0 ? (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50">
                <th className="text-left px-4 py-3 font-semibold text-gray-700">Datum</th>
                <th className="hidden sm:table-cell text-left px-4 py-3 font-semibold text-gray-700">Typ</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-700">Kategorie</th>
                <th className="hidden md:table-cell text-left px-4 py-3 font-semibold text-gray-700">Protiplatitel</th>
                <th className="text-right px-4 py-3 font-semibold text-gray-700">Částka (Kč)</th>
                <th className="hidden lg:table-cell text-left px-4 py-3 font-semibold text-gray-700">Popisek</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {financeItems.map((item: any) => (
                <tr key={item.id} className={`hover:bg-blue-50 transition-colors ${item.typ === 'příjem' ? '' : ''}`}>
                  <td className="px-4 py-3 text-gray-600">
                    {new Date(item.datum_příjmu).toLocaleDateString('cs-CZ')}
                    {item.datum_zaznamu && item.datum_zaznamu !== item.datum_příjmu ? (
                      <div className="text-xs text-gray-400">(zaznamenáno: {new Date(item.datum_zaznamu).toLocaleDateString('cs-CZ')})</div>
                    ) : null}
                  </td>
                  <td className="hidden sm:table-cell px-4 py-3">
                    <span className={`badge ${item.typ === 'příjem' ? 'bg-green-100 text-green-800 border border-green-200' : 'bg-red-100 text-red-800 border border-red-200'}`}>
                      {item.typ === 'příjem' ? '📈 Příjem' : '📉 Výdaj'}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`badge border ${KATEGORIE_FINANCE[item.kategorie] ? (item.typ === 'příjem' ? 'bg-blue-100 text-blue-800 border-blue-200' : 'bg-orange-100 text-orange-800 border-orange-200') : 'bg-gray-100 border-gray-300'}`}>
                      {KATEGORIE_FINANCE[item.kategorie] || item.kategorie}
                    </span>
                  </td>
                  <td className="hidden md:table-cell px-4 py-3 text-gray-700">{item.protoplatitel}</td>
                  <td className={`px-4 py-3 text-right font-mono font-semibold ${item.typ === 'příjem' ? 'text-green-600' : 'text-red-600'}`}>
                    {item.typ === 'příjem' ? '+' : '-'}{parseFloat(String(item.castka)).toLocaleString('cs-CZ')} Kč
                  </td>
                  <td className="hidden lg:table-cell px-4 py-3 text-gray-600 text-sm">{item.popisek}</td>
                </tr>
              ))}
            </tbody>

            {/* Pěkný součet v patičce */}
          </table>

          <div className="px-4 py-3 border-t bg-gradient-to-r from-gray-50 to-blue-50 flex justify-between items-center">
            <span className="text-sm font-semibold text-gray-700">Součet:</span>
            <span className={`font-bold text-lg ${celkemPříjem - celkemVýdaj >= 0 ? 'text-blue-600' : 'text-red-600'}`}>
              {(celkemPříjem - celkemVýdaj).toLocaleString('cs-CZ')} Kč
            </span>
          </div>
        </div>
      ) : (
        <div className="card text-center py-12">
          <p className="text-6xl mb-4">💰</p>
          <h3 className="text-lg font-semibold text-gray-900 mb-2">Žádné záznamy nenalezeny</h3>
          {typFilter || mesicParam ? (
            <>
              <p className="text-gray-500 mb-4">Zkuste změnit filtry nebo přidat nový záznam.</p>
              <Link href="/finance" className="btn-secondary inline-block mr-2">Vymazat filtry</Link>
              <Link href="/finance/new" className="btn-primary inline-block">Přidat záznam</Link>
            </>
          ) : (
            <>
              <p className="text-gray-500 mb-4">Začněte přidáním prvního finančního záznamu.</p>
              <Link href="/finance/new" className="btn-primary inline-block">Přidat záznam</Link>
            </>
          )}
        </div>
      )}

      {/* Přehled podle kategorií - tabulka */}
      {Object.keys(kategorieStats).length > 0 && (
        <section className="card">
          <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
            📊 Přehled podle kategorií
          </h3>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50">
                  <th className="text-left px-4 py-2 font-semibold text-gray-700">Kategorie</th>
                  <th className="text-right px-4 py-2 font-semibold text-green-600">Příjmy (Kč)</th>
                  <th className="text-right px-4 py-2 font-semibold text-red-600">Výdaje (Kč)</th>
                  <th className="text-right px-4 py-2 font-semibold text-gray-700">Saldo</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {Object.entries(kategorieStats).map(([kategorie, data]) => (
                  <tr key={kategorie} className="hover:bg-blue-50 transition-colors">
                    <td className="px-4 py-3 font-medium text-gray-900">{KATEGORIE_FINANCE[kategorie] || kategorie}</td>
                    <td className="px-4 py-3 text-right font-mono text-green-600">{data.příjmy.toLocaleString('cs-CZ')}</td>
                    <td className="px-4 py-3 text-right font-mono text-red-600">{data.výdaje.toLocaleString('cs-CZ')}</td>
                    <td className={`px-4 py-3 text-right font-mono font-semibold ${data.příjmy - data.výdaje >= 0 ? 'text-blue-600' : 'text-red-600'}`}>
                      {(data.příjmy - data.výdaje).toLocaleString('cs-CZ')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Export tlačítka */}
      <div className="flex gap-3">
        <Link href="/api/export-csv" className="btn-secondary inline-block flex items-center gap-2">
          📥 Export do CSV
        </Link>
        <Link href="/api/export-pdf" className="btn-secondary inline-block flex items-center gap-2">
          📄 Export PDF reportu
        </Link>
      </div>
    </div>
  );
}
