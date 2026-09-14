// @jest-environment node
// FARNÍ AGENDA - UNIT TESTY PRO OSOBA SERVICE (CRUD osob + server-side šifrování)
// Mockuje Supabase createClient, encryption a env_config; testujeme validaci
// a že citlivá pole jdou do DB zašifrovaná (ne v surovém tvaru).

const mockLogger = { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() };
jest.mock('@/lib/logging/logger', () => ({
  loggerFromRequest: jest.fn(() => mockLogger),
}));

// next/server — minimální stub (Jest sandbox nemá globální Request/Response)
jest.mock('next/server', () => ({
  NextResponse: {
    json: (body: any, init?: { status?: number }) => ({
      status: init?.status ?? 200,
      json: async () => body,
    }),
  },
}));

// Encryption — deterministický mock (ověříme, že pole jdou zašifrovaná)
jest.mock('@/lib/security/encryption', () => ({
  encrypt: jest.fn((v: string) => `enc:${v}`),
  decrypt: jest.fn(),
}));

// env_config — validní konfigurace pro createDbClient
const config = {
  NEXT_PUBLIC_SUPABASE_URL: 'https://test.supabase.co',
  SUPABASE_SERVICE_ROLE_KEY: 'service-role-key',
};
jest.mock('@/lib/config/env_config', () => ({
  getConfig: jest.fn(() => config),
  EmailProviderError: class extends Error {},
}));

// Supabase client — chainable mock s konfigurovatelnými výsledky.
// Chain je zároveň awaitable (audit_log insert se čeká přímo).
let insertResult: { data: any; error: any } = { data: { id: 'new-id' }, error: null };
let selectSingleResult: { data: any; error: any } = { data: null, error: null }; // oldData při update
let updateResult: { data: any; error: any } = { data: { id: 'upd-id' }, error: null };
let lastInsertPayload: any = null;
let lastUpdatePayload: any = null;

function makeChain(table: string) {
  const state = { op: null as string | null };
  const chain: Record<string, any> = {};
  chain.insert = jest.fn((payload: unknown) => {
    if (table === 'osoby') lastInsertPayload = payload;
    state.op = 'insert';
    return chain;
  });
  chain.update = jest.fn((payload: unknown) => {
    if (table === 'osoby') lastUpdatePayload = payload;
    state.op = 'update';
    return chain;
  });
  chain.select = jest.fn(() => {
    if (!state.op) state.op = 'select';
    return chain;
  });
  chain.eq = jest.fn(() => chain);
  chain.single = jest.fn(async () => {
    if (state.op === 'insert') return insertResult;
    if (state.op === 'update') return updateResult;
    return selectSingleResult; // select → oldData
  });
  // audit_log: await supabase.from('audit_log').insert({...}) — chain je thenable
  chain.then = (resolve: any, reject: any) =>
    Promise.resolve({ data: {}, error: null }).then(resolve, reject);
  return chain;
}

const mockFrom = jest.fn((table: string) => makeChain(table));
jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn(() => ({ from: (...a: unknown[]) => mockFrom(...(a as [string])) })),
}));

import { saveOsobaService, updateOsobaService } from '@/lib/services/osoba-service';

function makeRequest(body: Record<string, unknown>): any {
  return {
    json: async () => body,
    headers: { get: (name: string) => (name.toLowerCase() === 'authorization' ? null : null) },
  };
}

const VALID_BODY = {
  krestni_jmeno: 'Jan',
  prijmeni: 'Novák',
  datum_narozeni: '1990-05-01',
};

describe('saveOsobaService — validace vstupů', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    lastInsertPayload = null;
    insertResult = { data: { id: 'new-id' }, error: null };
  });

  it('400 — chybějící křestní jméno', async () => {
    const res = await saveOsobaService(makeRequest({ ...VALID_BODY, krestni_jmeno: undefined }));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toMatch(/Křestní jméno/i);
  });

  it('400 — chybějící příjmení', async () => {
    const res = await saveOsobaService(makeRequest({ ...VALID_BODY, prijmeni: undefined }));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toMatch(/Příjmení/i);
  });

  it('400 — chybějící datum narození', async () => {
    const res = await saveOsobaService(makeRequest({ ...VALID_BODY, datum_narozeni: undefined }));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toMatch(/Datum narození/i);
  });

  it('400 — křestní jméno jako number (ne string)', async () => {
    const res = await saveOsobaService(makeRequest({ ...VALID_BODY, krestni_jmeno: 123 }));
    expect(res.status).toBe(400);
  });
});

