// FARNÍ AGENDA - NEXT.JS KOMPONENTA
// Formulář pro svatební zápis se svědky (tabulky svatby + svatba_svedkove)

'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { logger } from '@/lib/logging/logger';
import { buildSvedkoveRows } from '@/lib/services/svatosti-service';

const log = logger('SVATBA_FORM');

interface Osoba {
  id: string;
  krestni_jmeno: string;
  prijmeni: string;
}

export default function SvatbaForm() {
  const supabase = createClient();
  const [loading, setLoading] = useState(false);
  const [osoby, setOsoby] = useState<Osoba[]>([]);

  const [formData, setFormData] = useState({
    muz_id: '',
    zena_id: '',
    datum_svatby: '',
    misto_svatby: '',
    farar_vedouci: '',
    priprava_datum: '',
    priprava_zapis: '',
  });

  // Svědkové — seznam ID (max. 2, dle zvyklosti; volitelné)
  const [svedek1Id, setSvedek1Id] = useState('');
  const [svedek2Id, setSvedek2Id] = useState('');

  const loadOsoby = async () => {
    try {
      const { data, error } = await supabase
        .from('osoby')
        .select('id, krestni_jmeno, prijmeni') // jen potřebná pole (performance)
        .eq('clenstvi_status', 'aktivni')
        .order('prijmeni');

      if (error) throw error;
      setOsoby(data || []);
    } catch (err) {
      log.error('Chyba při načítání osob', {}, err instanceof Error ? err : null);
    }
  };

  useEffect(() => {
    loadOsoby();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      // 1. Vytvoření záznamu o svatbě
      const { data: svatba, error } = await supabase
        .from('svatby')
        .insert([formData])
        .select()
        .single();

      if (error) throw error;

      // 2. Zápis svědků do relace svatba_svedkove (jen pokud jsou zvoleni)
      const svedekIds = [svedek1Id, svedek2Id];
      const rows = buildSvedkoveRows(svatba.id, svedekIds);

      if (rows.length > 0) {
        // onConflict: UNIQUE(svatba_id, svedek_id) — idempotentní zápis
        const { error: svedkovyError } = await supabase
          .from('svatba_svedkove')
          .upsert(rows, { onConflict: 'svatba_id,svedek_id' });

        if (svedkovyError) throw svedkovyError;
      }

      alert('Svatební zápis byl úspěšně vytvořen!');
    } catch (err) {
      log.error('Chyba při ukládání svatebního zápisu', {}, err instanceof Error ? err : null);
      alert('Chyba při ukládání. Zkuste to prosím znovu.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto p-6">
      <h1 className="text-2xl font-bold mb-6">💒 Svatební zápis</h1>

      <form noValidate onSubmit={handleSubmit} className="space-y-4">
        {/* Manželé */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label htmlFor="muz-select" className="block text-sm font-medium mb-1">Muž *</label>
            <select
              id="muz-select"
              value={formData.muz_id}
              onChange={(e) => setFormData({ ...formData, muz_id: e.target.value })}
              required
              className="w-full p-2 border rounded"
            >
              <option value="">Vyberte osobu</option>
              {osoby.map((osoba) => (
                <option key={osoba.id} value={osoba.id}>
                  {osoba.krestni_jmeno} {osoba.prijmeni}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="zena-select" className="block text-sm font-medium mb-1">Žena *</label>
            <select
              id="zena-select"
              value={formData.zena_id}
              onChange={(e) => setFormData({ ...formData, zena_id: e.target.value })}
              required
              className="w-full p-2 border rounded"
            >
              <option value="">Vyberte osobu</option>
              {osoby.map((osoba) => (
                <option key={osoba.id} value={osoba.id}>
                  {osoba.krestni_jmeno} {osoba.prijmeni}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Datum a místo svatby */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label htmlFor="datum-svatby" className="block text-sm mb-1">Datum svatby *</label>
            <input
              id="datum-svatby"
              type="date"
              value={formData.datum_svatby}
              onChange={(e) => setFormData({ ...formData, datum_svatby: e.target.value })}
              required
              className="w-full p-2 border rounded"
            />
          </div>

          <div>
            <label htmlFor="misto-svatby" className="block text-sm mb-1">Místo svatby *</label>
            <input
              id="misto-svatby"
              type="text"
              value={formData.misto_svatby}
              onChange={(e) => setFormData({ ...formData, misto_svatby: e.target.value })}
              required
              className="w-full p-2 border rounded"
            />
          </div>
        </div>

        {/* Farář */}
        <div>
          <label htmlFor="farar-svatba-select" className="block text-sm mb-1">Vedoucí farář</label>
          <select
            id="farar-svatba-select"
            value={formData.farar_vedouci}
            onChange={(e) => setFormData({ ...formData, farar_vedouci: e.target.value })}
            className="w-full p-2 border rounded"
          >
            <option value="">Vyberte faráře</option>
            {osoby.map((osoba) => (
              <option key={osoba.id} value={osoba.id}>
                {osoba.krestni_jmeno} {osoba.prijmeni}
              </option>
            ))}
          </select>
        </div>

        {/* Svědkové */}
        <fieldset className="border p-4 rounded">
          <legend className="text-sm font-semibold px-2">Svědkové</legend>

          <div className="grid grid-cols-2 gap-4 mt-3">
            <div>
              <label htmlFor="svedek1-select" className="block text-sm mb-1">Svědka 1</label>
              <select
                id="svedek1-select"
                value={svedek1Id}
                onChange={(e) => setSvedek1Id(e.target.value)}
                className="w-full p-2 border rounded"
              >
                <option value="">Nezvoleno</option>
                {osoby.map((osoba) => (
                  <option key={osoba.id} value={osoba.id}>
                    {osoba.krestni_jmeno} {osoba.prijmeni}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="svedek2-select" className="block text-sm mb-1">Svědka 2</label>
              <select
                id="svedek2-select"
                value={svedek2Id}
                onChange={(e) => setSvedek2Id(e.target.value)}
                className="w-full p-2 border rounded"
              >
                <option value="">Nezvoleno</option>
                {osoby.map((osoba) => (
                  <option key={osoba.id} value={osoba.id}>
                    {osoba.krestni_jmeno} {osoba.prijmeni}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </fieldset>

        {/* Příprava */}
        <fieldset className="border p-4 rounded">
          <legend className="text-sm font-semibold px-2">Příprava</legend>

          <div className="grid grid-cols-2 gap-4 mt-3">
            <div>
              <label htmlFor="priprava-svatba-datum" className="block text-sm mb-1">Datum přípravy</label>
              <input
                id="priprava-svatba-datum"
                type="date"
                value={formData.priprava_datum}
                onChange={(e) => setFormData({ ...formData, priprava_datum: e.target.value })}
                className="w-full p-2 border rounded"
              />
            </div>

            <div>
              <label htmlFor="priprava-svatba-zapis" className="block text-sm mb-1">Poznámky</label>
              <textarea
                id="priprava-svatba-zapis"
                value={formData.priprava_zapis}
                onChange={(e) => setFormData({ ...formData, priprava_zapis: e.target.value })}
                rows={3}
                className="w-full p-2 border rounded"
              />
            </div>
          </div>
        </fieldset>

        <button
          type="submit"
          disabled={loading}
          className={`w-full py-3 px-4 rounded-lg font-semibold text-white ${
            loading ? 'bg-gray-400' : 'bg-purple-600 hover:bg-purple-700'
          }`}
        >
          {loading ? 'Ukládání...' : 'Vytvořit svatební zápis'}
        </button>
      </form>
    </div>
  );
}
