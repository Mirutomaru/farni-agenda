// FARNÍ AGENDA - PŘIDAT FINANCI (/finance/new)
// Formulář pro registraci nového finančního záznamu (příjem/výdaj)

'use client';

import { useState } from 'react';
import Link from 'next/link';

const KATEGORIE_FINANCE = [
  // Příjmy
  { value: 'dar', label: '🎁 Dar', type: 'příjem' },
  { value: 'sbírka', label: '⛪ Sbírka', type: 'příjem' },
  { value: 'statni_subvence', label: '🏛️ Státní subvence', type: 'příjem' },
  { value: 'zapisne', label: '📚 Zápisné', type: 'příjem' },
  { value: 'jiný_příjem', label: '📥 Jiný příjem', type: 'příjem' },
  // Výdaje
  { value: 'plat_duchovniho', label: '💼 Plat duchovního', type: 'výdaj' },
  { value: 'udrzba', label: '🔧 Údržba budov', type: 'výdaj' },
  { value: 'energie', label: '⚡ Energie', type: 'výdaj' },
  { value: 'voda', label: '💧 Voda a kanalizace', type: 'výdaj' },
  { value: 'postovne', label: '✉️ Poštovné', type: 'výdaj' },
  { value: 'kancelarske_doplnky', label: '📝 Kancelářské doplňky', type: 'výdaj' },
  { value: 'software', label: '💻 Software', type: 'výdaj' },
  { value: 'reprezentace', label: '🤝 Reprezentace', type: 'výdaj' },
  { value: 'socialni_pomoc', label: '❤️ Sociální pomoc', type: 'výdaj' },
  { value: 'jiný_výdaj', label: '📤 Jiný výdaj', type: 'výdaj' },
];

