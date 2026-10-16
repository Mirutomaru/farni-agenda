// FARNÍ AGENDA - NEXT.JS KOMPONENTA
// Sekce "Citlivé údaje" formuláře osoby (kontakt + Smartform našeptávač adres)

'use client';

import { useState, useEffect } from 'react';
import { logger } from '@/lib/logging/logger';
import type { OsobaFormData, SmartformResponse } from './types';

const log = logger('OSOBA_FORM_KONTAKT');

interface Props {
  formData: OsobaFormData;
  onChange: (patch: Partial<OsobaFormData>) => void;
}

export default function ContactSection({ formData, onChange }: Props) {
  // Smartform autocomplete state (lokalní — nepatří do globálního formuláře)
  const [searchQuery, setSearchQuery] = useState('');
  const [suggestions, setSuggestions] = useState<NonNullable<SmartformResponse['data']>>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);

  // Našeptávač adres přes serverovou proxy (chrání SMARTFORM_API_KEY)
  const searchSmartform = async (query: string) => {
    if (query.length < 3) {
      setSuggestions([]);
      return;
    }

    setLoadingSuggestions(true);
    try {
      // Voláme vlastní API proxy místo přímého volání na Smartform (ochrana klíče)
      const response = await fetch(
        `/api/smartform-search?query=${encodeURIComponent(query)}&limit=5`
      );

      if (!response.ok) throw new Error('Smartform search proxy error');

      const result: SmartformResponse = await response.json();

      if (result.success && Array.isArray(result.data)) {
        setSuggestions(result.data);
      } else {
        setSuggestions([]);
      }
    } catch (err) {
      log.error('Chyba při vyhledávání adresy', {}, err instanceof Error ? err : null);
      setSuggestions([]);
    } finally {
      setLoadingSuggestions(false);
    }
  };

  // Debounced search pro Smartform
  useEffect(() => {
    const timer = setTimeout(() => {
      if (searchQuery) {
        searchSmartform(searchQuery);
      } else {
        setSuggestions([]);
      }
    }, 300); // 300ms debounce

    return () => clearTimeout(timer);
  }, [searchQuery]);

  const handleAddressSelect = (address: NonNullable<SmartformResponse['data']>[number]) => {
    const fullAddress = `${address.ulice} ${address.cislo_popisne}, ${address.obec}, ${address.psc}`;
    onChange({ adresa_trvaly_bydlist: fullAddress });
    setSearchQuery('');
    setSuggestions([]);
    setShowSuggestions(false);
  };

  return (
    <fieldset className="border p-4 rounded-lg bg-yellow-50">
      <legend className="text-sm font-semibold px-2 text-red-600">Citlivé údaje (šifrováno)</legend>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-3">
        <div>
          <label htmlFor="ico" className="block text-sm mb-1">IČO</label>
          <input
            id="ico"
            type="text"
            value={formData.ico}
            onChange={(e) => onChange({ ico: e.target.value })}
            placeholder="Pouze čísla"
            className="w-full p-2 border rounded"
          />
        </div>

        <div>
          <label htmlFor="obcan-prukaz" className="block text-sm mb-1">Občanský průkaz</label>
          <input
            id="obcan-prukaz"
            type="text"
            value={formData.obcan_prukaz}
            onChange={(e) => onChange({ obcan_prukaz: e.target.value })}
            className="w-full p-2 border rounded"
          />
        </div>

        {/* Smartform Adresa */}
        <div className="md:col-span-2">
          <label htmlFor="adresa-input" className="block text-sm mb-1">Trvalý pobyt (Smartform.cz)</label>
          <div className="relative">
            <input
              id="adresa-input"
              type="text"
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                onChange({ adresa_trvaly_bydlist: '' });
              }}
              onFocus={() => setShowSuggestions(true)}
              onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
              placeholder="Zadejte název ulice nebo obec..."
              className="w-full p-2 border rounded pr-10"
            />

            {loadingSuggestions && (
              <div className="absolute right-3 top-2 text-gray-400">
                ⏳
              </div>
            )}

            {/* Autocomplete suggestions */}
            {showSuggestions && suggestions.length > 0 && (
              <ul className="absolute z-10 w-full bg-white border rounded-lg shadow-lg max-h-60 overflow-y-auto mt-1">
                {suggestions.map((addr, idx) => (
                  <li
                    key={idx}
                    onClick={() => handleAddressSelect(addr)}
                    className="p-3 hover:bg-gray-100 cursor-pointer text-sm"
                  >
                    <div>{addr.ulice} {addr.cislo_popisne}</div>
                    <div className="text-gray-600">{addr.obec}, {addr.psc}</div>
                  </li>
                ))}
              </ul>
            )}

            {/* Zobrazená vybraná adresa */}
            {formData.adresa_trvaly_bydlist && !searchQuery && (
              <div className="mt-1 text-sm text-green-600">
                ✓ {formData.adresa_trvaly_bydlist}
              </div>
            )}
          </div>
        </div>

        <div>
          <label htmlFor="email" className="block text-sm mb-1">Email</label>
          <input
            id="email"
            type="email"
            value={formData.email}
            onChange={(e) => onChange({ email: e.target.value })}
            className="w-full p-2 border rounded"
          />
        </div>

        <div>
          <label htmlFor="telefon" className="block text-sm mb-1">Telefon</label>
          <input
            id="telefon"
            type="tel"
            value={formData.telefon}
            onChange={(e) => onChange({ telefon: e.target.value })}
            className="w-full p-2 border rounded"
          />
        </div>
      </div>
    </fieldset>
  );
}
