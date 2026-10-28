// FARNÍ AGENDA - STATISTIKY DASHBOARD
// Stránka /statistiky — přehled křtů, birování a svateb s CSS-based grafickým zobrazením

import { createClient } from '@/lib/supabase/server';
import Link from 'next/link';
import { monthRange } from '@/lib/services/svatosti-service';

// Data se načítají při requestu (ne při buildu) — placeholder Supabase URL by jinak timeoutovala statický export
export const dynamic = 'force-dynamic';

export default async function StatistikyPage() {
  const supabase = await createClient();
  
  // Statistika členství + svátosti — vše načítáme paralelně (oprava: dříve 12 sériových query)
  const currentYear = new Date().getFullYear();
  const currentMonth0 = new Date().getMonth(); // 0-based

  // Posledních 6 měsíců v chronologickém pořadí (nejstarší → aktuální)
  const months = Array.from({ length: 6 }, (_, idx) => {
    const d = new Date(Date.UTC(currentYear, currentMonth0 - (5 - idx), 1));
    return { year: d.getUTCFullYear(), month0: d.getUTCMonth() };
  });

  // Celkové počty svátostí — z tabulek svátostí (oprava: osoby nemá sloupce svatost_*)
  const [clenuRes, krestyTotalRes, birovaniTotalRes, svatbyTotalRes, ...sacreResults] = await Promise.all([
    supabase.from('osoby').select('*').order('datum_narozeni', { ascending: false }),
    supabase.from('krestni_zapis').select('id', { count: 'exact', head: true }),
    supabase.from('birovani_zapis').select('id', { count: 'exact', head: true }),
    supabase.from('svatby').select('id', { count: 'exact', head: true }),
    ...months.flatMap(({ year, month0 }) => {
      const range = monthRange(year, month0);
      return [
        // Oprava: tabulky krestni_zapis/birovani_zapis (ne "krestni_zapisky") a správné sloupce;
        // horní hranice = 1. den následujícího měsíce (dříve "-31" → v únoru invalidní datum)
        supabase.from('krestni_zapis').select('id', { count: 'exact', head: true })
          .gte('datum_krstu', range.from).lt('datum_krstu', range.toExclusive),
        supabase.from('birovani_zapis').select('id', { count: 'exact', head: true })
          .gte('datum_birovani', range.from).lt('datum_birovani', range.toExclusive),
      ];
    }),
  ]);

  const clenuStats = clenuRes.data || [];

  // Statistiky svátostí za posledních 6 měsíců (chronologicky)
  const sacreData: { mesic: string; kresty: number; birovani: number }[] = months.map((m, i) => ({
    mesic: new Date(Date.UTC(m.year, m.month0)).toLocaleDateString('cs-CZ', { month: 'long' }),
    kresty: sacreResults[i * 2]?.count ?? 0,
    birovani: sacreResults[i * 2 + 1]?.count ?? 0,
  }));

  // Celkové statistiky svátostí
  const totalKresty = krestyTotalRes.count ?? 0;
  const totalBirovani = birovaniTotalRes.count ?? 0;
  const totalSvatby = svatbyTotalRes.count ?? 0;

  // Rozdělení podle statusu
  const activeCount = clenuStats.filter((p: any) => p.clenstvi_status === 'aktivni').length || 0;
  const inactiveCount = clenuStats.filter((p: any) => p.clenstvi_status !== 'aktivni' && p.clenstvi_status !== 'bez_farnosti').length || 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">📊 Statistiky farnosti</h1>
        <p className="text-sm text-gray-600 mt-1">Přehled svátostí, členství a finančních toků</p>
      </div>

      {/* Karty s celkovými statistikami */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Link href="/osoby" className="card flex items-center gap-3 hover:shadow-md transition-shadow block group">
          <span className="text-4xl">👥</span>
          <div>
            <p className="text-sm text-gray-500 font-medium">Celkem členů</p>
            <p className="text-2xl font-bold text-blue-600">{clenuStats?.length || 0}</p>
          </div>
        </Link>

        <div className="card flex items-center gap-3 bg-green-50 border-green-200">
          <span className="text-4xl">✅</span>
          <div>
            <p className="text-sm text-gray-500 font-medium">Aktivní</p>
            <p className="text-2xl font-bold text-green-600">{activeCount}</p>
          </div>
        </div>

        <div className="card flex items-center gap-3 bg-red-50 border-red-200">
          <span className="text-4xl">❌</span>
          <div>
            <p className="text-sm text-gray-500 font-medium">Neaktivní</p>
            <p className="text-2xl font-bold text-red-600">{inactiveCount}</p>
          </div>
        </div>

        <Link href="/finance" className="card flex items-center gap-3 hover:shadow-md transition-shadow block group">
          <span className="text-4xl">💰</span>
          <div>
            <p className="text-sm text-gray-500 font-medium">Finanční přehled</p>
            <p className="text-sm font-semibold text-blue-600 group-hover:underline">Zobrazit →</p>
          </div>
        </Link>
      </div>

      {/* Bar Chart - Křty a Birování za měsíc */}
      <section className="card">
        <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
          📊 Svátosti za posledních 6 měsíců
        </h3>

        {sacreData.length > 0 ? (
          <div className="space-y-4">
            {sacreData.map((data, index) => (
              <div key={index} className="grid grid-cols-12 gap-4 items-center">
                {/* Label */}
                <div className="col-span-3 sm:col-span-2 text-sm font-medium text-gray-700">{data.mesic}</div>
                
                {/* Křty bar */}
                <div className="col-span-9 sm:col-span-5">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs text-gray-500 w-16">Křty</span>
                  </div>
                  <div className="w-full bg-gray-100 rounded-full h-4 overflow-hidden">
                    <div 
                      className="bg-blue-500 h-full rounded-full transition-all duration-500"
                      style={{ width: `${Math.min((data.kresty / Math.max(...sacreData.map(d => d.kresty), 1)) * 100, 100)}%` }}
                    />
                  </div>
                  <span className="text-xs text-blue-600 font-medium">{data.kresty}</span>
                </div>

                {/* Birování bar */}
                <div className="col-span-9 sm:col-span-5">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs text-gray-500 w-16">Birování</span>
                  </div>
                  <div className="w-full bg-gray-100 rounded-full h-4 overflow-hidden">
                    <div 
                      className="bg-green-500 h-full rounded-full transition-all duration-500"
                      style={{ width: `${Math.min((data.birovani / Math.max(...sacreData.map(d => d.birovani), 1)) * 100, 100)}%` }}
                    />
                  </div>
                  <span className="text-xs text-green-600 font-medium">{data.birovani}</span>
                </div>

                {/* Legend */}
                {index === sacreData.length - 1 && (
                  <div className="col-span-full flex gap-4 mt-2 pt-2 border-t">
                    <span className="text-xs text-blue-600 font-medium">● Křty</span>
                    <span className="text-xs text-green-600 font-medium">● Birování</span>
                  </div>
                )}
              </div>
            ))}
          </div>
        ) : (
          <p className="text-gray-500 text-center py-8">Žádné data o svátostech v posledních 6 měsících</p>
        )}

        {/* SVG Line Chart - Trend */}
        {sacreData.length > 2 && (
          <div className="mt-6 pt-4 border-t">
            <h4 className="text-sm font-semibold text-gray-700 mb-3">📈 Trend křtů a birování</h4>
            <svg viewBox="0 0 400 200" className="w-full h-48 bg-white rounded border border-gray-200">
              {/* Grid lines */}
              {[0, 50, 100, 150, 200].map((y, i) => (
                <line key={i} x1="40" y1={y} x2="380" y2={y} stroke="#e5e7eb" strokeWidth="1" />
              ))}

              {/* Y-axis labels */}
              {[0, 50, 100, 150, 200].map((y, i) => (
                <text key={i} x="35" y={y + 4} fontSize="10" fill="#9ca3af" textAnchor="end">
                  {Math.round(6 - (i * 1.5))}
                </text>
              ))}

              {/* X-axis labels */}
              {sacreData.map((data, i) => (
                <text 
                  key={i} 
                  x={60 + (i * 72)} 
                  y="210" 
                  fontSize="9" 
                  fill="#9ca3af" 
                  textAnchor="middle"
                >
                  {data.mesic.slice(0, 3)}
                </text>
              ))}

              {/* Křty line */}
              <polyline
                points={sacreData.map((d, i) => `${60 + (i * 72)},${180 - (d.kresty * 30)}`).join(' ')}
                fill="none"
                stroke="#3b82f6"
                strokeWidth="2.5"
              />

              {/* Birování line */}
              <polyline
                points={sacreData.map((d, i) => `${60 + (i * 72)},${180 - (d.birovani * 30)}`).join(' ')}
                fill="none"
                stroke="#10b981"
                strokeWidth="2.5"
              />

              {/* Křty dots */}
              {sacreData.map((d, i) => (
                <circle key={`k-${i}`} cx={60 + (i * 72)} cy={180 - (d.kresty * 30)} r="4" fill="#3b82f6" />
              ))}

              {/* Birování dots */}
              {sacreData.map((d, i) => (
                <circle key={`b-${i}`} cx={60 + (i * 72)} cy={180 - (d.birovani * 30)} r="4" fill="#10b981" />
              ))}

              {/* Legend */}
              <rect x="300" y="10" width="12" height="3" fill="#3b82f6" rx="1.5" />
              <text x="318" y="14" fontSize="9" fill="#6b7280">Křty</text>
              
              <rect x="300" y="24" width="12" height="3" fill="#10b981" rx="1.5" />
              <text x="318" y="28" fontSize="9" fill="#6b7280">Birování</text>
            </svg>
          </div>
        )}
      </section>

      {/* Pie chart - Členství podle statusu */}
      <section className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Pie chart SVG */}
        <div className="card flex items-center justify-center p-8">
          {activeCount + inactiveCount > 0 ? (
            <svg viewBox="0 0 200 200" className="w-48 h-48">
              {/* Active segment */}
              <circle 
                cx="100" cy="100" r="80" 
                fill="none" 
                stroke="#3b82f6" 
                strokeWidth="40"
                strokeDasharray={`${(activeCount / (activeCount + inactiveCount)) * 502.65} ${502.65}`}
              />
              
              {/* Inactive segment */}
              <circle 
                cx="100" cy="100" r="80" 
                fill="none" 
                stroke="#ef4444" 
                strokeWidth="40"
                strokeDasharray={`${(inactiveCount / (activeCount + inactiveCount)) * 502.65} ${502.65}`}
                transform="rotate(-90 100 100)"
              />

              {/* Center label */}
              <text x="100" y="95" fontSize="18" fontWeight="bold" fill="#374151" textAnchor="middle">
                {activeCount + inactiveCount}
              </text>
              <text x="100" y="112" fontSize="10" fill="#6b7280" textAnchor="middle">celkem</text>
            </svg>
          ) : (
            <div className="w-48 h-48 flex items-center justify-center bg-gray-50 rounded-full border border-dashed border-gray-300">
              <p className="text-sm text-gray-500">Žádná data</p>
            </div>
          )}

          {/* Legend */}
        </div>

        {/* Pie chart legend */}
        <div className="md:col-span-2 card p-6 flex flex-col justify-center gap-4">
          {activeCount + inactiveCount > 0 ? (
            <>
              {/* Active segment */}
              <Link href="/osoby?status=aktivni" className="card flex items-center justify-between hover:bg-blue-50 transition-colors block group">
                <div className="flex items-center gap-3">
                  <span className="w-4 h-4 bg-green-500 rounded-full"></span>
                  <span className="font-medium text-gray-900 group-hover:text-blue-600">Aktivní členové</span>
                </div>
                <span className="text-lg font-bold text-green-600">{activeCount}</span>
              </Link>

              {/* Inactive segment */}
              <Link href="/osoby?status=neaktivni" className="card flex items-center justify-between hover:bg-red-50 transition-colors block group">
                <div className="flex items-center gap-3">
                  <span className="w-4 h-4 bg-red-500 rounded-full"></span>
                  <span className="font-medium text-gray-900 group-hover:text-red-600">Neaktivní</span>
                </div>
                <span className="text-lg font-bold text-red-600">{inactiveCount}</span>
              </Link>

              {/* Summary */}
              <div className="pt-4 border-t bg-gray-50 p-4 rounded">
                <p className="text-sm text-gray-600">
                  Aktivační poměr: <strong>{activeCount + inactiveCount > 0 ? Math.round((activeCount / (activeCount + inactiveCount)) * 100) : 0}%</strong> členů je aktivních
                </p>
              </div>
            </>
          ) : (
            <p className="text-gray-500 text-center">Žádná data o členech k dispozici</p>
          )}
        </div>
      </section>

      {/* Statistika svátostí */}
      <section className="card">
          <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
            ✝️ Celkové statistiky svátostí
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Křty */}
            <Link href="/krestni-zapisky" className="card flex items-center gap-4 hover:bg-blue-50 transition-colors block group">
              <span className="text-4xl">⛪</span>
              <div>
                <p className="text-sm text-gray-500 font-medium">Celkové křty</p>
                <p className="text-3xl font-bold text-blue-600">{totalKresty}</p>
              </div>
            </Link>

            {/* Birování */}
            <Link href="/krestni-zapisky" className="card flex items-center gap-4 hover:bg-green-50 transition-colors block group">
              <span className="text-4xl">🕊️</span>
              <div>
                <p className="text-sm text-gray-500 font-medium">Celkové birování</p>
                <p className="text-3xl font-bold text-green-600">{totalBirovani}</p>
              </div>
            </Link>

            {/* Svadby */}
            <Link href="/krestni-zapisky" className="card flex items-center gap-4 hover:bg-purple-50 transition-colors block group">
              <span className="text-4xl">💒</span>
              <div>
                <p className="text-sm text-gray-500 font-medium">Celkové svatby</p>
                <p className="text-3xl font-bold text-purple-600">{totalSvatby}</p>
              </div>
            </Link>
          </div>

          {/* SVG Pie chart for svátosti */}
          <svg viewBox="0 0 200 200" className="w-full max-w-xs mx-auto mt-6">
            {totalKresty + totalBirovani + totalSvatby > 0 ? (
              <>
                {/* Křty segment */}
                <circle 
                  cx="100" cy="100" r="80" 
                  fill="none" 
                  stroke="#3b82f6" 
                  strokeWidth="40"
                  strokeDasharray={`${(totalKresty / (totalKresty + totalBirovani + totalSvatby)) * 502.65} ${502.65}`}
                />
                
                {/* Birování segment */}
                <circle 
                  cx="100" cy="100" r="80" 
                  fill="none" 
                  stroke="#10b981" 
                  strokeWidth="40"
                  strokeDasharray={`${(totalBirovani / (totalKresty + totalBirovani + totalSvatby)) * 502.65} ${502.65}`}
                  transform={`rotate(${((totalKresty / (totalKresty + totalBirovani + totalSvatby)) * 360) - 90} 100 100)`}
                />

                {/* Svadby segment */}
                <circle 
                  cx="100" cy="100" r="80" 
                  fill="none" 
                  stroke="#a855f7" 
                  strokeWidth="40"
                  strokeDasharray={`${(totalSvatby / (totalKresty + totalBirovani + totalSvatby)) * 502.65} ${502.65}`}
                />

                {/* Center */}
                <circle cx="100" cy="100" r="60" fill="white" />
                <text x="100" y="95" fontSize="14" fontWeight="bold" fill="#374151" textAnchor="middle">
                  {totalKresty + totalBirovani + totalSvatby}
                </text>
              </>
            ) : (
              <circle cx="100" cy="100" r="80" fill="#f9fafb" stroke="#e5e7eb" strokeWidth="40" />
            )}
          </svg>

          {/* Legend */}
      </section>

      {/* Recent activities */}
      <section className="card">
        <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
          📋 Poslední aktivity (připojení k detailním stránkám)
        </h3>

        {clenuStats && clenuStats.length > 0 ? (
          <Link href="/osoby" className="block">
            <div className="bg-blue-50 border-l-4 border-blue-500 p-4 rounded-r-lg hover:bg-blue-100 transition-colors cursor-pointer">
              <h4 className="font-semibold text-gray-900">{clenuStats[0].krestni_jmeno} {clenuStats[0].prijmeni}</h4>
              <p className="text-sm text-gray-600 mt-1">Poslední aktualizace: {new Date(clenuStats[0].datum_narozeni).toLocaleDateString('cs-CZ')}</p>
            </div>
          </Link>
        ) : (
          <p className="text-gray-500 text-center py-8">Žádné aktivity k zobrazení</p>
        )}

        {/* Legend */}
      </section>

      {/* Export tlačítka */}
      <div className="flex gap-3 flex-wrap">
        <Link href="/api/export-pdf" className="btn-secondary inline-flex items-center gap-2">
          📄 Export do PDF
        </Link>
        <Link href="/api/export-csv" className="btn-secondary inline-flex items-center gap-2">
          📥 Export do CSV
        </Link>
        <button className="btn-primary inline-flex items-center gap-2 bg-green-600 hover:bg-green-700">
          💾 Generovat měsíční report
        </button>
      </div>
    </div>
  );
}
