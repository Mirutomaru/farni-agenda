// FARNÍ AGENDA - DASHBOARD / PŘEHLED
// Hlavní přehledová stránka se statistikami a rychlými odkazy

import { createClient } from '@/lib/supabase/server';
import Link from 'next/link';

// Dashboard čte session + data → musí být dynamický (audit 007: statická cache
// prázdného stavu by se servírovala všem uživatelům)
export const dynamic = 'force-dynamic';

export default async function DashboardPage() {
  const supabase = await createClient();
  
  // Získání aktuálního uživatele
  const { data: { user } } = await supabase.auth.getUser();
  
  // Načtení statistik z backendu
  const { data: statsData, error: statsError } = await supabase
    .rpc('get_monthly_statistics', { rok: new Date().getFullYear(), mesic: new Date().getMonth() + 1 });

  const totalMembers = statsData?.reduce((sum: number, s: any) => sum + (s.celkem_clenu || 0), 0) || 0;
  const activeMembers = statsData?.reduce((sum: number, s: any) => sum + (s.aktivni_clenu || 0), 0) || 0;

  // Počet farností
  const { data: farnosti } = await supabase.from('farnosti').select('id', { count: 'exact' });

  return (
    <div className="space-y-6">
      {/* Úvodní banner */}
      <div className="bg-gradient-to-r from-blue-600 to-indigo-700 rounded-xl p-6 text-white shadow-lg">
        <h1 className="text-2xl font-bold mb-1">Vítejte v Farní Agendě 👋</h1>
        <p className="text-blue-100">
          {user?.email ? `Přihlášen jako ${user.email}` : 'Nepřihlášen'}
        </p>
      </div>

      {/* Statistiky */}
      <section>
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Statistiky této farnosti</h2>
        
        {statsError && (
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 text-sm text-yellow-800 mb-4">
            ⚠️ Funkce get_monthly_statistics není v databázi. Aplikujte schema.sql na Supabase:
            <code className="block mt-1 bg-white px-2 py-1 rounded text-xs">SELECT * FROM information_schema.tables WHERE table_name = &apos;osoby&apos;;</code>
          </div>
        )}

        {statsError ? (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {[1, 2, 3].map(i => (
              <div key={i} className="card animate-pulse bg-gray-100 h-32" />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {/* Celkový počet členů */}
            <Link href="/osoby" className="card hover:shadow-md transition-shadow block group">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-gray-500">Celkem členů</span>
                <span className="text-2xl">👥</span>
              </div>
              <p className="text-3xl font-bold text-gray-900">{totalMembers}</p>
              <p className="text-xs text-blue-600 mt-1 group-hover:underline">Zobrazit osoby →</p>
            </Link>

            {/* Aktivní členové */}
            <div className="card hover:shadow-md transition-shadow block">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-gray-500">Aktivních</span>
                <span className="text-2xl">✅</span>
              </div>
              <p className="text-3xl font-bold text-green-600">{activeMembers}</p>
            </div>

            {/* Počet farností */}
            <div className="card hover:shadow-md transition-shadow block">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-gray-500">Farnosti</span>
                <span className="text-2xl">⛪</span>
              </div>
              <p className="text-3xl font-bold text-blue-600">{farnosti?.length || 0}</p>
            </div>

            {/* Celkové finance */}
            <Link href="/finance" className="card hover:shadow-md transition-shadow block group">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-gray-500">Finanční přehled</span>
                <span className="text-2xl">💰</span>
              </div>
              <p className="text-sm text-blue-600 mt-1 group-hover:underline">Zobrazit →</p>
            </Link>
          </div>
        )}
      </section>

      {/* Rychlé akce */}
      {user && (
        <section>
          <h2 className="text-xl font-semibold text-gray-900 mb-4">Rychlé akce</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Přidat osobu */}
            <Link href="/osoby/new" className="card hover:shadow-md transition-shadow block group text-left">
              <span className="text-2xl mb-2 block">➕</span>
              <h3 className="font-semibold text-gray-900 group-hover:text-blue-600 transition-colors">Přidat osobu</h3>
              <p className="text-sm text-gray-500 mt-1">Nový záznam člena farnosti s kontakty a svátostmi</p>
            </Link>

            {/* Křestní zápisy */}
            <Link href="/krestni-zapisky" className="card hover:shadow-md transition-shadow block group text-left">
              <span className="text-2xl mb-2 block">✝️</span>
              <h3 className="font-semibold text-gray-900 group-hover:text-blue-600 transition-colors">Křestní zápisy</h3>
              <p className="text-sm text-gray-500 mt-1">Správa křestních a birovacích zápisů s generováním certifikátů</p>
            </Link>

            {/* Statistiky */}
            <Link href="/statistiky" className="card hover:shadow-md transition-shadow block group text-left">
              <span className="text-2xl mb-2 block">📊</span>
              <h3 className="font-semibold text-gray-900 group-hover:text-blue-600 transition-colors">Statistiky</h3>
              <p className="text-sm text-gray-500 mt-1">Přehled křtů, birování a svateb s grafickým zobrazením</p>
            </Link>

            {/* Majetek */}
            <Link href="/majetek" className="card hover:shadow-md transition-shadow block group text-left">
              <span className="text-2xl mb-2 block">🏛️</span>
              <h3 className="font-semibold text-gray-900 group-hover:text-blue-600 transition-colors">Majetek</h3>
              <p className="text-sm text-gray-500 mt-1">Sprava farního majetku a inventáře s oceněním</p>
            </Link>

            {/* Finance */}
            <Link href="/finance" className="card hover:shadow-md transition-shadow block group text-left">
              <span className="text-2xl mb-2 block">💰</span>
              <h3 className="font-semibold text-gray-900 group-hover:text-blue-600 transition-colors">Finance</h3>
              <p className="text-sm text-gray-500 mt-1">Příjmy a výdaje farnosti s přehledem podle kategorií</p>
            </Link>

            {/* Export záloh */}
            <div className="card hover:shadow-md transition-shadow block group text-left">
              <span className="text-2xl mb-2 block">💾</span>
              <h3 className="font-semibold text-gray-900 group-hover:text-blue-600 transition-colors">Zálohování</h3>
              <p className="text-sm text-gray-500 mt-1">Export dat do Google Cloud Storage (spouští se automaticky)</p>
            </div>
          </div>
        </section>
      )}

      {/* Nedávno přidané osoby */}
      {user && (
        <section>
          <h2 className="text-xl font-semibold text-gray-900 mb-4">Nedávné osob</h2>
          
          {statsError ? (
            <div className="card p-8 text-center text-gray-500">
              ⚠️ Aplikujte schema.sql na Supabase pro zobrazení dat
            </div>
          ) : (
            <>
              <Link href="/osoby" className="text-blue-600 hover:text-blue-700 mb-4 inline-block text-sm font-medium">Zobrazit všechny osoby →</Link>

              {statsError ? (
                <div className="card p-8 text-center text-gray-500">
                  ⚠️ Aplikujte schema.sql na Supabase pro zobrazení dat
                </div>
              ) : null}
            </>
          )}
        </section>
      )}

      {/* Statistiky bez chybové hlášky */}
      {user && !statsError && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-4">
          {/* Přehled členů podle statusu */}
          <Link href="/osoby" className="card hover:shadow-md transition-shadow block group text-left">
            <h3 className="font-semibold text-gray-900 group-hover:text-blue-600 mb-2 flex items-center gap-2">
              👥 Členové farnosti
            </h3>
            <p className="text-sm text-gray-500 mb-3">Spravujte záznamy členů, kontakty a svátostní data</p>
            <div className="flex gap-2 flex-wrap">
              <span className="badge badge-active">Aktivní: {activeMembers}</span>
              <span className="badge badge-warning">Celkem: {totalMembers}</span>
            </div>
          </Link>

          {/* Přehled křtů a birování */}
          <Link href="/statistiky" className="card hover:shadow-md transition-shadow block group text-left">
            <h3 className="font-semibold text-gray-900 group-hover:text-blue-600 mb-2 flex items-center gap-2">
              📊 Statistiky svátostí
            </h3>
            <p className="text-sm text-gray-500 mb-3">Přehled křtů, birování a svateb s grafickým zobrazením</p>
            {statsData && statsData.length > 0 ? (
              <div className="flex gap-2 flex-wrap">
                <span className="badge badge-active">Křty: {statsData.reduce((s: number, st: any) => s + (st.kresty || 0), 0)}</span>
                <span className="badge badge-warning">Birování: {statsData.reduce((s: number, st: any) => s + (st.birovani || 0), 0)}</span>
              </div>
            ) : null}
          </Link>

          {/* Přehled majetku */}
          <Link href="/majetek" className="card hover:shadow-md transition-shadow block group text-left">
            <h3 className="font-semibold text-gray-900 group-hover:text-blue-600 mb-2 flex items-center gap-2">
              🏛️ Majetek farnosti
            </h3>
            <p className="text-sm text-gray-500 mb-3">Inventář nemovitostí, movitostí a duchovních pomůcek</p>
          </Link>

          {/* Přehled financí */}
          <Link href="/finance" className="card hover:shadow-md transition-shadow block group text-left">
            <h3 className="font-semibold text-gray-900 group-hover:text-blue-600 mb-2 flex items-center gap-2">
              💰 Finanční přehled
            </h3>
            <p className="text-sm text-gray-500 mb-3">Příjmy a výdaje farnosti s kategoriemi a dokumenty</p>
          </Link>
        </div>
      )}

      {/* Pokud není přihlášený */}
      {!user && (
        <section className="text-center py-8">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">Přihlaste se pro přístup</h2>
          <p className="text-gray-600 mb-4">Pro zobrazení přehledu a správu farnosti se prosím přihlaste.</p>
          <Link href="/login" className="btn-primary inline-block">Přihlásit se</Link>
        </section>
      )}

      {/* Debug info pro vývojáře */}
      {user && statsError ? (
        <div className="card bg-gray-50 border border-gray-200">
          <h3 className="text-sm font-semibold text-gray-700 mb-2">⚠️ Chybějící funkce ve schema</h3>
          <p className="text-xs text-gray-600 mb-3">Pro kompletní funkci aplikace aplikujte upravené schema.sql:</p>
          <div className="bg-white border rounded p-2 font-mono text-xs overflow-x-auto">
            <code>{`# Aplikace na Supabase (SQL Editor nebo CLI):\nsupabase db push\n# Nebo: copy schema.sql do SQL Editor v Supabase Dashboard`}</code>
          </div>
        </div>
      ) : null}
    </div>
  );
}
