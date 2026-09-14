// FARNÍ AGENDA - OSOBAS SERVICE LAYER
// Business logic pro CRUD osob s server-side šifrováním citlivých polí
// VSTUP: NextRequest (JSON body) → VÝSTUP: NextResponse

import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';
import { encrypt } from '@/lib/security/encryption';
import { loggerFromRequest, Logger } from '@/lib/logging/logger';
import { getConfig, EmailProviderError } from '@/lib/config/env_config';
import { fetchWithRetry } from '@/lib/utils/retry';

// === DATOVÉ TYPY ===

interface CitlivePole {
  ico: string | null;
  obcan_prukaz: string | null;
  adresa_trvaly_bydlist: string | null;
  email: string | null;
  telefon: string | null;
}

interface OsobaVstup {
  farnost_id?: string;
  krestni_jmeno?: string;
  prijmeni?: string;
  datum_narozeni?: string;
  pohlavi?: boolean | null;
  role_cirkinni?: string[];
  krest_datum?: string | null;
  krest_misto?: string | null;
  biřmování_datum?: string | null;
  biřmování_misto?: string | null;
  // Citlivá pole - budou zašifrována na serveru
  ico?: string | null;
  obcan_prukaz?: string | null;
  adresa_trvaly_bydlist?: string | null;
  email?: string | null;
  telefon?: string | null;
}

interface OsobaRozsirena extends OsobaVstup {
  id: string;
}

// === VALIDACE VSTUPŮ ===

function validateOsoba(data: unknown): { valid: boolean; payload?: OsobaVstup; error?: string } {
  if (!data || typeof data !== 'object') {
    return { valid: false, error: 'Neplatný vstupní formát' };
  }

  const body = data as Record<string, unknown>;

  if (!body.krestni_jmeno || typeof body.krestni_jmeno !== 'string') {
    return { valid: false, error: 'Křestní jméno je povinný string' };
  }

  if (!body.prijmeni || typeof body.prijmeni !== 'string') {
    return { valid: false, error: 'Příjmení je povinný string' };
  }

  if (!body.datum_narozeni || typeof body.datum_narozeni !== 'string') {
    return { valid: false, error: 'Datum narození je povinný string' };
  }

  const payload: OsobaVstup = {
    farnost_id: (typeof body.farnost_id === 'string' && body.farnost_id) ? body.farnost_id : undefined,
    krestni_jmeno: String(body.krestni_jmeno),
    prijmeni: String(body.prijmeni),
    datum_narozeni: String(body.datum_narozeni),
    pohlavi: (body.pohlavi === true || body.pohlavi === false) ? body.pohlavi : null,
    role_cirkinni: Array.isArray(body.role_cirkinni) ? body.role_cirkinni as string[] : [],
    krest_datum: (typeof body.krest_datum === 'string' && body.krest_datum) ? body.krest_datum : null,
    krest_misto: (typeof body.krest_misto === 'string' && body.krest_misto) ? body.krest_misto : null,
    biřmování_datum: (typeof body.biřmování_datum === 'string' && body.biřmování_datum) ? body.biřmování_datum : null,
    biřmování_misto: (typeof body.biřmování_misto === 'string' && body.biřmování_misto) ? body.biřmování_misto : null,
  };

  return { valid: true, payload };
}

// === ŠIFROVÁNÍ CITLIVÝCH POLÍ (SERVER-SIDE) ===

