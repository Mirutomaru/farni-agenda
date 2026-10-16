// FARNÍ AGENDA - SVÁTOSTI SERVICE
// Normalizace záznamů ze tří samostatných tabulek (krestni_zapis, birovani_zapis, svatby)
// do jednotného tvaru pro listování a statistiky.
//
// Schéma NEPOUŽÍVÁ sloupec "typ" ani společnou tabulku — typ je odvozen z tabulky.

export type SvatostTyp = 'krest' | 'birovani' | 'svadba';

/** Normalizovaný záznam svátosti pro UI (nezávislý na konkrétní tabulce). */
export interface NormalizedZapis {
  id: string;
  typ: SvatostTyp;
  /** Primární osoba (pokřtěný / birováný / muž) */
  osobaId?: string | null;
  /** Druhá osoba (u svatby žena) */
  druhOsobaId?: string | null;
  datum: string | null;
  misto: string | null;
}

// === NORMALIZACE JEDNOTLIVÝCH TABULEK ===

export function normalizeKrest(zapis: any): NormalizedZapis {
  return {
    id: zapis.id,
    typ: 'krest',
    osobaId: zapis.pokrteny_id ?? null,
    datum: zapis.datum_krstu ?? null,
    misto: zapis.misto_krstu ?? null,
  };
}

export function normalizeBirovani(zapis: any): NormalizedZapis {
  return {
    id: zapis.id,
    typ: 'birovani',
    osobaId: zapis.birovan_id ?? null,
    datum: zapis.datum_birovani ?? null,
    misto: zapis.misto_birovani ?? null,
  };
}

export function normalizeSvatba(zapis: any): NormalizedZapis {
  return {
    id: zapis.id,
    typ: 'svadba',
    osobaId: zapis.muz_id ?? null,
    druhOsobaId: zapis.zena_id ?? null,
    datum: zapis.datum_svatby ?? null,
    misto: zapis.misto_svatby ?? null,
  };
}

// === SLOUČENÍ A FILTRACE ===

/**
 * Sloučí záznamy ze všech tří tabulek do jednoho seznamu,
 * seřadí sestupně podle data a omezí na `limit` položek.
 */
export function mergeSvatosti(
  kresty: any[] | null | undefined,
  birovani: any[] | null | undefined,
  svatby: any[] | null | undefined,
  limit = 50
): NormalizedZapis[] {
  const all: NormalizedZapis[] = [
    ...(kresty || []).map(normalizeKrest),
    ...(birovani || []).map(normalizeBirovani),
    ...(svatby || []).map(normalizeSvatba),
  ];

  // ISO datové řetězce se dají porovnávat lexikograficky (YYYY-MM-DD)
  return all
    .sort((a, b) => (b.datum ?? '').localeCompare(a.datum ?? ''))
    .slice(0, limit);
}

/** Filtruje normalizované záznamy podle typu; prázdný/neznámý typ vrátí vše. */
export function filterByTyp(records: NormalizedZapis[], typ?: string): NormalizedZapis[] {
  if (!typ || !['krest', 'birovani', 'svadba'].includes(typ)) return records;
  return records.filter((r) => r.typ === typ);
}

// === SVATBA — SVĚDKOVÉ (tabulka svatba_svedkove) ===

/**
 * Vytvoří řádky pro tabulku `svatba_svedkove` ze seznamu ID svědků.
 * Odstraní duplicity a prázdné hodnoty (UNIQUE(svatba_id, svedek_id)).
 */
export function buildSvedkoveRows(svatbaId: string, svedekIds: Array<string | null | undefined>): { svatba_id: string; svedek_id: string }[] {
  const unique = [...new Set((svedekIds || []).filter((id): id is string => !!id))];
  return unique.map((svedek_id) => ({ svatba_id: svatbaId, svedek_id }));
}

/**
 * Přepočte řádky `svatba_svedkove` na mapu svatba_id → seznam ID svědků
 * pro zobrazení v UI (list/detail).
 */
export function groupSvedkoveBySvatba(rows: Array<{ svatba_id?: string | null; svedek_id?: string | null }> | null | undefined): Map<string, string[]> {
  const map = new Map<string, string[]>();
  for (const row of rows || []) {
    if (!row.svatba_id || !row.svedek_id) continue;
    const list = map.get(row.svatba_id) ?? [];
    if (!list.includes(row.svedek_id)) list.push(row.svedek_id);
    map.set(row.svatba_id, list);
  }
  return map;
}

// === CERTIFIKÁTY ===

/**
 * Mapuje typ svátosti na typ certifikátu dle kontraktu certificate-service.
 * Pozor: service validuje hodnoty 'krest' | 'birovan' (ne 'birovani').
 * Svatba zatím certifikát nemá → null.
 */
export function certificateTypeFor(typ: SvatostTyp): 'krest' | 'birovan' | null {
  if (typ === 'krest') return 'krest';
  if (typ === 'birovani') return 'birovan';
  return null;
}

// === DATOVÉ ROZMEZÍ MĚSÍCE ===

/**
 * Vrací hranice kalendářního měsíce pro date range query:
 * `from` = první den měsíce, `toExclusive` = první den následujícího měsíce.
 * (Oprava původního bugu s horní hranicí "-31", která vynechávala poslední den.)
 */
export function monthRange(year: number, month0: number): { from: string; toExclusive: string } {
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  return {
    from: fmt(new Date(Date.UTC(year, month0, 1))),
    toExclusive: fmt(new Date(Date.UTC(year, month0 + 1, 1))),
  };
}
