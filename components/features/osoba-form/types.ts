// FARNÍ AGENDA - SDÍLENÉ TYPY A VALIDACE PRO OSOBA-FORM
// Rozdělení formuláře osoby na subkomponenty (identita / kontakt / role / svátosti).

import { z } from 'zod';

export interface OsobaFormData {
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

export interface SmartformResponse {
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

/** Prázdný stav formuláře (nová osoba). */
export const EMPTY_OSOBA_FORM: OsobaFormData = {
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
  biřmování_misto: '',
};

/** Popisné labely pro církevní role (sdílené mezi formulářem a testy). */
export const ROLE_LABELS: Record<string, string> = {
  clen_rady: 'Člen rady farnosti',
  pokladnik: 'Pokladník',
  jehen: 'Jáhen',
  kněz: 'Kněz',
  farnik: 'Farník',
};

// Zod validace formuláře (běží na clientu pro okamžitou zpětnou vazbu)
export const zodOsobaForm = z.object({
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