function encryptCitlivePole(citlivePole: CitlivePole, log: Logger): Record<string, string | null> {
  const result: Record<string, string | null> = {};

  // IČO - šifrováno
  if (citlivePole.ico) {
    try {
      result.ico_encrypted = encrypt(citlivePole.ico);
    } catch (err) {
      log.error('Šifrování IČO selhalo', { error: err instanceof Error ? err.message : 'Neznámá' });
      result.ico_encrypted = null; // Fallback - neblokuji celý request
    }
  } else {
    result.ico_encrypted = null;
  }

  // Občanský průkaz - šifrováno
  if (citlivePole.obcan_prukaz) {
    try {
      result.obcan_prukaz_encrypted = encrypt(citlivePole.obcan_prukaz);
    } catch (err) {
      log.error('Šifrování občanského průkazu selhalo', { error: err instanceof Error ? err.message : 'Neznámá' });
      result.obcan_prukaz_encrypted = null;
    }
  } else {
    result.obcan_prukaz_encrypted = null;
  }

  // Adresa - šifrováno
  if (citlivePole.adresa_trvaly_bydlist) {
    try {
      result.adresa_trvaly_bydlist_encrypted = encrypt(citlivePole.adresa_trvaly_bydlist);
    } catch (err) {
      log.error('Šifrování adresy selhalo', { error: err instanceof Error ? err.message : 'Neznámá' });
      result.adresa_trvaly_bydlist_encrypted = null;
    }
  } else {
    result.adresa_trvaly_bydlist_encrypted = null;
  }

  // Email - šifrován (pro birthday-watcher)
  if (citlivePole.email) {
    try {
      result.email_encrypted = encrypt(citlivePole.email);
    } catch (err) {
      log.error('Šifrování emailu selhalo', { error: err instanceof Error ? err.message : 'Neznámá' });
      result.email_encrypted = null;
    }
  } else {
    result.email_encrypted = null;
  }

  // Telefon - šifrován
  if (citlivePole.telefon) {
    try {
      result.telefon_encrypted = encrypt(citlivePole.telefon);
    } catch (err) {
      log.error('Šifrování telefonu selhalo', { error: err instanceof Error ? err.message : 'Neznámá' });
      result.telefon_encrypted = null;
    }
  } else {
    result.telefon_encrypted = null;
  }

  return result;
}

// === VYTVOŘENÍ SUPABASE KLIENTU ===

function createDbClient(log: Logger) {
  try {
    const config = getConfig();
    return createClient(config.NEXT_PUBLIC_SUPABASE_URL, config.SUPABASE_SERVICE_ROLE_KEY);
  } catch (err) {
    log.error('Server není správně nakonfigurován', { 
      error: err instanceof Error ? err.message : 'Neznámá' 
    });
    throw new Error('Server není správně nakonfigurován (chybí SUPABASE_URL nebo SERVICE_ROLE_KEY)');
  }
}

// === SAVE/CREATE OSOBY ===

