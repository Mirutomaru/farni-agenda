// FARNÍ AGENDA - NEXT.JS KOMPONENTA
// Formulář osoby — orchestrátor. Logické sekce jsou v subkomponentách:
//   IdentitySection (základní údaje), ContactSection (citlivé údaje + Smartform),
//   RolesSection (církevní role), SacramentsSection (svátosti).

'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { logger } from '@/lib/logging/logger';
import IdentitySection from './IdentitySection';
import ContactSection from './ContactSection';
import RolesSection from './RolesSection';
import SacramentsSection from './SacramentsSection';
import { EMPTY_OSOBA_FORM, zodOsobaForm } from './types';
import type { OsobaFormData } from './types';

const log = logger('OSOBA_FORM');

export default function OsobaForm({ editId }: { editId?: string }) {
  const supabase = createClient();
  const [loading, setLoading] = useState(false);
  const [farnosti, setFarnosti] = useState<any[]>([]);
  const [vybrana_farnost, setVybranaFarnost] = useState<string>('');

  // Formulářová data (jediný zdroj pravdy — sekce dostávají patch callback)
  const [formData, setFormData] = useState<OsobaFormData>(EMPTY_OSOBA_FORM);

  const handleFieldChange = (patch: Partial<OsobaFormData>) => {
    setFormData((prev) => ({ ...prev, ...patch }));
  };

  // Načtení farností pro select
  const loadFarnosti = async () => {
    try {
      const { data, error } = await supabase
        .from('farnosti')
        .select('*')
        .order('nazev');

      if (error) throw error;
      setFarnosti(data || []);
    } catch (err) {
      log.error('Chyba při načítání farností', {}, err instanceof Error ? err : null);
    }
  };

  // Načtení existující osoby pro edit režim (editId)
  const loadOsoba = async () => {
    if (!editId) return;
    try {
      const { data, error } = await supabase
        .from('osoby')
        .select('*')
        .eq('id', editId)
        .single();

      if (error || !data) throw new Error(error?.message || 'Osoba nenalezena');

      // Citlivá pole jsou v DB zašifrovaná a dešifrovací funkce zatím neexistuje,
      // proto se prefillují jen veřejná pole. Prázdné citlivé pole = bez změny
      // (updateOsobaService ignoruje prázdné hodnoty).
      setFormData({
        krestni_jmeno: data.krestni_jmeno || '',
        prijmeni: data.prijmeni || '',
        datum_narozeni: data.datum_narozeni ? String(data.datum_narozeni).slice(0, 10) : '',
        pohlavi: typeof data.pohlavi === 'boolean' ? data.pohlavi : null,
        ico: '',
        obcan_prukaz: '',
        adresa_trvaly_bydlist: '',
        email: '',
        telefon: '',
        role_cirkinni: Array.isArray(data.role_cirkinni) ? data.role_cirkinni : [],
        krest_datum: data.krest_datum ? String(data.krest_datum).slice(0, 10) : '',
        krest_misto: data.krest_misto || '',
        biřmování_datum: data.birovani_datum ? String(data.birovani_datum).slice(0, 10) : '',
        biřmování_misto: data.birovani_misto || ''
      });

      if (data.farnost_id) {
        setVybranaFarnost(String(data.farnost_id));
      }
    } catch (err) {
      log.error('Chyba při načítání osoby pro edit', {}, err instanceof Error ? err : null);
      alert(`Osoba se nepodařila načíst: ${err instanceof Error ? err.message : 'neznámá chyba'}`);
    }
  };

  useEffect(() => {
    loadFarnosti();
  }, []);

  useEffect(() => {
    loadOsoba();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editId]);

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
        method: editId ? 'PUT' : 'POST',
        headers: {
          'Content-Type': 'application/json',
          // Authorization header pro audit log (pokud je user přihlášen)
          ...(typeof window !== 'undefined' ? {} : {})
        },
        body: JSON.stringify(editId ? { id: editId, ...osobaData } : osobaData),
      });

      if (!response.ok) {
        const errorBody = await response.json();
        throw new Error(errorBody.error || `HTTP ${response.status}`);
      }

      alert(editId
        ? `Osoba ${formData.krestni_jmeno} ${formData.prijmeni} byla úspěšně aktualizována!`
        : `Osoba ${formData.krestni_jmeno} ${formData.prijmeni} byla úspěšně přidána!`);

      // Reset formuláře
      setFormData(EMPTY_OSOBA_FORM);

    } catch (err) {
      log.error('Chyba při přidávání osoby', {}, err instanceof Error ? err : null);
      alert('Chyba při ukládání osoby. Zkuste to prosím znovu.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto p-6">
      <h1 className="text-2xl font-bold mb-6">{editId ? 'Upravit osobu' : 'Přidat novou osobu'}</h1>

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

        {/* Logické sekce — každá v samostatné subkomponentě */}
        <IdentitySection formData={formData} onChange={handleFieldChange} />
        <ContactSection formData={formData} onChange={handleFieldChange} />
        <RolesSection formData={formData} onChange={handleFieldChange} />
        <SacramentsSection formData={formData} onChange={handleFieldChange} />

        {/* Submit */}
        <button
          type="submit"
          disabled={loading}
          className={`w-full py-3 px-4 rounded-lg font-semibold text-white ${
            loading ? 'bg-gray-400' : 'bg-blue-600 hover:bg-blue-700'
          }`}
        >
          {loading ? 'Ukládání...' : (editId ? 'Uložit změny' : 'Přidat osobu')}
        </button>
      </form>
    </div>
  );
}
