// FARNÍ AGENDA - NEXT.JS KOMPONENTA
// Formář přidání osoby s Smartform.cz našeptávačem adres

'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { z } from 'zod';

interface OsobaFormData {
  krestni_jmeno: string;
  prijmeni: string;
  datum_narozeni: string;
  pohlavi: boolean | null;
  ico: string;
  obcan_prukaz: string;
  adresa_trvaly_bydlist: string;
  email: string;
  telefon: string;
  role_cirkinni: string[];
  krest_datum?: string;
  krest_misto?: string;
  biřmování_datum?: string;
  biřmování_misto?: string;
}

interface SmartformResponse {
  success: boolean;
  data?: Array<{
    ulice: string;
    cislo_popisne: string;
    cislo_orientacni?: string;
    obec: string;
    psc: string;
    okres?: string;
    kraj?: string;
  }>;
}

// Zod validace formuláře (běží na clientu pro okamžitou zpětnou vazbu)
const zodOsobaForm = z.object({
  krestni_jmeno: z.string().min(1, 'Křestní jméno je povinné').max(100),
  prijmeni: z.string().min(1, 'Příjmení je povinné').max(100),
  datum_narozeni: z.string().min(1, 'Datum narození je povinné'),
  pohlavi: z.boolean().nullable(),
  ico: z.string().refine(v => !v || /^\d{4,10}$/.test(v), { message: 'IČO musí být 4-10 čísel' }),
  obcan_prukaz: z.string().max(50),
  adresa_trvaly_bydlist: z.string(),
  email: z.string().email('Neplatný formát emailu').or(z.literal('')),
  telefon: z.string().refine(v => !v || /^[\+]?[\d\s\-()]{7,20}$/.test(v), { message: 'Neplatné telefonní číslo' }),
  role_cirkinni: z.array(z.string()),
  krest_datum: z.string().optional(),
  krest_misto: z.string().optional(),
  biřmování_datum: z.string().optional(),
  biřmování_misto: z.string().optional(),
});