export async function saveOsobaService(request: NextRequest): Promise<NextResponse> {
  const log = loggerFromRequest(request, 'OSOBAS');
  
  try {
    const body = await request.json();
    
    // Validace vstupů
    const validation = validateOsoba(body);
    if (!validation.valid) {
      return NextResponse.json({ error: validation.error }, { status: 400 });
    }

    const payload = validation.payload!;
    
    // Citlivá pole (mohou být undefined - budou ignorována)
    const citlivePole: CitlivePole = {
      ico: body.ico || null,
      obcan_prukaz: body.obcan_prukaz || null,
      adresa_trvaly_bydlist: body.adresa_trvaly_bydlist || null,
      email: body.email || null,
      telefon: body.telefon || null,
    };

    // Šifrování na serveru - klíč nikdy neopustí backend
    const encrypted = encryptCitlivePole(citlivePole, log);

    const supabase = createDbClient(log);
    
    // Vložení do DB (bez citlivých polí, která jsou už zašifrovaná)
    const osobaData: Record<string, unknown> = {
      krestni_jmeno: payload.krestni_jmeno,
      prijmeni: payload.prijmeni,
      datum_narozeni: payload.datum_narozeni,
      pohlavi: payload.pohlavi,
      role_cirkinni: payload.role_cirkinni || [],
    };

    if (payload.farnost_id) {
      osobaData.farnost_id = payload.farnost_id;
    }

    if (payload.krest_datum) {
      osobaData.krest_datum = payload.krest_datum;
    }
    if (payload.krest_misto) {
      osobaData.krest_misto = payload.krest_misto;
    }
    if (payload.biřmování_datum) {
      osobaData.biřmování_datum = payload.biřmování_datum;
    }
    if (payload.biřmování_misto) {
      osobaData.biřmování_misto = payload.biřmování_misto;
    }

    // Přidání zašifrovaných polí
    Object.assign(osobaData, encrypted);

    const { data, error } = await supabase
      .from('osoby')
      .insert([osobaData])
      .select()
      .single();

    if (error) {
      log.error('Vložení osoby selhalo', { 
        osobaId: payload.farnost_id, 
        error: error.message 
      });
      
      // Zpracování specifických DB chyb
      if (error.code === '23505') {
        return NextResponse.json(
          { error: 'Osoba s tímto údajem již existuje' },
          { status: 409 }
        );
      }

      return NextResponse.json(
        { error: 'Chyba při ukládání osoby do databáze' },
        { status: 500 }
      );
    }

    if (!data) {
      return NextResponse.json(
        { error: 'Nebyla vrácena odpověď z DB' },
        { status: 500 }
      );
    }

    // Audit log - kdo co vytvořil
    const authHeader = request.headers.get('authorization') || '';
    const userId = authHeader.replace('Bearer ', '').split(' ')[0] || 'system';

    try {
      await supabase.from('audit_log').insert({
        user_id: userId,
        action: 'INSERT',
        table_name: 'osoby',
        record_id: data.id,
        data_after: JSON.stringify(osobaData),
      });
      
      log.info('Osoba vytvořena', { 
        osobaId: data.id, 
        krestniJmeno: payload.krestni_jmeno,
        prijmeni: payload.prijmeni 
      });
    } catch (auditErr) {
      // Audit selže - neblokuji hlavní operaci
      log.error('Chyba audit logu', { error: auditErr instanceof Error ? auditErr.message : 'Neznámá' });
    }

    return NextResponse.json(
      { 
        success: true, 
        osoba: data,
        message: `Osoba ${payload.krestni_jmeno} ${payload.prijmeni} byla úspěšně přidána`
      },
      { status: 201 }
    );

  } catch (error) {
    log.error('Nečekaná chyba v saveOsobaService', { 
      error: error instanceof Error ? error.message : 'Neznámá' 
    });
    
    return NextResponse.json(
      { error: 'Interní chyba serveru' },
      { status: 500 }
    );
  }
}

// === AKTUALIZACE OSOBY ===

