// FARNÍ AGENDA - FINANCE SERVICE LAYER
// Vytváření finančních záznamů (příjem/výdaj) s mapováním formulářových polí
// na skutečné DB sloupce (tabulka `finance`).
// VSTUP: NextRequest (JSON body z /finance/new) → VÝSTUP: NextResponse

import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';
import { loggerFromRequest, Logger } from '@/lib/logging/logger';
import { getConfig } from '@/lib/config/env_config';

// === POMOCNÉ FUNKCE (čisté, testovatelné) ===

/** String → string|null; prázdný/whitespace/ne-string → null. */
export function strOrNull(value: unknown): string | null {
  if (typeof value === 'string' && value.trim() !== '') return value;
  return null;
}

/** number|string → number|null; ne-finite → null. Pro DECIMAL sloupce. */
export function toDecimal(value: unknown): number | null {
  if (value === undefined || value === null || value === '') return null;
  // Česká desetinná čárka → tečka, tisícové mezery pryč
  const n = typeof value === 'number' ? value : parseFloat(String(value).replace(/\s/g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

/**
 * Mapování formulářových polí na DB sloupce tabulky `finance`.
 * Řeší: (1) typo ve formuláři protiplatel → DB protiplatitel,
 * (2) file pole bez DB sloupců (ignorujeme), (3) castka string→number.
 */
export function mapFinanceInput(body: Record<string, unknown>): {
  valid: boolean;
  error?: string;
  data?: Record<string, unknown>;
} {
  // typ — CHECK (typ IN ('příjem','výdaj')), NOT NULL
  if (body.typ !== 'příjem' && body.typ !== 'výdaj') {
    return { valid: false, error: 'Typ musí být „příjem“ nebo „výdaj“' };
  }

  // kategorie — TEXT NOT NULL
  const kategorie = strOrNull(body.kategorie);
  if (!kategorie) {
    return { valid: false, error: 'Kategorie je povinná' };
  }

  // castka — DECIMAL(12,2) NOT NULL CHECK (castka > 0)
  const castka = toDecimal(body.castka);
  if (castka === null || castka <= 0) {
    return { valid: false, error: 'Částka musí být kladné číslo' };
  }

  // datum_příjmu — DATE NOT NULL
  const datumPrijmu = strOrNull(body['datum_příjmu']);
  if (!datumPrijmu) {
    return { valid: false, error: 'Datum operace je povinné' };
  }

  const data: Record<string, unknown> = {
    typ: body.typ,
    kategorie,
    castka,
    datum_příjmu: datumPrijmu,
    // Formulář posílá "protoplatitel" (typo) — DB sloupec je "protiplatitel".
    // Přijmeme obě varianty pro robustnost.
    protiplatitel: strOrNull(body.protiplatel) ?? strOrNull(body.protoplatitel),
    popisek: strOrNull(body.popisek),
    // Faktura jako URL/string (file input se serializuje na {} → ignorujeme).
    doklad_url: strOrNull(body.faktura_url),
  };

  if (strOrNull(body.farnost_id)) {
    data.farnost_id = body.farnost_id;
  }

  return { valid: true, data };
}

// === VYTVOŘENÍ SUPABASE KLIENTU ===

function createDbClient(log: Logger) {
  const config = getConfig();
  return createClient(config.NEXT_PUBLIC_SUPABASE_URL, config.SUPABASE_SERVICE_ROLE_KEY);
}

// === SAVE/CREATE FINANCE ZÁZNAMU ===

export async function saveFinanceService(request: NextRequest): Promise<NextResponse> {
  const log = loggerFromRequest(request, 'FINANCE');

  try {
    const body = (await request.json()) as Record<string, unknown>;

    // Validace + mapování na DB sloupce
    const mapped = mapFinanceInput(body);
    if (!mapped.valid) {
      return NextResponse.json({ error: mapped.error }, { status: 400 });
    }
    const data = mapped.data!;

    const supabase = createDbClient(log);

    const { data: inserted, error } = await supabase
      .from('finance')
      .insert([data])
      .select()
      .single();

    if (error) {
      log.error('Vložení finančního záznamu selhalo', {
        kategorie: data.kategorie,
        castka: data.castka,
        error: error.message,
      });

      // 23505 = unique_violation (např. duplicitní identifikátor)
      if ((error as any).code === '23505') {
        return NextResponse.json(
          { error: 'Finanční záznam s tímto údajem již existuje' },
          { status: 409 }
        );
      }

      // 23514 = check_violation (např. neplatný typ/kategorie)
      if ((error as any).code === '23514') {
        return NextResponse.json(
          { error: 'Neplatná hodnota pole (typ nebo kategorie)' },
          { status: 400 }
        );
      }

      return NextResponse.json(
        { error: 'Chyba při ukládání finančního záznamu do databáze' },
        { status: 500 }
      );
    }

    if (!inserted) {
      return NextResponse.json({ error: 'Nebyla vrácena odpověď z DB' }, { status: 500 });
    }

    // Audit log — neblokuje hlavní operaci
    const authHeader = request.headers.get('authorization') || '';
    const userId = authHeader.replace('Bearer ', '').split(' ')[0] || 'system';
    try {
      await supabase.from('audit_log').insert({
        user_id: userId,
        action: 'INSERT',
        table_name: 'finance',
        record_id: inserted.id,
        data_after: JSON.stringify(data),
      });
    } catch (auditErr) {
      log.error('Chyba audit logu', { error: auditErr instanceof Error ? auditErr.message : 'Neznámá' });
    }

    log.info('Finanční záznam vytvořen', { id: inserted.id, kategorie: data.kategorie });

    return NextResponse.json(
      { success: true, finance: inserted, message: 'Finanční záznam byl úspěšně přidán' },
      { status: 201 }
    );
  } catch (error) {
    log.error('Nečekaná chyba v saveFinanceService', {
      error: error instanceof Error ? error.message : 'Neznámá',
    });
    return NextResponse.json({ error: 'Interní chyba serveru' }, { status: 500 });
  }
}
