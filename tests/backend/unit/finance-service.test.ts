// @jest-environment node
// FARNÍ AGENDA - UNIT TESTY PRO FINANCE SERVICE (příjmy/výdaje)
// Mockuje Supabase createClient + env_config; testujeme mapFinanceInput (čisté)
// i saveFinanceService (POST handler end-to-end).

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

// env_config — konfigurace Supabase
const config = {
  NEXT_PUBLIC_SUPABASE_URL: 'https://test.supabase.co',
  SUPABASE_SERVICE_ROLE_KEY: 'service-role-key',
};
jest.mock('@/lib/config/env_config', () => ({
  getConfig: jest.fn(() => config),
}));

// Supabase — chainable mock (insert → select → single; audit_log insert je awaitable)
let insertResult: { data: any; error: any } = { data: { id: 'fin-1' }, error: null };
const mockFrom = jest.fn((table: string) => {
  const chain: Record<string, any> = {};
  chain.insert = jest.fn(() => {
    const c2: Record<string, any> = {};
    c2.select = () => ({ single: async () => insertResult });
    // audit_log: .insert() je přímo await → thenable
    c2.then = (res: any, rej: any) => Promise.resolve({ data: null, error: null }).then(res, rej);
    return c2;
  });
  return chain;
});
jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn(() => ({ from: (...a: any[]) => mockFrom(...a) })),
}));

import { mapFinanceInput, saveFinanceService } from '@/lib/services/finance-service';

function makeRequest(body: Record<string, unknown>): any {
  return { json: async () => body, headers: { get: () => null } };
}

const VALID_BODY = {
  typ: 'příjem',
  kategorie: 'dar',
  castka: '1500',
  datum_příjmu: '2026-09-01',
  protiplatel: 'Jan Novák',
  popisek: 'Dar na opravy',
};

describe('mapFinanceInput — validace + mapování (čisté funkce)', () => {
  it('validní vstup → správné DB sloupce, castka string→number', () => {
    const r = mapFinanceInput(VALID_BODY);
    expect(r.valid).toBe(true);
    expect(r.data!.castka).toBe(1500); // number, ne string
    expect(r.data!.typ).toBe('příjem');
    expect(r.data!.kategorie).toBe('dar');
    expect(r.data!['datum_příjmu']).toBe('2026-09-01');
  });

  it('typo ve formuláři "protoplatitel" → DB sloupec "protiplatitel"', () => {
    // Bez správného pole protiplatel — jen typo varianta z formuláře
    const r = mapFinanceInput({ ...VALID_BODY, protiplatel: undefined, protoplatitel: 'Petr Svoboda' });
    expect(r.valid).toBe(true);
    expect(r.data!.protiplatitel).toBe('Petr Svoboda');
  });

  it('správné pole "protiplatel" má přednost před typo variantou', () => {
    const r = mapFinanceInput({ ...VALID_BODY, protoplatitel: 'Typo Jméno' });
    expect(r.valid).toBe(true);
    expect(r.data!.protiplatitel).toBe('Jan Novák'); // správné pole vyhrává
  });

  it('400 — chybějící typ', () => {
    const r = mapFinanceInput({ ...VALID_BODY, typ: undefined });
    expect(r.valid).toBe(false);
    expect(r.error).toMatch(/typ/i);
  });

  it('400 — neplatný typ (ani příjem ani výdaj)', () => {
    const r = mapFinanceInput({ ...VALID_BODY, typ: 'provoz' });
    expect(r.valid).toBe(false);
  });

  it('400 — chybějící kategorie', () => {
    const r = mapFinanceInput({ ...VALID_BODY, kategorie: '' });
    expect(r.valid).toBe(false);
    expect(r.error).toMatch(/kategor/i);
  });

  it('400 — částka 0 / záporná / ne-číslo', () => {
    expect(mapFinanceInput({ ...VALID_BODY, castka: '0' }).valid).toBe(false);
    expect(mapFinanceInput({ ...VALID_BODY, castka: '-5' }).valid).toBe(false);
    expect(mapFinanceInput({ ...VALID_BODY, castka: 'abc' }).valid).toBe(false);
  });

  it('400 — chybějící datum_příjmu', () => {
    const r = mapFinanceInput({ ...VALID_BODY, datum_příjmu: '' });
    expect(r.valid).toBe(false);
    expect(r.error).toMatch(/datum/i);
  });

  it('castka s desetinnou čárkou → number (1500,50 → 1500.5)', () => {
    const r = mapFinanceInput({ ...VALID_BODY, castka: '1500,50' });
    expect(r.valid).toBe(true);
    expect(r.data!.castka).toBe(1500.5);
  });

  it('volitelná pole (popisek) chybí → null', () => {
    const r = mapFinanceInput({ ...VALID_BODY, popisek: '' });
    expect(r.valid).toBe(true);
    expect(r.data!.popisek).toBeNull();
  });
});

describe('saveFinanceService POST — end-to-end', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    insertResult = { data: { id: 'fin-1' }, error: null };
  });

  it('201 — úspěšné vytvoření, insert do tabulky finance + audit log', async () => {
    const res = await saveFinanceService(makeRequest(VALID_BODY));
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.success).toBe(true);

    // Insert šel do správné tabulky s namapovanými sloupci
    expect(mockFrom).toHaveBeenCalledWith('finance');
    // Audit log napsán
    expect(mockFrom).toHaveBeenCalledWith('audit_log');
  });

  it('400 — validace selže → insert se nedeje', async () => {
    const res = await saveFinanceService(makeRequest({ ...VALID_BODY, typ: 'x' }));
    expect(res.status).toBe(400);
    // finance tabulka nebyla dotčena (jen audit by mohl být — ale validace je před insertem)
    const calls = mockFrom.mock.calls.map((c) => c[0]);
    expect(calls).not.toContain('finance');
  });

  it('409 — unique violation (duplicitní záznam)', async () => {
    insertResult = { data: null, error: { message: 'duplicate key', code: '23505' } };
    const res = await saveFinanceService(makeRequest(VALID_BODY));
    expect(res.status).toBe(409);
  });

  it('400 — check violation (neplatná hodnota)', async () => {
    insertResult = { data: null, error: { message: 'check failed', code: '23514' } };
    const res = await saveFinanceService(makeRequest(VALID_BODY));
    expect(res.status).toBe(400);
  });

  it('500 — obecná DB chyba', async () => {
    insertResult = { data: null, error: { message: 'relation not found' } };
    const res = await saveFinanceService(makeRequest(VALID_BODY));
    expect(res.status).toBe(500);
  });

  it('500 — výjimka při čtení body', async () => {
    const req = { json: async () => { throw new Error('bad json'); }, headers: { get: () => null } };
    const res = await saveFinanceService(req);
    expect(res.status).toBe(500);
  });
});
