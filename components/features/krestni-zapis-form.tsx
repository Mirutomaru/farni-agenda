// FARNÍ AGENDA - NEXT.JS KOMPONENTA
// Formulář pro křestní zápis s generováním certifikátu

'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { logger } from '@/lib/logging/logger';

const log = logger('KRESTNI_FORM');

interface Osoba {
  id: string;
  krestni_jmeno: string;
  prijmeni: string;
}

export default function KrestniZapisForm({ osobaId }: { osobaId?: string }) {
  const supabase = createClient();
  const [loading, setLoading] = useState(false);
  const [osoby, setOsoby] = useState<Osoba[]>([]);

  // Oprava: načteme jen nezbytné pole pro select (performance)
  const [formData, setFormData] = useState({
    pokrteny_id: '',
    datum_krstu: '',
    misto_krstu: '',
    farar_vedouci: '',
    otec_id: '',
    matka_id: '',
    kmotr_id: '',
    kmotra_id: '',
    priprava_datum: '',
    priprava_zapis: ''
  });

  const loadOsoby = async () => {
    try {
      // FIX: clenstvi_status místo status (sjednocení se schema v2/v3)
      const { data, error } = await supabase
        .from('osoby')
        .select('id, krestni_jmeno, prijmeni') // jen potřebná pole
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
      // Vytvoření záznamu o křtu
      const { data, error } = await supabase
        .from('krestni_zapis')
        .insert([formData])
        .select()
        .single();

      if (error) throw error;

      alert('Křestní zápis byl úspěšně vytvořen!');

      // Generování certifikátu
      const { data: certData } = await fetch('/api/generate-certificate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ personId: data.id, type: 'krest' })
      }).then(r => r.json());

      if (certData.success) {
        alert(`Certifikát byl vygenerován a uložen na: ${certData.url}`);
      }

    } catch (err) {
      log.error('Chyba při ukládání křestního zápisu', {}, err instanceof Error ? err : null);
      alert('Chyba při ukládání. Zkuste to prosím znovu.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto p-6">
      <h1 className="text-2xl font-bold mb-6">Křestní zápis</h1>
      
      <form noValidate onSubmit={handleSubmit} className="space-y-4">
        {/* Pokřtěný */}
        <div>
          <label htmlFor="pokrteny-select" className="block text-sm font-medium mb-1">Pokřtěný *</label>
          <select
            id="pokrteny-select"
            value={formData.pokrteny_id}
            onChange={(e) => setFormData({...formData, pokrteny_id: e.target.value})}
            required
            className="w-full p-2 border rounded"
          >
            <option value="">Vyberte osobu</option>
            {osoby.map(osoba => (
              <option key={osoba.id} value={osoba.id}>
                {osoba.krestni_jmeno} {osoba.prijmeni}
              </option>
            ))}
          </select>
        </div>

        {/* Datum a místo křtu */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label htmlFor="datum-krstu" className="block text-sm mb-1">Datum křtu *</label>
            <input
              id="datum-krstu"
              type="date"
              value={formData.datum_krstu}
              onChange={(e) => setFormData({...formData, datum_krstu: e.target.value})}
              required
              className="w-full p-2 border rounded"
            />
          </div>

          <div>
            <label htmlFor="misto-krstu" className="block text-sm mb-1">Místo křtu *</label>
            <input
              id="misto-krstu"
              type="text"
              value={formData.misto_krstu}
              onChange={(e) => setFormData({...formData, misto_krstu: e.target.value})}
              required
              className="w-full p-2 border rounded"
            />
          </div>
        </div>

        {/* Farář */}
        <div>
          <label htmlFor="farar-select" className="block text-sm mb-1">Vedoucí farář</label>
          <select
            id="farar-select"
            value={formData.farar_vedouci}
            onChange={(e) => setFormData({...formData, farar_vedouci: e.target.value})}
            className="w-full p-2 border rounded"
          >
            <option value="">Vyberte faráře</option>
            {osoby.filter(o => o.id !== formData.pokrteny_id).map(osoba => (
              <option key={osoba.id} value={osoba.id}>
                {osoba.krestni_jmeno} {osoba.prijmeni}
              </option>
            ))}
          </select>
        </div>

        {/* Rodiče (pro děti) */}
        <fieldset className="border p-4 rounded">
          <legend className="text-sm font-semibold px-2">Rodiče</legend>
          
          <div className="grid grid-cols-2 gap-4 mt-3">
            <div>
              <label htmlFor="otec-select" className="block text-sm mb-1">Otec</label>
              <select
                id="otec-select"
                value={formData.otec_id}
                onChange={(e) => setFormData({...formData, otec_id: e.target.value})}
                className="w-full p-2 border rounded"
              >
                <option value="">Nezvoleno</option>
                {osoby.map(osoba => (
                  <option key={osoba.id} value={osoba.id}>
                    {osoba.krestni_jmeno} {osoba.prijmeni}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="matka-select" className="block text-sm mb-1">Matka</label>
              <select
                id="matka-select"
                value={formData.matka_id}
                onChange={(e) => setFormData({...formData, matka_id: e.target.value})}
                className="w-full p-2 border rounded"
              >
                <option value="">Nezvoleno</option>
                {osoby.map(osoba => (
                  <option key={osoba.id} value={osoba.id}>
                    {osoba.krestni_jmeno} {osoba.prijmeni}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </fieldset>

        {/* Kmotři */}
        <fieldset className="border p-4 rounded">
          <legend className="text-sm font-semibold px-2">Kmotr/Kmotra</legend>
          
          <div className="grid grid-cols-2 gap-4 mt-3">
            <div>
              <label htmlFor="kmotr-select" className="block text-sm mb-1">Kmotr</label>
              <select
                id="kmotr-select"
                value={formData.kmotr_id}
                onChange={(e) => setFormData({...formData, kmotr_id: e.target.value})}
                className="w-full p-2 border rounded"
              >
                <option value="">Nezvoleno</option>
                {osoby.map(osoba => (
                  <option key={osoba.id} value={osoba.id}>
                    {osoba.krestni_jmeno} {osoba.prijmeni}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="kmotra-select" className="block text-sm mb-1">Kmotra</label>
              <select
                id="kmotra-select"
                value={formData.kmotra_id}
                onChange={(e) => setFormData({...formData, kmotra_id: e.target.value})}
                className="w-full p-2 border rounded"
              >
                <option value="">Nezvoleno</option>
                {osoby.map(osoba => (
                  <option key={osoba.id} value={osoba.id}>
                    {osoba.krestni_jmeno} {osoba.prijmeni}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </fieldset>

        {/* Příprava (pro dospělé) */}
        <fieldset className="border p-4 rounded">
          <legend className="text-sm font-semibold px-2">Příprava (pro dospělé)</legend>
          
          <div className="grid grid-cols-2 gap-4 mt-3">
            <div>
              <label htmlFor="priprava-datum" className="block text-sm mb-1">Datum přípravy</label>
              <input
                id="priprava-datum"
                type="date"
                value={formData.priprava_datum}
                onChange={(e) => setFormData({...formData, priprava_datum: e.target.value})}
                className="w-full p-2 border rounded"
              />
            </div>

            <div>
              <label htmlFor="priprava-zapis" className="block text-sm mb-1">Poznámky</label>
              <textarea
                id="priprava-zapis"
                value={formData.priprava_zapis}
                onChange={(e) => setFormData({...formData, priprava_zapis: e.target.value})}
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
            loading ? 'bg-gray-400' : 'bg-blue-600 hover:bg-blue-700'
          }`}
        >
          {loading ? 'Ukládání...' : 'Vytvořit křestní zápis'}
        </button>
      </form>
    </div>
  );
}
