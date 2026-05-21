// FARNÍ AGENDA - PŘIDAT OSOBU (/osoby/new)
// Formulář pro registraci nové osoby do farnosti

'use client';

import { useState } from 'react';
import Link from 'next/link';
import OsobaForm from '@/components/OsobaForm';

export default function NewOsobaPage() {
  const [saved, setSaved] = useState(false);
  
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">➕ Přidat novou osobu</h1>
          <p className="text-sm text-gray-600 mt-1">Zaregistrujte nového člena farnosti do systému</p>
        </div>

        {/* Navigace zpět */}
        <Link href="/osoby" className="btn-secondary inline-flex items-center gap-2">
          ← Zpět na seznam osob
        </Link>
      </div>

      {/* Formulář pro novou osobu */}
      {saved ? (
        <div className="card bg-green-50 border-l-4 border-green-500 text-center py-8">
          <span className="text-6xl block mb-4">✅</span>
          <h3 className="text-lg font-semibold text-gray-900 mb-2">Osoba úspěšně přidána!</h3>
          <p className="text-gray-600 mb-4">Nový záznam byl uložen do systému.</p>
          
          {/* Akce po uložení */}
          <div className="flex gap-3 justify-center flex-wrap">
            <Link href="/osoby" className="btn-primary inline-flex items-center gap-2">
              📋 Zobrazit seznam osob
            </Link>
            <button 
              onClick={() => window.location.reload()}
              className="btn-secondary inline-flex items-center gap-2"
            >
              ➕ Přidat další osobu
            </button>
          </div>
        </div>
      ) : (
        /* Použití existující OsobaForm komponenty */
        <OsobaForm />
      )}

      {/* Pomocný text */}
      <div className="card bg-blue-50 border-l-4 border-blue-500">
        <h3 className="text-sm font-semibold text-gray-700 mb-2 flex items-center gap-2">
          💡 Jak vyplnit formulář:
        </h3>

        {/* Pomocné pokyny */}
        <ol className="space-y-1.5 text-sm text-gray-600 list-none">
          {/* Základní informace */}
          <li className="flex gap-2"><span className="text-blue-500 font-medium">1.</span> Zadejte jméno a příjmení osoby</li>
          {/* Kontaktní údaje */}
          <li className="flex gap-2"><span className="text-blue-500 font-medium">2.</span> Přidejte kontaktní informace (telefon, e-mail)</li>
          {/* Datum narození */}
          <li className="flex gap-2"><span className="text-blue-500 font-medium">3.</span> Uveďte datum a místo narození</li>
          {/* Farnost */}
          <li className="flex gap-2"><span className="text-blue-500 font-medium">4.</span> Vyberte farnost, ke které osoba patří</li>
          {/* Svátosti */}
          <li className="flex gap-2"><span className="text-blue-500 font-medium">5.</span> Přidejte data svátostí (křest, birování)</li>
        </ol>
      </div>
    </div>
  );
}