export default function OsobaForm({ editId }: { editId?: string }) {
  const supabase = createClient();
  const [loading, setLoading] = useState(false);
  const [farnosti, setFarnosti] = useState<any[]>([]);
  const [vybrana_farnost, setVybranaFarnost] = useState<string>('');
  
  // Formulářová data
  const [formData, setFormData] = useState<OsobaFormData>({
    krestni_jmeno: '',
    prijmeni: '',
    datum_narozeni: '',
    pohlavi: null,
    ico: '',
    obcan_prukaz: '',
    adresa_trvaly_bydlist: '',
    email: '',
    telefon: '',
    role_cirkinni: [],
    krest_datum: '',
    krest_misto: '',
    biřmování_datum: '',
    biřmování_misto: ''
  });

  // Smartform autocomplete state
  const [searchQuery, setSearchQuery] = useState('');
  const [suggestions, setSuggestions] = useState<any[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);

  // Načtení farností pro select
  useEffect(() => {
    loadFarnosti();
  }, []);

  const loadFarnosti = async () => {
    try {
      const { data, error } = await supabase
        .from('farnosti')
        .select('*')
        .order('nazev');
      
      if (error) throw error;
      setFarnosti(data || []);
    } catch (err) {
      console.error('Chyba při načítání farností:', err);
    }
  };

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

      const result = await response.json();
      
      if (result.success && Array.isArray(result.data)) {
        setSuggestions(result.data);
      } else {
        setSuggestions([]);
      }
    } catch (err) {
      console.error('Chyba při vyhledávání adresy:', err);
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

  const handleAddressSelect = (address: any) => {
    const fullAddress = `${address.ulice} ${address.cislo_popisne}, ${address.obec}, ${address.psc}`;
    setFormData({ ...formData, adresa_trvaly_bydlist: fullAddress });
    setSearchQuery('');
    setSuggestions([]);
    setShowSuggestions(false);
  };

  // Odeslání formuláře na backend (šifrování probíhá SERVER-SIDE)
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!vybrana_farnost) {
      alert('Vyberte farnost!');
      return;
    }

    // Zod validace před odesláním
    const validationErrors = zodOsobaForm.safeParse(formData);
    if (!validationErrors.success) {
      const firstError = validationErrors.error.errors[0];
      alert(`Chyba ve formuláři: ${firstError.message}`);
      return;
    }

    setLoading(true);

    try {
      // Frontend NEŠIFRUJE - data jdou čistá na backend
      const osobaData = {
        farnost_id: vybrana_farnost,
        krestni_jmeno: formData.krestni_jmeno,
        prijmeni: formData.prijmeni,
        datum_narozeni: formData.datum_narozeni,
        pohlavi: formData.pohlavi,
        role_cirkinni: formData.role_cirkinni,
        krest_datum: formData.krest_datum || null,
        krest_misto: formData.krest_misto || null,
        biřmování_datum: formData.biřmování_datum || null,
        biřmování_misto: formData.biřmování_misto || null,
        // Citlivá pole - čistá data, backend je zašifruje
        ico: formData.ico || null,
        obcan_prukaz: formData.obcan_prukaz || null,
        adresa_trvaly_bydlist: formData.adresa_trvaly_bydlist || null,
        email: formData.email || null,
        telefon: formData.telefon || null,
      };

      const response = await fetch('/api/osoby', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          // Authorization header pro audit log (pokud je user přihlášen)
          ...(typeof window !== 'undefined' ? {} : {})
        },
        body: JSON.stringify(osobaData),
      });

      if (!response.ok) {
        const errorBody = await response.json();
        throw new Error(errorBody.error || `HTTP ${response.status}`);
      }

      const result = await response.json();
      
      alert(`Osoba ${formData.krestni_jmeno} ${formData.prijmeni} byla úspěšně přidána!`);
      
      // Reset formuláře
      setFormData({
        krestni_jmeno: '',
        prijmeni: '',
        datum_narozeni: '',
        pohlavi: null,
        ico: '',
        obcan_prukaz: '',
        adresa_trvaly_bydlist: '',
        email: '',
        telefon: '',
        role_cirkinni: [],
        krest_datum: '',
        krest_misto: '',
        biřmování_datum: '',
        biřmování_misto: ''
      });

    } catch (err) {
      console.error('Chyba při přidávání osoby:', err);
      alert('Chyba při ukládání osoby. Zkuste to prosím znovu.');
    } finally {
      setLoading(false);
    }
  };

  const toggleRole = (role: string) => {
    setFormData(prev => ({
      ...prev,
      role_cirkinni: prev.role_cirkinni.includes(role)
        ? prev.role_cirkinni.filter(r => r !== role)
        : [...prev.role_cirkinni, role]
    }));
  };

  const roleLabels: Record<string, string> = {
    clen_rady: 'Člen rady farnosti',
    pokladnik: 'Pokladník',
    jehen: 'Jáhen',
    kněz: 'Kněz',
    farnik: 'Farník'
  };

  return (
    <div className="max-w-3xl mx-auto p-6">
      <h1 className="text-2xl font-bold mb-6">Přidat novou osobu</h1>
      
      <form noValidate onSubmit={handleSubmit} className="space-y-6">
        {/* Farnost */}
        <div>
          <label htmlFor="farnost-select" className="block text-sm font-medium mb-2">Farnost *</label>
          <select
            id="farnost-select"
            value={vybrana_farnost}
            onChange={(e) => setVybranaFarnost(e.target.value)}
            required
            className="w-full p-3 border rounded-lg"
          >
            <option value="">Vyberte farnost</option>
            {farnosti.map(f => (
              <option key={f.id} value={f.id}>
                {f.nazev} ({f.zkratka})
              </option>
            ))}
          </select>
        </div>

        {/* Základní údaje */}
        <fieldset className="border p-4 rounded-lg">
          <legend className="text-sm font-semibold px-2">Základní údaje</legend>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-3">
            <div>
              <label htmlFor="krestni-jmeno" className="block text-sm mb-1">Křestní jméno *</label>
              <input
                id="krestni-jmeno"
                type="text"
                value={formData.krestni_jmeno}
                onChange={(e) => setFormData({...formData, krestni_jmeno: e.target.value})}
                required
                className="w-full p-2 border rounded"
              />
            </div>

            <div>
              <label htmlFor="prijmeni" className="block text-sm mb-1">Příjmení *</label>
              <input
                id="prijmeni"
                type="text"
                value={formData.prijmeni}
                onChange={(e) => setFormData({...formData, prijmeni: e.target.value})}
                required
                className="w-full p-2 border rounded"
              />
            </div>

            <div>
              <label htmlFor="datum-narozeni" className="block text-sm mb-1">Datum narození *</label>
              <input
                id="datum-narozeni"
                type="date"
                value={formData.datum_narozeni}
                onChange={(e) => setFormData({...formData, datum_narozeni: e.target.value})}
                required
                className="w-full p-2 border rounded"
              />
            </div>

            <div>
              <label htmlFor="pohlavi" className="block text-sm mb-1">Pohlaví</label>
              <select
                id="pohlavi"
                value={formData.pohlavi === true ? 'male' : formData.pohlavi === false ? 'female' : ''}
                onChange={(e) => setFormData({...formData, pohlavi: e.target.value === 'male'})}
                className="w-full p-2 border rounded"
              >
                <option value="">Nezvoleno</option>
                <option value="male">Muž</option>
                <option value="female">Žena</option>
              </select>
            </div>
          </div>
        </fieldset>

        {/* Citlivé údaje - šifrované */}
        <fieldset className="border p-4 rounded-lg bg-yellow-50">
          <legend className="text-sm font-semibold px-2 text-red-600">Citlivé údaje (šifrováno)</legend>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-3">
            <div>
              <label htmlFor="ico" className="block text-sm mb-1">IČO</label>
              <input
                id="ico"
                type="text"
                value={formData.ico}
                onChange={(e) => setFormData({...formData, ico: e.target.value})}
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
                onChange={(e) => setFormData({...formData, obcan_prukaz: e.target.value})}
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
                    setFormData({...formData, adresa_trvaly_bydlist: ''});
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
                onChange={(e) => setFormData({...formData, email: e.target.value})}
                className="w-full p-2 border rounded"
              />
            </div>

            <div>
              <label htmlFor="telefon" className="block text-sm mb-1">Telefon</label>
              <input
                id="telefon"
                type="tel"
                value={formData.telefon}
                onChange={(e) => setFormData({...formData, telefon: e.target.value})}
                className="w-full p-2 border rounded"
              />
            </div>
          </div>
        </fieldset>

        {/* Církevní role */}
        <fieldset className="border p-4 rounded-lg">
          <legend className="text-sm font-semibold px-2">Církevní role</legend>
          
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mt-3">
            {Object.entries(roleLabels).map(([value, label]) => (
              <label key={value} htmlFor={`role-${value}`} className="flex items-center space-x-2 cursor-pointer">
                <input
                  id={`role-${value}`}
                  type="checkbox"
                  checked={formData.role_cirkinni.includes(value)}
                  onChange={() => toggleRole(value)}
                  className="rounded"
                />
                <span className="text-sm">{label}</span>
              </label>
            ))}
          </div>
        </fieldset>

        {/* Svátosti */}
        <fieldset className="border p-4 rounded-lg">
          <legend className="text-sm font-semibold px-2">Data svátostí</legend>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-3">
            <div>
              <label htmlFor="krest-datum" className="block text-sm mb-1">Křest - datum</label>
              <input
                id="krest-datum"
                type="date"
                value={formData.krest_datum}
                onChange={(e) => setFormData({...formData, krest_datum: e.target.value})}
                className="w-full p-2 border rounded"
              />
            </div>

            <div>
              <label htmlFor="krest-misto" className="block text-sm mb-1">Křest - místo</label>
              <input
                id="krest-misto"
                type="text"
                value={formData.krest_misto}
                onChange={(e) => setFormData({...formData, krest_misto: e.target.value})}
                className="w-full p-2 border rounded"
              />
            </div>

            <div>
              <label htmlFor="birovani-datum" className="block text-sm mb-1">Biřmování - datum</label>
              <input
                id="birovani-datum"
                type="date"
                value={formData.biřmování_datum}
                onChange={(e) => setFormData({...formData, biřmování_datum: e.target.value})}
                className="w-full p-2 border rounded"
              />
            </div>

            <div>
              <label htmlFor="birovani-misto" className="block text-sm mb-1">Biřmování - místo</label>
              <input
                id="birovani-misto"
                type="text"
                value={formData.biřmování_misto}
                onChange={(e) => setFormData({...formData, biřmování_misto: e.target.value})}
                className="w-full p-2 border rounded"
              />
            </div>
          </div>
        </fieldset>

        {/* Submit */}
        <button
          type="submit"
          disabled={loading}
          className={`w-full py-3 px-4 rounded-lg font-semibold text-white ${
            loading ? 'bg-gray-400' : 'bg-blue-600 hover:bg-blue-700'
          }`}
        >
          {loading ? 'Ukládání...' : 'Přidat osobu'}
        </button>
      </form>
    </div>
  );
}
