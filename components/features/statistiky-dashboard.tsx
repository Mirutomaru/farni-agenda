// FARNÍ AGENDA - NEXT.JS KOMPONENTA
// Dashboard statistik pro synodu a farnosti

'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';

interface FarnostStat {
  farnost_id: string;
  farnost_nazev: string;
  celkem_clenu: number;
  aktivni_clenu: number;
  nove_prijati: number;
  kresty: number;
  birovani: number;
  svatby: number;
  pohreby: number;
}

export default function StatistikyDashboard() {
  const supabase = createClient();
  const [loading, setLoading] = useState(false);
  const [rok, setRok] = useState(new Date().getFullYear());
  const [mesic, setMesic] = useState(new Date().getMonth() + 1);
  const [stats, setStats] = useState<FarnostStat[]>([]);
  const [totals, setTotals] = useState({
    celkemClenu: 0,
    kresty: 0,
    birovani: 0,
    svatby: 0,
    pohreby: 0
  });

  useEffect(() => {
    loadStatistics();
  }, [rok, mesic]);

  const loadStatistics = async () => {
    setLoading(true);
    
    try {
      const { data, error } = await supabase.rpc('get_monthly_statistics', { rok, mesic });
      
      if (error) throw error;
      
      setStats(data || []);
      
      // Výpočet celkových součtů
      const total = {
        celkemClenu: 0,
        kresty: 0,
        birovani: 0,
        svatby: 0,
        pohreby: 0
      };

      for (const stat of data || []) {
        total.celkemClenu += stat.celkem_clenu;
        total.kresty += stat.kresty || 0;
        total.birovani += stat.birovani || 0;
        total.svatby += stat.svatby || 0;
        total.pohreby += stat.pohreby || 0;
      }

      setTotals(total);
    } catch (err) {
      console.error('Chyba při načítání statistik:', err);
    } finally {
      setLoading(false);
    }
  };

  const generateReport = async () => {
    try {
      const response = await fetch('/api/generate-monthly-report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rok, mesic })
      });

      if (!response.ok) throw new Error('Generování reportu selhalo');

      const result = await response.json();
      alert(`Report byl odeslán na e-mail biskupa a synodní rady`);
      
    } catch (err) {
      console.error('Chyba při generování reportu:', err);
      alert('Chyba při odesílání reportu');
    }
  };

  return (
    <div className="max-w-6xl mx-auto p-6">
      <h1 className="text-3xl font-bold mb-6">📊 Statistiky Starokatolické církve</h1>

      {/* Filtry */}
      <div className="bg-white rounded-lg shadow-md p-4 mb-6 flex items-center space-x-4">
        <label htmlFor="rok-select" className="text-sm font-medium">Rok:</label>
        <select 
          id="rok-select"
          value={rok} 
          onChange={(e) => setRok(Number(e.target.value))}
          className="p-2 border rounded"
        >
          {[...Array(10)].map((_, i) => (
            <option key={i} value={new Date().getFullYear() - 5 + i}>
              {new Date().getFullYear() - 5 + i}
            </option>
          ))}
        </select>

        <label htmlFor="mesic-select" className="text-sm font-medium ml-4">Měsíc:</label>
        <select 
          id="mesic-select"
          value={mesic} 
          onChange={(e) => setMesic(Number(e.target.value))}
          className="p-2 border rounded"
        >
          {Array.from({ length: 12 }, (_, i) => (
            <option key={i + 1} value={i + 1}>
              {new Date(0, i).toLocaleString('cs-CZ', { month: 'long' })}
            </option>
          ))}
        </select>

        <button 
          onClick={loadStatistics}
          className="ml-4 bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700"
        >
          Načíst
        </button>

        <button 
          onClick={generateReport}
          className="bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700 ml-auto"
        >
          📧 Odeslat report
        </button>
      </div>

      {/* Celkové součty */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4 mb-6">
        <div className="bg-blue-50 rounded-lg p-4 text-center">
          <h3 className="text-sm font-medium text-gray-600">Celkem členů</h3>
          <p className="text-2xl font-bold text-blue-700">{totals.celkemClenu}</p>
        </div>

        <div className="bg-green-50 rounded-lg p-4 text-center">
          <h3 className="text-sm font-medium text-gray-600">Křty</h3>
          <p className="text-2xl font-bold text-green-700">{totals.kresty}</p>
        </div>

        <div className="bg-purple-50 rounded-lg p-4 text-center">
          <h3 className="text-sm font-medium text-gray-600">Birování</h3>
          <p className="text-2xl font-bold text-purple-700">{totals.birovani}</p>
        </div>

        <div className="bg-pink-50 rounded-lg p-4 text-center">
          <h3 className="text-sm font-medium text-gray-600">Svatby</h3>
          <p className="text-2xl font-bold text-pink-700">{totals.svatby}</p>
        </div>

        <div className="bg-gray-50 rounded-lg p-4 text-center">
          <h3 className="text-sm font-medium text-gray-600">Pohřby</h3>
          <p className="text-2xl font-bold text-gray-700">{totals.pohreby}</p>
        </div>
      </div>

      {/* Tabulka statistik */}
      {loading ? (
        <div className="text-center py-12">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Načítání statistik...</p>
        </div>
      ) : (
        <div className="bg-white rounded-lg shadow-md overflow-hidden">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Farnost</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Členů</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Křty</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Birování</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Svatby</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Pohřby</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {stats.map((stat) => (
                <tr key={stat.farnost_id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                    {stat.farnost_nazev}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-right text-gray-700">
                    {stat.celkem_clenu}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-right text-green-600 font-medium">
                    {stat.kresty || 0}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-right text-purple-600 font-medium">
                    {stat.birovani || 0}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-right text-pink-600 font-medium">
                    {stat.svatby || 0}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-right text-gray-600">
                    {stat.pohreby || 0}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {stats.length === 0 && (
            <div className="text-center py-12 text-gray-500">
              Žádná data pro vybrané období
            </div>
          )}
        </div>
      )}

      {/* Grafy (placeholder - v praxi použít Chart.js nebo podobnou knihovnu) */}
      <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-white rounded-lg shadow-md p-4">
          <h3 className="text-lg font-semibold mb-4">Křty a birování</h3>
          <div className="h-64 bg-gray-100 flex items-center justify-center text-gray-500">
            [Graf - Křty vs. Birování]
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-md p-4">
          <h3 className="text-lg font-semibold mb-4">Svatby a pohřby</h3>
          <div className="h-64 bg-gray-100 flex items-center justify-center text-gray-500">
            [Graf - Svatby vs. Pohřby]
          </div>
        </div>
      </div>
    </div>
  );
}