export async function updateOsobaService(request: NextRequest): Promise<NextResponse> {
  const log = loggerFromRequest(request, 'OSOBAS');
  
  try {
    const body = await request.json();
    
    if (!body.id || typeof body.id !== 'string') {
      return NextResponse.json({ error: 'Chybí identifikátor osoby (id)' }, { status: 400 });
    }

    const osobaId = body.id;
    
    // Validace vstupů (stejné jako save)
    const validation = validateOsoba(body);
    if (!validation.valid) {
      return NextResponse.json({ error: validation.error }, { status: 400 });
    }

    const payload = validation.payload!;
    
    // Citlivá pole (mohou být undefined - budou ignorována)
    const citlivePole: CitlivePole = {
      ico: body.ico || null,
      obcan_prukaz: body.obcan_prukaz || null,
      adresa_trvaly_bydlist: body.adresa_trvaly_bydlist || null,
      email: body.email || null,
      telefon: body.telefon || null,
    };

    // Šifrování na serveru
    const encrypted = encryptCitlivePole(citlivePole, log);

    const supabase = createDbClient(log);
    
    // Získání starého záznamu pro audit (data_before)
    const { data: oldData, error: fetchErr } = await supabase
      .from('osoby')
      .select('*')
      .eq('id', osobaId)
      .single();

    if (fetchErr || !oldData) {
      log.warn('Osoba k aktualizaci nebyla nalezena', { osobaId });
      return NextResponse.json(
        { error: 'Osoba k aktualizaci nebyla nalezena' },
        { status: 404 }
      );
    }

    // Update - pouze změněná pole
    const updateData: Record<string, unknown> = {};

    if (payload.krestni_jmeno !== oldData.krestni_jmeno) {
      updateData.krestni_jmeno = payload.krestni_jmeno;
    }
    if (payload.prijmeni !== oldData.prijmeni) {
      updateData.prijmeni = payload.prijmeni;
    }
    if (payload.datum_narozeni !== oldData.datum_narozeni) {
      updateData.datum_narozeni = payload.datum_narozeni;
    }
    if (payload.pohlavi !== oldData.pohlavi) {
      updateData.pohlavi = payload.pohlavi;
    }
    if (JSON.stringify(payload.role_cirkinni || []) !== JSON.stringify(oldData.role_cirkinni || [])) {
      updateData.role_cirkinni = payload.role_cirkinni;
    }

    // Aktualizace citlivých polí pouze pokud se změnily
    if (body.ico && body.ico !== oldData.ico_encrypted) {
      updateData.ico_encrypted = encrypted.ico_encrypted;
    }
    if (body.obcan_prukaz && body.obcan_prukaz !== oldData.obcan_prukaz_encrypted) {
      updateData.obcan_prukaz_encrypted = encrypted.obcan_prukaz_encrypted;
    }
    if (body.adresa_trvaly_bydlist && body.adresa_trvaly_bydlist !== oldData.adresa_trvaly_bydlist_encrypted) {
      updateData.adresa_trvaly_bydlist_encrypted = encrypted.adresa_trvaly_bydlist_encrypted;
    }
    if (body.email && body.email !== oldData.email_encrypted) {
      updateData.email_encrypted = encrypted.email_encrypted;
    }
    if (body.telefon && body.telefon !== oldData.telefon_encrypted) {
      updateData.telefon_encrypted = encrypted.telefon_encrypted;
    }

    if (Object.keys(updateData).length === 0) {
      log.info('Žádné změny k aktualizaci', { osobaId });
      return NextResponse.json(
        { success: true, message: 'Žádné změny k aktualizaci' },
        { status: 200 }
      );
    }

    const { data, error } = await supabase
      .from('osoby')
      .update(updateData)
      .eq('id', osobaId)
      .select()
      .single();

    if (error) {
      log.error('Aktualizace osoby selhala', { 
        osobaId,
        error: error.message 
      });
      
      if (error.code === '23505') {
        return NextResponse.json(
          { error: 'Konflikt dat - osoba s tímto údajem již existuje' },
          { status: 409 }
        );
      }

      return NextResponse.json(
        { error: 'Chyba při aktualizaci osoby v databázi' },
        { status: 500 }
      );
    }

    if (!data) {
      return NextResponse.json(
        { error: 'Nebyla vrácena odpověď z DB po update' },
        { status: 500 }
      );
    }

    // Audit log - delta změny
    const authHeader = request.headers.get('authorization') || '';
    const userId = authHeader.replace('Bearer ', '').split(' ')[0] || 'system';

    try {
      await supabase.from('audit_log').insert({
        user_id: userId,
        action: 'UPDATE',
        table_name: 'osoby',
        record_id: osobaId,
        data_before: JSON.stringify(oldData),
        data_after: JSON.stringify(data),
      });
      
      log.info('Osoba aktualizována', { 
        osobaId, 
        zmeny: Object.keys(updateData).length 
      });
    } catch (auditErr) {
      log.error('Chyba audit logu při update', { error: auditErr instanceof Error ? auditErr.message : 'Neznámá' });
    }

    return NextResponse.json(
      { success: true, osoba: data, message: 'Osoba byla úspěšně aktualizována' },
      { status: 200 }
    );

  } catch (error) {
    log.error('Nečekaná chyba v updateOsobaService', { 
      error: error instanceof Error ? error.message : 'Neznámá' 
    });
    
    return NextResponse.json(
      { error: 'Interní chyba serveru' },
      { status: 500 }
    );
  }
}
