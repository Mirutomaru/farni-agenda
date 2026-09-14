// FARNÍ AGENDA - SMARTFORM SEARCH SERVICE
// Proxy pro Smartform.cz API adresního našeptávače
// VSTUP: { query: string, limit?: number } → VÝSTUP: { success: boolean, data: AddressResult[] }

import { NextRequest, NextResponse } from 'next/server';
import { loggerFromRequest, Logger } from '@/lib/logging/logger';
import { getEnv, hasEnv } from '@/lib/config/env_config';
import { fetchWithRetry } from '@/lib/utils/retry';

interface SmartformItem {
  ulice?: string;
  cislo_popisne?: string;
  cislo_orientacni?: string;
  obec?: string;
  psc?: string;
  okres?: string;
  kraj?: string;
}

export interface AddressResult {
  ulice: string;
  cislo_popisne: string;
  cislo_orientacni?: string;
  obec: string;
  psc: string;
  okres?: string;
  kraj?: string;
}

// === KONFIGURACE ===
const SMARTFORM_BASE_URL = 'https://api.smartform.cz/v1';

// === VALIDACE VSTUPŮ ===
function validateInput(query: string | null, limitParam?: string): 
  { valid: boolean; query?: string; limit?: number; error?: string } {
  
  if (!query || query.length < 2) return { valid: false, error: 'Dotaz musí mít alespoň 2 znaky' };

  const limit = parseInt(limitParam || '5', 10);
  const clampedLimit = Math.min(Math.max(limit, 1), 10); // Range 1-10
  return { valid: true, query, limit: clampedLimit };
}

// === NORMALIZACE VÝSLEDKŮ ===
function normalizeResults(data: SmartformItem[]): AddressResult[] {
  const results: AddressResult[] = [];

  for (const item of data) {
    results.push({
      ulice: item.ulice || '',
      cislo_popisne: item.cislo_popisne || '',
      cislo_orientacni: item.cislo_orientacni,
      obec: item.obec || '',
      psc: item.psc || '',
      okres: item.okres,
      kraj: item.kraj,
    });
  }

  return results;
}

// === VOLÁNÍ SMARTFORM API s retry patternem ===
async function searchAddresses(log: Logger, query: string, limit: number): Promise<NextResponse> {
  const apiKey = getEnv('SMARTFORM_API_KEY');
  
  if (!apiKey) {
    log.error('Smartform API není nakonfigurováno', {});
    return NextResponse.json({ error: 'Smartform API není nakonfigurováno' }, { status: 503 });
  }

  const url = `${SMARTFORM_BASE_URL}/search?query=${encodeURIComponent(query)}&limit=${Math.min(limit, 10)}`;

  try {
    const response = await fetchWithRetry({
      url,
      init: {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
      },
      maxDelayMs: 5000, // Lower max delay for address search
    });

    if (!response.ok) {
      const errorText = await response.text();
      log.error(`Smartform API error (${response.status})`, { status: response.status, error: errorText.slice(0, 200) });
      
      return NextResponse.json({ error: 'Chyba při volání Smartform API' }, { status: response.status });
    }

    const data = await response.json();
    
    if (data.success && Array.isArray(data.data)) {
      const normalized = normalizeResults(data.data);
      log.info('Adresy nalezeny', { count: normalized.length, query });
      return NextResponse.json({ success: true, data: normalized });
    }

    // Neočekávaný formát odpovědi
    log.warn('Neočekávaná struktura Smartform odpovědi', { dataType: typeof data });
    return NextResponse.json({ success: false, data: [] }, { status: 200 });
  } catch (fetchError) {
    log.error('Chyba při komunikaci se Smartform API', { error: fetchError instanceof Error ? fetchError.message : 'Neznámá' });
    
    return NextResponse.json({ error: 'Interní chyba serveru' }, { status: 500 });
  }
}

// === EXPORT PRO API ROUTE (GET) ===
export async function GET(request: NextRequest): Promise<NextResponse> {
  const log = loggerFromRequest(request, 'SMARTFORM');
  
  try {
    const searchParams = request.nextUrl.searchParams;
    const query = searchParams.get('query');
    const limitParam = searchParams.get('limit') || undefined;

    // Validace vstupů
    const validation = validateInput(query, limitParam);
    if (!validation.valid) return NextResponse.json({ error: validation.error }, { status: 400 });

    // Delegování na service layer s retry patternem
    return await searchAddresses(log, validation.query!, validation.limit!);
  } catch (error) {
    log.error('Nečekaná chyba v SMARTFORM-SERVICE', { error: error instanceof Error ? error.message : 'Neznámá' });
    
    return NextResponse.json({ error: 'Interní chyba serveru' }, { status: 500 });
  }
}
