// @jest-environment node
// FARNÍ AGENDA - UNIT TESTY PRO MAJETEK SERVICE (záznamy o majetku)
// Mockuje Supabase createClient; testujeme mapMajetekInput/normalizeKategorie/toDecimal
// (čisté funkce) i saveMajetekService (POST handler end-to-end).

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

// Supabase — chainable mock (insert → select → single; audit_log insert je awaitable)
let insertResult: { data: any; error: any } = { data: { id: 'maj-1' }, error: null };
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
jest.mock('@/lib/supabase/server', () => ({
  createClient: jest.fn(() => ({ from: (...a: any[]) => mockFrom(...a) })),
}));

import { mapMajetekInput, normalizeKategorie, toDecimal, saveMajetekService } from '@/lib/services/majetek-service';

function makeRequest(body: Record<string, unknown>): any {
  return { json: async () => body, headers: { get: () => null } };
}

const VALID_BODY = {
  nazev: 'Kancelářský stůl',
  inventarni_cislo: 'INV-001',
  kategorie: 'movitost',
  umisteni: 'Farářství, suterén',
  popis: 'Dřevěný stůl',
  počáteční_hodnota: '25000',
  aktuální_hodnota: '18000',
};

describe('normalizeKategorie — mapování kategorie (čisté funkce)', () => {
  it('DB hodnoty projdou beze změny', () => {
    expect(normalizeKategorie('nemovitost')).toBe('nemovitost');
    expect(normalizeKategorie('movitost')).toBe('movitost');
    expect(normalizeKategorie('finance')).toBe('finance');
  });

  it('formulářová "duchovni_pomucky" → DB "duchovní_pomůcky"', () => {
    expect(normalizeKategorie('duchovni_pomucky')).toBe('duchovní_pomůcky');
    // Velká písmena + whitespace se normalizují
    expect(normalizeKategorie('  Duchovni_Pomucky ')).toBe('duchovní_pomůcky');
  });

  it('neplatná kategorie → null', () => {
    expect(normalizeKategorie('budova')).toBeNull(); // formulářová varianta, DB ji nezná
    expect(normalizeKategorie('')).toBeNull();
    expect(normalizeKategorie(42)).toBeNull();
  });
});

describe('toDecimal — parse číselných polí (čisté funkce)', () => {
  it('string s číslem → number', () => {
    expect(toDecimal('18000')).toBe(18000);
    expect(toDecimal('25000,50')).toBe(25000.5); // česká desetinná čárka
  });

  it('prázdné/ne-číslo → null', () => {
    expect(toDecimal('')).toBeNull();
    expect(toDecimal(undefined)).toBeNull();
    expect(toDecimal(null)).toBeNull();
    expect(toDecimal('abc')).toBeNull();
  });
});

describe('mapMajetekInput — validace + mapování na DB sloupce', () => {
  it('validní vstup → správné DB sloupce s diakritikou', () => {
    const r = mapMajetekInput(VALID_BODY);
    expect(r.valid).toBe(true);
    // Diakritické DB sloupce (formulář posílá bez diakritiky)
    expect(r.data!['inventární_cislo']).toBe('INV-001');
    expect(r.data!['umistění']).toBe('Farářství, suterén');
    // Jiná diakritika: formulář počáteční → DB počiáteční
    expect(r.data!['počiáteční_hodnota']).toBe(25000);
    expect(r.data!['aktuální_hodnota']).toBe(18000);
    expect(r.data!.nazev).toBe('Kancelářský stůl');
    expect(r.data!.kategorie).toBe('movitost');
  });

  it('400 — chybějící název', () => {
    const r = mapMajetekInput({ ...VALID_BODY, nazev: '' });
    expect(r.valid).toBe(false);
    expect(r.error).toMatch(/název/i);
  });

  it('400 — neplatná kategorie', () => {
    const r = mapMajetekInput({ ...VALID_BODY, kategorie: 'budova' });
    expect(r.valid).toBe(false);
    expect(r.error).toMatch(/kategor/i);
  });

  it('volitelná pole chybí → null (ne undefined)', () => {
    const r = mapMajetekInput({ nazev: 'X', kategorie: 'movitost' });
    expect(r.valid).toBe(true);
    expect(r.data!['inventární_cislo']).toBeNull();
    expect(r.data!['počiáteční_hodnota']).toBeNull();
  });

  it('farnost_id se propíše, pokud je v body', () => {
    const r = mapMajetekInput({ ...VALID_BODY, farnost_id: 'far-1' });
    expect(r.data!.farnost_id).toBe('far-1');
  });
});

describe('saveMajetekService POST — end-to-end', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    insertResult = { data: { id: 'maj-1' }, error: null };
  });

  it('201 — úspěšné vytvoření, insert do tabulky majetek + audit log', async () => {
    const res = await saveMajetekService(makeRequest(VALID_BODY));
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.success).toBe(true);

    expect(mockFrom).toHaveBeenCalledWith('majetek');
    expect(mockFrom).toHaveBeenCalledWith('audit_log');
  });

  it('400 — validace selže → insert do majetek se nedeje', async () => {
    const res = await saveMajetekService(makeRequest({ ...VALID_BODY, nazev: '' }));
    expect(res.status).toBe(400);
    const calls = mockFrom.mock.calls.map((c) => c[0]);
    expect(calls).not.toContain('majetek');
  });

  it('409 — unique violation (duplicitní inventární číslo)', async () => {
    insertResult = { data: null, error: { message: 'duplicate key', code: '23505' } };
    const res = await saveMajetekService(makeRequest(VALID_BODY));
    expect(res.status).toBe(409);
  });

  it('400 — check violation (neplatná kategorie v DB)', async () => {
    insertResult = { data: null, error: { message: 'check failed', code: '23514' } };
    const res = await saveMajetekService(makeRequest(VALID_BODY));
    expect(res.status).toBe(400);
  });

  it('500 — obecná DB chyba', async () => {
    insertResult = { data: null, error: { message: 'relation not found' } };
    const res = await saveMajetekService(makeRequest(VALID_BODY));
    expect(res.status).toBe(500);
  });

  it('500 — výjimka při čtení body', async () => {
    const req = { json: async () => { throw new Error('bad json'); }, headers: { get: () => null } };
    const res = await saveMajetekService(req);
    expect(res.status).toBe(500);
  });
});
