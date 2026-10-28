// FARNÍ AGENDA - MAJETEK SERVICE LAYER
// Vytváření záznamů o majetku farnosti s mapováním formulářových polí
// na skutečné DB sloupce (tabulka `majetek`).
// VSTUP: NextRequest (JSON body z app/majetek/new/page.tsx) → VÝSTUP: NextResponse

import { createClient } from '@/lib/supabase/server';
import { loggerFromRequest, Logger } from '@/lib/logging/logger';
import { NextRequest, NextResponse } from 'next/server';

// === POMOCNÉ FUNKCE (čisté, testovatelné) ===

/** String → string|null; prázdný/whitespace/ne-string → null. */
export function strOrNull(value: unknown): string | null {
  if (typeof value === 'string' && value.trim() !== '') return value.trim();
  return null;
}

/** number|string → number|null; ne-finite → null. Pro DECIMAL sloupce. */
export function toDecimal(value: unknown): number | null {
  if (value === undefined || value === null || value === '') return null;
  const n = typeof value === 'number' ? value : parseFloat(String(value).replace(/\s/g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

/**
 * Povolené kategorie majetku (podle CHECK constraintu v DB):
 *   kategorie IN ('nemovitost', 'movitost', 'duchovní_pomůcky', 'finance')
 */
const POVOLENE_KATEGORIE = ['nemovitost', 'movitost', 'duchovní_pomůcky', 'finance'] as const;

/**
 * Normalizace kategorie z formuláře na DB hodnotu.
 * Formulář posílá `duchovni_pomucky` (bez diakritiky) — DB chce `duchovní_pomůcky`.
 */
export function normalizeKategorie(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const v = value.trim().toLowerCase();
  if (v === 'duchovni_pomucky' || v === 'duchovní_pomůcky') return 'duchovní_pomůcky';
  return POVOLENE_KATEGORIE.includes(v as any) ? v : null;
}

/**
 * Mapování formulářových polí na DB sloupce tabulky `majetek`.
 * Řeší: (1) diakritické rozdíly ve názvech sloupců,
 * (2) kategorie duchovni_pomucky → duchovní_pomůcky,
 * (3) pole bez DB sloupce (datum_ocenění, fotografie, dokumenty) se ignorují.
 */
export function mapMajetekInput(body: Record<string, unknown>): {
  valid: boolean;
  error?: string;
  data?: Record<string, unknown>;
} {
  // nazev — TEXT NOT NULL
  const nazev = strOrNull(body.nazev);
  if (!nazev) return { valid: false, error: 'Název majetku je povinný' };

  // kategorie — CHECK constraint
  const kategorie = normalizeKategorie(body.kategorie);
  if (!kategorie) {
    return { valid: false, error: `Neplatná kategorie. Povolené: ${POVOLENE_KATEGORIE.join(', ')}` };
  }

  // === MAPOVÁNÍ FORMULÁŘOVÝCH POLÍ NA DB SLOUPCE (přesné názvy s diakritikou) ===
  const data: Record<string, unknown> = {
    nazev,
    kategorie,
    popis: strOrNull(body.popis),
    // Formulář `inventarni_cislo` → DB sloupec `inventární_cislo` (diakritika!)
    'inventární_cislo': strOrNull(body.inventarni_cislo),
    // Formulář `umisteni` → DB sloupec `umistění` (diakritika!)
    'umistění': strOrNull(body.umisteni),
    // Formulář `počáteční_hodnota` → DB sloupec `počiáteční_hodnota` (jiná diakritika!)
    'počiáteční_hodnota': toDecimal(body['počáteční_hodnota']),
    // Stejný název ve formuláři i v DB
    'aktuální_hodnota': toDecimal(body['aktuální_hodnota']),
  };

  if (strOrNull(body.farnost_id)) {
    data.farnost_id = body.farnost_id;
  }

  return { valid: true, data };
}

// === VYTVOŘENÍ MAJETEK ZÁZNAMU ===

export async function saveMajetekService(request: NextRequest): Promise<NextResponse> {
  const log: Logger = loggerFromRequest(request, 'MAJETEK');

  try {
    const body = (await request.json()) as Record<string, unknown>;

    // Validace + mapování na DB sloupce
    const mapped = mapMajetekInput(body);
    if (!mapped.valid) {
      return NextResponse.json({ error: mapped.error }, { status: 400 });
    }
    const data = mapped.data!;

    const supabase = await createClient();
    const { data: inserted, error } = await supabase
      .from('majetek')
      .insert([data])
      .select()
      .single();

    if (error) {
      log.error('Vložení majetku selhalo', { nazev: data.nazev, error: error.message });

      // 23505 = unique_violation (duplicitní inventární číslo)
      if ((error as any).code === '23505') {
        return NextResponse.json(
          { error: 'Majetek s tímto inventárním číslem již existuje' },
          { status: 409 }
        );
      }
      // 23514 = check_violation (neplatná kategorie)
      if ((error as any).code === '23514') {
        return NextResponse.json(
          { error: 'Neplatná hodnota pole (kategorie)' },
          { status: 400 }
        );
      }

      return NextResponse.json(
        { error: 'Chyba při ukládání majetku do databáze' },
        { status: 500 }
      );
    }

    if (!inserted) {
      return NextResponse.json({ error: 'Nebyla vrácena odpověď z DB' }, { status: 500 });
    }

    // Audit log — neblokuje hlavní operaci (append-only tabulka audit_log)
    const authHeader = request.headers.get('authorization') || '';
    const userId = authHeader.replace('Bearer ', '').split(' ')[0] || 'system';
    try {
      await supabase.from('audit_log').insert({
        user_id: userId,
        action: 'INSERT',
        table_name: 'majetek',
        record_id: inserted.id,
        data_after: JSON.stringify(data),
      });
    } catch (auditErr) {
      log.error('Chyba audit logu', { error: auditErr instanceof Error ? auditErr.message : 'Neznámá' });
    }

    log.info('Majetek vytvořen', { id: inserted.id, nazev: data.nazev });

    return NextResponse.json(
      { success: true, majetek: inserted, message: 'Majetek byl úspěšně přidán' },
      { status: 201 }
    );
  } catch (error) {
    log.error('Nečekaná chyba v saveMajetekService', {
      error: error instanceof Error ? error.message : 'Neznámá',
    });
    return NextResponse.json({ error: 'Interní chyba serveru' }, { status: 500 });
  }
}
