// FARNÍ AGENDA - PŘIDAT MAJETEK (/majetek/new)
// Formulář pro registraci nové položky farního majetku

'use client';

import { useState } from 'react';
import Link from 'next/link';
import { logger } from '@/lib/logging/logger';

const log = logger('MAJETEK_FORM');

export default function NewMajetekPage() {
  const [saved, setSaved] = useState(false);
  
  // Odeslání formuláře pro přidání nové položky majetku
  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    
    const formData = new FormData(event.currentTarget);
    
    try {
      const response = await fetch('/api/majetek', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(Object.fromEntries(formData)),
      });

      if (response.ok) {
        setSaved(true);
      } else {
        alert('Chyba při ukládání majetku');
      }
    } catch (error) {
      log.error('Chyba při ukládání majetku', {}, error instanceof Error ? error : null);
      alert('Došlo k chybě při připojení na server');
    }
  }

  if (saved) {
    return (
      <div className="space-y-6">
        <div className="card bg-green-50 border-l-4 border-green-500 text-center py-8">
          <span className="text-6xl block mb-4">✅</span>
          <h3 className="text-lg font-semibold text-gray-900 mb-2">Položka majetku úspěšně přidána!</h3>
          <p className="text-gray-600 mb-4">Nová položka byla uložena do systému.</p>
          
          {/* Akce po uložení */}
          <div className="flex gap-3 justify-center flex-wrap">
            <Link href="/majetek" className="btn-primary inline-flex items-center gap-2">
              📋 Zobrazit seznam majetku
            </Link>
            <button 
              onClick={() => window.location.reload()}
              className="btn-secondary inline-flex items-center gap-2"
            >
              ➕ Přidat další položku
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">➕ Přidat položku majetku</h1>
          <p className="text-sm text-gray-600 mt-1">Registrovat nový farní majetek do systému</p>
        </div>

        {/* Navigace zpět */}
        <Link href="/majetek" className="btn-secondary inline-flex items-center gap-2">
          ← Zpět na seznam majetku
        </Link>
      </div>

      {/* Formulář pro nový majetek */}
      <form onSubmit={handleSubmit} className="card space-y-6">
        {/* Základní informace */}
        <section>
          <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
            📋 Základní informace o majetku
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Název položky */}
            <div>
              <label htmlFor="nazev" className="block text-sm font-medium text-gray-700 mb-1">
                Název položky *
              </label>
              <input 
                id="nazev"
                name="nazev" 
                type="text" 
                required
                placeholder="Např. Kostel Nanebevzetí Panny Marie"
                className="form-input"
              />
            </div>

            {/* Inventární číslo */}
            <div>
              <label htmlFor="inventarni_cislo" className="block text-sm font-medium text-gray-700 mb-1">
                Inventární číslo
              </label>
              <input 
                id="inventarni_cislo"
                name="inventarni_cislo"
                type="text" 
                placeholder="INV-2024-001"
                className="form-input"
              />
            </div>

            {/* Kategorie majetku */}
            <div>
              <label htmlFor="kategorie" className="block text-sm font-medium text-gray-700 mb-1">
                Kategorie *
              </label>
              <select 
                id="kategorie"
                name="kategorie" 
                required
                className="form-input"
              >
                <option value="">Vyberte kategorii...</option>
                <option value="nemovitost">🏠 Nemovitost</option>
                <option value="movitost">🪑 Movitost</option>
                <option value="duchovni_pomucky">⛪ Duchovní pomůcky</option>
                <option value="finance">💰 Finance</option>
              </select>
            </div>

            {/* Umístění */}
            <div>
              <label htmlFor="umisteni" className="block text-sm font-medium text-gray-700 mb-1">
                Umístění
              </label>
              <input 
                id="umisteni"
                name="umisteni"
                type="text" 
                placeholder="Např. Kostel v centru obce"
                className="form-input"
              />
            </div>
          </div>

          {/* Popis */}
        <div className="mt-4">
          <label htmlFor="popis" className="block text-sm font-medium text-gray-700 mb-1">
            Popis / Poznámka
          </label>
          <textarea 
            id="popis"
            name="popis"
            rows={3}
            placeholder="Podrobný popis majetkové položky..."
            className="form-input resize-none"
          />
        </div>
      </section>

        {/* Hodnocení a ocenění */}
        <section>
          <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
            💰 Ocenění majetku
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Počáteční hodnota */}
            <div>
              <label htmlFor="pocatecni_hodnota" className="block text-sm font-medium text-gray-700 mb-1">
                Počáteční hodnota (Kč) *
              </label>
              <input 
                id="pocatecni_hodnota"
                name="počáteční_hodnota"
                type="number" 
                required
                min={0}
                step={1000}
                placeholder="1000000"
                className="form-input font-mono"
              />
            </div>

            {/* Aktuální hodnota */}
            <div>
              <label htmlFor="aktualni_hodnota" className="block text-sm font-medium text-gray-700 mb-1">
                Aktuální hodnota (Kč)
              </label>
              <input 
                id="aktualni_hodnota"
                name="aktuální_hodnota"
                type="number" 
                min={0}
                step={1000}
                placeholder="Aktuální cena"
                className="form-input font-mono"
              />
            </div>

            {/* Datum ocenění */}
            <div>
              <label htmlFor="datum_ocenení" className="block text-sm font-medium text-gray-700 mb-1">
                Datum ocenění
              </label>
              <input 
                id="datum_ocenění"
                name="datum_ocenění"
                type="date" 
                defaultValue={new Date().toISOString().split('T')[0]}
                className="form-input"
              />
            </div>
          </div>
        </section>

        {/* Dokumentace a fotografie */}
        <section>
          <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
            📎 Dokumentace
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Fotografie */}
            <div>
              <label htmlFor="fotografie" className="block text-sm font-medium text-gray-700 mb-1">
                Fotografie majetku
              </label>
              <input 
                id="fotografie"
                name="fotografie"
                type="file" 
                accept="image/*"
                className="form-input"
              />
            </div>

            {/* Dokumenty */}
            <div>
              <label htmlFor="dokumenty" className="block text-sm font-medium text-gray-700 mb-1">
                Související dokumenty
              </label>
              <input 
                id="dokumenty"
                name="dokumenty"
                type="file" 
                multiple
                accept=".pdf,.doc,.docx,.jpg,.png"
                className="form-input"
              />
            </div>
          </div>
        </section>

        {/* Pomocný text */}
        <div className="card bg-blue-50 border-l-4 border-blue-500">
          <h3 className="text-sm font-semibold text-gray-700 mb-2 flex items-center gap-2">
            💡 Jak vyplnit formulář pro majetek:
          </h3>

          {/* Pomocné pokyny */}
          <ol className="space-y-1.5 text-sm text-gray-600 list-none">
            <li><span className="font-medium">Název:</span> Uveďte přesný název majetkové položky</li>
            <li><span className="font-medium">Kategorie:</span> Vyberte příslušnou kategorii (nemovitost, movitost, duchovní pomůcky)</li>
            <li><span className="font-medium">Ocenění:</span> Zadejte počáteční i aktuální hodnotu majetku</li>
            <li><span className="font-medium">Dokumentace:</span> Připojte fotografie a související dokumenty</li>
          </ol>
        </div>

        {/* Tlačítka formuláře */}
        <div className="flex gap-3 pt-4 border-t justify-end">
          <Link href="/majetek" className="btn-secondary inline-flex items-center gap-2">
            ❌ Zrušit
          </Link>
          <button type="submit" className="btn-primary inline-flex items-center gap-2 bg-green-600 hover:bg-green-700">
            ✅ Uložit položku majetku
          </button>
        </div>
      </form>
    </div>
  );
}