export default function NewFinancePage() {
  const [saved, setSaved] = useState(false);
  const [selectedType, setSelectedType] = useState<'příjem' | 'výdaj'>('příjem');
  
  // Odeslání formuláře pro přidání nového finančního záznamu
  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    
    const formData = new FormData(event.currentTarget);
    
    try {
      const response = await fetch('/api/finance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(Object.fromEntries(formData)),
      });

      if (response.ok) {
        setSaved(true);
      } else {
        alert('Chyba při ukládání finančního záznamu');
      }
    } catch (error) {
      console.error('Error:', error);
      alert('Došlo k chybě při připojení na server');
    }
  }

  if (saved) {
    return (
      <div className="space-y-6">
        <div className="card bg-green-50 border-l-4 border-green-500 text-center py-8">
          <span className="text-6xl block mb-4">✅</span>
          <h3 className="text-lg font-semibold text-gray-900 mb-2">Finanční záznam úspěšně přidán!</h3>
          <p className="text-gray-600 mb-4">Nový finanční záznam byl uložen do systému.</p>
          
          {/* Akce po uložení */}
          <div className="flex gap-3 justify-center flex-wrap">
            <Link href="/finance" className="btn-primary inline-flex items-center gap-2">
              📋 Zobrazit přehled financí
            </Link>
            <button 
              onClick={() => window.location.reload()}
              className="btn-secondary inline-flex items-center gap-2"
            >
              ➕ Přidat další záznam
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
          <h1 className="text-2xl font-bold text-gray-900">➕ Přidat finanční záznam</h1>
          <p className="text-sm text-gray-600 mt-1">Registrovat nový příjem nebo výdaj farnosti</p>
        </div>

        {/* Navigace zpět */}
        <Link href="/finance" className="btn-secondary inline-flex items-center gap-2">
          ← Zpět na přehled financí
        </Link>
      </div>

      {/* Formulář pro nový finanční záznam */}
      <form onSubmit={handleSubmit} className="card space-y-6">
        {/* Typ a základní údaje */}
        <section>
          <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
            💰 Základní informace o finančním záznamu
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Typ (příjem/výdaj) */}
            <div>
              <label htmlFor="typ" className="block text-sm font-medium text-gray-700 mb-1">
                Typ operace *
              </label>
              <select 
                id="typ"
                name="typ" 
                required
                value={selectedType}
                onChange={(e) => setSelectedType(e.target.value as 'příjem' | 'výdaj')}
                className="form-input font-semibold"
              >
                <option value="příjem">📈 Příjem</option>
                <option value="výdaj">📉 Výdaj</option>
              </select>
            </div>

            {/* Kategorie */}
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
                {KATEGORIE_FINANCE.filter(k => k.type === selectedType).map((kat) => (
                  <option key={kat.value} value={kat.value}>{kat.label}</option>
                ))}
              </select>
            </div>

            {/* Částka */}
            <div>
              <label htmlFor="castka" className="block text-sm font-medium text-gray-700 mb-1">
                Částka (Kč) *
              </label>
              <input 
                id="castka"
                name="castka"
                type="number" 
                required
                min={0}
                step={100}
                placeholder="1000"
                className="form-input font-mono text-lg font-bold"
                style={{ color: selectedType === 'příjem' ? '#16a34a' : '#dc2626' }}
              />
            </div>

            {/* Datum */}
            <div>
              <label htmlFor="datum_prijmu" className="block text-sm font-medium text-gray-700 mb-1">
                Datum operace *
              </label>
              <input 
                id="datum_prijmu"
                name="datum_příjmu"
                type="date" 
                required
                defaultValue={new Date().toISOString().split('T')[0]}
                className="form-input"
              />
            </div>
          </div>

          {/* Protiplaťel */}
        <div className="mt-4">
          <label htmlFor="protiplatel" className="block text-sm font-medium text-gray-700 mb-1">
            Protiplaťel (poskytovatel/příjemce)
          </label>
          <input 
            id="protiplatel"
            name="protoplatitel"
            type="text" 
            placeholder="Např. Jan Novák, Farní sbírka, Městský úřad..."
            className="form-input"
          />
        </div>

        {/* Popis a poznámky */}
        <div className="mt-4">
          <label htmlFor="popisek" className="block text-sm font-medium text-gray-700 mb-1">
            Popis / Poznámka
          </label>
          <textarea 
            id="popisek"
            name="popisek"
            rows={3}
            placeholder={`Detailní popis operace... (${selectedType === 'příjem' ? 'Uveďte důvod příjmu' : 'Uveďte účel výdaje'})`}
            className="form-input resize-none"
          />
        </div>
      </section>

        {/* Dokumentace */}
        <section>
          <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
            📎 Přiložené dokumenty
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {/* Faktura */}
            <div>
              <label htmlFor="faktura" className="block text-sm font-medium text-gray-700 mb-1">
                Faktura / Doklad
              </label>
              <input 
                id="faktura"
                name="faktura_url"
                type="file" 
                accept=".pdf,.jpg,.png,.jpeg"
                className="form-input text-sm"
              />
            </div>

            {/* Bankovní výpis */}
            <div>
              <label htmlFor="bankovni_vypis" className="block text-sm font-medium text-gray-700 mb-1">
                Bankovní výpis
              </label>
              <input 
                id="bankovni_vypis"
                name="bankovni_vypis_url"
                type="file" 
                accept=".pdf,.csv,.xlsx"
                className="form-input text-sm"
              />
            </div>

            {/* Další dokumenty */}
            <div>
              <label htmlFor="dalsi_dokumenty" className="block text-sm font-medium text-gray-700 mb-1">
                Další dokumenty
              </label>
              <input 
                id="dalsi_dokumenty"
                name="dalsi_dokumenty_url"
                type="file" 
                multiple
                accept=".pdf,.doc,.docx,.jpg,.png"
                className="form-input text-sm"
              />
            </div>
          </div>
        </section>

        {/* Rychlé akce */}
        <section className="pt-4 border-t">
          <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
            🚀 Rychlé akce
          </h3>

          <div className="flex gap-3 flex-wrap">
            {/* Generovat fakturu */}
            <button 
              type="button"
              onClick={() => alert('Generování faktury bude implementováno')}
              className="btn-secondary inline-flex items-center gap-2 bg-purple-50 text-purple-700 border-purple-300 hover:bg-purple-100"
            >
              📄 Generovat fakturu
            </button>

            {/* Připojit bankovní transakci */}
            <button 
              type="button"
              onClick={() => alert('Import bankovních transakcí bude implementován')}
              className="btn-secondary inline-flex items-center gap-2 bg-green-50 text-green-700 border-green-300 hover:bg-green-100"
            >
              🏦 Importovat z banky
            </button>

            {/* Odeslat připomenutí */}
            <button 
              type="button"
              onClick={() => alert('Připomenutí bude implementováno')}
              className="btn-secondary inline-flex items-center gap-2 bg-orange-50 text-orange-700 border-orange-300 hover:bg-orange-100"
            >
              ✉️ Odeslat připomenutí
            </button>
          </div>
        </section>

        {/* Pomocný text */}
        <div className="card bg-blue-50 border-l-4 border-blue-500">
          <h3 className="text-sm font-semibold text-gray-700 mb-2 flex items-center gap-2">
            💡 Jak vyplnit finanční záznam:
          </h3>

          {/* Pomocné pokyny */}
          <ol className="space-y-1.5 text-sm text-gray-600 list-none">
            {selectedType === 'příjem' ? (
              <>
                <li><span className="font-medium">Typ:</span> Vyberte „Příjem“ pro dar, sbírku nebo další příjem</li>
                <li><span className="font-medium">Kategorie:</span> Zvolte typ příjmu (dar, sbírka, státní subvence...)</li>
                <li><span className="font-medium">Částka:</span> Uveďte přesnou výši příjmu v korunách</li>
              </>
            ) : (
              <>
                <li><span className="font-medium">Typ:</span> Vyberte „Výdaj“ pro úhradu nákladů farnosti</li>
                <li><span className="font-medium">Kategorie:</span> Zvolte typ výdaje (údržba, energie, plat...)</li>
                <li><span className="font-medium">Částka:</span> Uveďte přesnou výši výdaje v korunách</li>
              </>
            )}
            <li><span className="font-medium">Protiplaťel:</span> Zadejte jméno nebo název protistrany</li>
            <li><span className="font-medium">Dokumenty:</span> Připojte faktury, doklady a bankovní výpisy</li>
          </ol>
        </div>

        {/* Tlačítka formuláře */}
        <div className="flex gap-3 pt-4 border-t justify-end">
          <Link href="/finance" className="btn-secondary inline-flex items-center gap-2">
            ❌ Zrušit
          </Link>
          <button 
            type="submit" 
            className={`btn-primary inline-flex items-center gap-2 ${selectedType === 'příjem' ? 'bg-green-600 hover:bg-green-700' : 'bg-red-600 hover:bg-red-700'}`}
          >
            ✅ Uložit {selectedType === 'příjem' ? 'příjem' : 'výdaj'}
          </button>
        </div>
      </form>
    </div>
  );
}
