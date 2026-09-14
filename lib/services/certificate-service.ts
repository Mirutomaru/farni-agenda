// FARNÍ AGENDA - CERTIFICATE GENERATION SERVICE
// Generování certifikátů (křestní/birovací listiny)
// Deleguje na Edge Function certificates-generator pro PDF generování

import { createClient } from '@supabase/supabase-js';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { loggerFromRequest, Logger } from '@/lib/logging/logger';
import { getConfig } from '@/lib/config/env_config';
import { fetchWithRetry } from '@/lib/utils/retry';

type CertificateType = 'krest' | 'birovan';

interface CertificatePayload {
  personId: string;
  type: CertificateType;
}

// === VALIDACE VSTUPŮ ===
function validateCertificateInput(data: unknown): { valid: boolean; error?: string } {
  if (!data || typeof data !== 'object') return { valid: false, error: 'Neplatný vstupní formát' };
  
  const payload = data as Record<string, unknown>;
  
  if (!payload.personId || typeof payload.personId !== 'string') {
    return { valid: false, error: 'Chybí personId (povinný string)' };
  }
  if (!['krest', 'birovan'].includes(payload.type as string)) {
    return { valid: false, error: `Neplatný typ certifikátu. Povolené hodnoty: krest, birovani` };
  }
  
  return { valid: true };
}

// === ZÍSKÁNÍ DB TABLE PODLE TYPU CERTIFIKÁTU ===
function getDbTableForType(type: CertificateType): string {
  return type === 'krest' ? 'krestni_zapis' : 'birovani_zapis';
}

// === VYTVOŘENÍ CHYBOVÉ ODPOVĚDI ===
function createErrorResponse(log: Logger, message: string, status: number): NextResponse {
  log.error(`[${status}] ${message}`, { status });
  return NextResponse.json({ error: message }, { status });
}

// === GENEROVÁNÍ CERTIFIKÁTU ===
async function generateCertificate(payload: CertificatePayload, log: Logger): Promise<NextResponse> {
  const config = getConfig();
  const supabase = createClient(config.NEXT_PUBLIC_SUPABASE_URL, config.SUPABASE_SERVICE_ROLE_KEY);
  const dbTable = getDbTableForType(payload.type);

  // Ověření existence záznamu v DB
  try {
    const { data: existingRecord, error: fetchError } = await supabase
      .from(dbTable)
      .select('id')
      .eq('id', payload.personId)
      .maybeSingle();

    if (fetchError) {
      log.error(`Chyba při načítání ${dbTable}`, { error: fetchError.message });
      return createErrorResponse(log, 'Chyba při načítání záznamu', 500);
    }
    if (!existingRecord) {
      const typeName = payload.type === 'krest' ? 'křtu' : 'birování';
      return createErrorResponse(log, `Záznam o ${typeName} nebyl nalezen`, 404);
    }
  } catch (dbError) {
    log.error('Neočekávaná DB chyba', { error: dbError instanceof Error ? dbError.message : 'Neznámá' });
    return createErrorResponse(log, 'Chyba při načítání záznamu', 500);
  }

  // Delegování na Firebase Cloud Function pro PDF generování s retry patternem
  const functionUrl = config.FIREBASE_CERTIFICATE_FUNCTION_URL;
  
  if (!functionUrl) {
    return createErrorResponse(log, 'Generování certifikátů není dostupné', 503);
  }

  try {
    const response = await fetchWithRetry({
      url: functionUrl,
      init: {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${config.FIREBASE_FUNCTION_KEY || ''}`
        },
        body: JSON.stringify({ ...payload, personId: payload.personId }),
      },
    });

    if (!response.ok) {
      const errorBody = await response.text();
      log.error(`Edge Function returned ${response.status}`, { status: response.status, error: errorBody });
      return createErrorResponse(log, 'Generování certifikátu selhalo', response.status);
    }

    const result = await response.json();
    log.info('Certifikát vygenerován úspěšně', { personId: payload.personId, type: payload.type });
    return NextResponse.json(result, { status: 200 });
  } catch (fetchError) {
    log.error('Chyba při volání Edge Function', { error: fetchError instanceof Error ? fetchError.message : 'Neznámá chyba' });
    return createErrorResponse(log, 'Chyba při generování certifikátu', 500);
  }
}

// === EXPORT PRO API ROUTE ===
export async function POST(request: NextRequest): Promise<NextResponse> {
  const log = loggerFromRequest(request, 'CERT');
  
  try {
    const body = await request.json();
    
    // Validace vstupů
    const validation = validateCertificateInput(body);
    if (!validation.valid) return createErrorResponse(log, validation.error || 'Neplatný vstup', 400);

    // Delegování na service layer
    const payload: CertificatePayload = {
      personId: body.personId as string,
      type: body.type as CertificateType,
    };

    return await generateCertificate(payload, log);
  } catch (error) {
    log.error('Nečekaná chyba v CERT-SERVICE', { error: error instanceof Error ? error.message : 'Neznámá chyba' });
    return createErrorResponse(log, 'Interní chyba serveru', 500);
  }
}