describe('saveOsobaService — ukládání + šifrování', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    lastInsertPayload = null;
    insertResult = { data: { id: 'new-id' }, error: null };
  });

  it('201 — úspěšné vytvoření osoby', async () => {
    const res = await saveOsobaService(makeRequest(VALID_BODY));
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.osoba.id).toBe('new-id');
  });

  it('citlivá pole jdou do DB zašifrovaná (ico_encrypted), ne surově', async () => {
    await saveOsobaService(makeRequest({ ...VALID_BODY, ico: '12345678', telefon: '+420123' }));

    // insert byl volán s array [osobaData]
    const inserted = lastInsertPayload[0];
    expect(inserted.ico_encrypted).toBe('enc:12345678');
    expect(inserted.telefon_encrypted).toBe('enc:+420123');
    // Surové citlivé pole se do DB nedostane
    expect(inserted.ico).toBeUndefined();
    expect(inserted.telefon).toBeUndefined();
  });

  it('bez citlivých polí → *_encrypted = null (ne undefined)', async () => {
    await saveOsobaService(makeRequest(VALID_BODY));
    const inserted = lastInsertPayload[0];
    expect(inserted.ico_encrypted).toBeNull();
    expect(inserted.email_encrypted).toBeNull();
  });

  it('409 — duplicitní záznam (DB error code 23505)', async () => {
    insertResult = { data: null, error: { message: 'duplicate key', code: '23505' } };
    const res = await saveOsobaService(makeRequest(VALID_BODY));
    expect(res.status).toBe(409);
  });

  it('500 — obecná DB chyba (jiný error code)', async () => {
    insertResult = { data: null, error: { message: 'connection lost', code: 'XX000' } };
    const res = await saveOsobaService(makeRequest(VALID_BODY));
    expect(res.status).toBe(500);
  });

  it('pohlavi normalizace: boolean i string projdou, neznámé → null', async () => {
    // Boolean (co posílá formulář) — projde
    await saveOsobaService(makeRequest({ ...VALID_BODY, pohlavi: true }));
    let inserted = lastInsertPayload[0];
    expect(inserted.pohlavi).toBe(true);

    jest.clearAllMocks();
    lastInsertPayload = null;
    // String 'true' (P0 fix — dříve se tichounce proměnil v null)
    await saveOsobaService(makeRequest({ ...VALID_BODY, pohlavi: 'true' as unknown }));
    inserted = lastInsertPayload[0];
    expect(inserted.pohlavi).toBe(true);

    jest.clearAllMocks();
    lastInsertPayload = null;
    // String 'male' (hodnota z <select>) — normalizuje na true
    await saveOsobaService(makeRequest({ ...VALID_BODY, pohlavi: 'male' as unknown }));
    inserted = lastInsertPayload[0];
    expect(inserted.pohlavi).toBe(true);

    jest.clearAllMocks();
    lastInsertPayload = null;
    // Neznámý string → null (nezvoleno)
    await saveOsobaService(makeRequest({ ...VALID_BODY, pohlavi: 'xyz' as unknown }));
    inserted = lastInsertPayload[0];
    expect(inserted.pohlavi).toBeNull();

    jest.clearAllMocks();
    lastInsertPayload = null;
    // Chybějící → null
    await saveOsobaService(makeRequest(VALID_BODY));
    inserted = lastInsertPayload[0];
    expect(inserted.pohlavi).toBeNull();
  });
});

describe('updateOsobaService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    lastUpdatePayload = null;
    updateResult = { data: { id: 'upd-id' }, error: null };
  });

  it('400 — chybějící id osoby', async () => {
    const res = await updateOsobaService(makeRequest({ ...VALID_BODY }));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toMatch(/identifikátor/i);
  });

  it('404 — osoba k aktualizaci nenalezena', async () => {
    selectSingleResult = { data: null, error: null };
    const res = await updateOsobaService(makeRequest({ ...VALID_BODY, id: 'missing' }));
    expect(res.status).toBe(404);
  });

  it('200 — žádná změna (stejné hodnoty jako v DB)', async () => {
    selectSingleResult = {
      data: { id: 'upd-id', ...VALID_BODY, pohlavi: null, role_cirkinni: [] },
      error: null,
    };
    const res = await updateOsobaService(makeRequest({ ...VALID_BODY, id: 'upd-id' }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.message).toMatch(/Žádné změny/i);
  });

  it('200 — úspěšná aktualizace změněného pole', async () => {
    selectSingleResult = {
      data: { id: 'upd-id', krestni_jmeno: 'Staré', prijmeni: 'Novák', datum_narozeni: '1990-05-01' },
      error: null,
    };
    const res = await updateOsobaService(makeRequest({ ...VALID_BODY, id: 'upd-id' }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    // Do update šlo jen změněné pole (krestni_jmeno)
    expect(lastUpdatePayload.krestni_jmeno).toBe('Jan');
    expect(lastUpdatePayload.prijmeni).toBeUndefined(); // nezměněno → neposílá se
  });

  it('409 — konflikt při update (error code 23505)', async () => {
    // oldData se liší od requestu → dojde k update → DB vrátí konflikt
    selectSingleResult = { data: { id: 'upd-id', krestni_jmeno: 'Staré', prijmeni: 'Novák', datum_narozeni: '1990-05-01' }, error: null };
    updateResult = { data: null, error: { message: 'dup', code: '23505' } };
    const res = await updateOsobaService(makeRequest({ ...VALID_BODY, id: 'upd-id' }));
    expect(res.status).toBe(409);
  });
});
