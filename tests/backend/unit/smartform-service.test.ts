// @jest-environment node
// FARNÍ AGENDA - UNIT TESTY PRO SMARTFORM SERVICE (adresní našeptávač)
// Mockuje fetchWithRetry + env_config; GET handler end-to-end.
// Jest sandbox nemá globální Request → request = fake objekt s nextUrl.searchParams.

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

// env_config — kontrolovatelný API key
const envStore: Record<string, string | undefined> = {};
jest.mock('@/lib/config/env_config', () => ({
  getEnv: (key: string) => envStore[key],
  hasEnv: (key: string) => !!envStore[key],
}));

// fetchWithRetry — mockujeme HTTP volání na Smartform API
const mockFetch = jest.fn();
jest.mock('@/lib/utils/retry', () => ({
  fetchWithRetry: (...args: unknown[]) => mockFetch(...args),
}));

import { GET } from '@/lib/services/smartform-service';

function makeRequest(query?: string, limit?: string): any {
  const params = new URLSearchParams();
  if (query) params.set('query', query);
  if (limit) params.set('limit', limit);
  return { nextUrl: { searchParams: params } };
}

describe('smartform-service GET — validace vstupů', () => {
  beforeEach(() => { jest.clearAllMocks(); });

  it('400 — chybějící query parametr', async () => {
    const res = await GET(makeRequest());
    expect(res.status).toBe(400);
  });

  it('400 — query kratší než 2 znaky', async () => {
    const res = await GET(makeRequest('a'));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toMatch(/alespoň 2/i);
  });

  it('limit se omezuje na rozsah 1-10 (clamp)', async () => {
    envStore.SMARTFORM_API_KEY = 'key';
    mockFetch.mockResolvedValue({ ok: true, json: async () => ({ success: true, data: [] }) });

    // limit=99 → clamp na 10
    await GET(makeRequest('Praha', '99'));
    expect(mockFetch.mock.calls[0][0].url).toMatch(/limit=10/);

    // limit=0 → clamp na 1
    mockFetch.mockClear();
    await GET(makeRequest('Praha', '0'));
    expect(mockFetch.mock.calls[0][0].url).toMatch(/limit=1/);
  });
});

describe('smartform-service GET — API volání', () => {
  beforeEach(() => { jest.clearAllMocks(); });

  it('503 — chybějící SMARTFORM_API_KEY', async () => {
    delete envStore.SMARTFORM_API_KEY;
    const res = await GET(makeRequest('Praha'));
    expect(res.status).toBe(503);
    const json = await res.json();
    expect(json.error).toMatch(/Smartform/i);
  });

  it('200 — úspěšné vyhledání + normalizace výsledků', async () => {
    envStore.SMARTFORM_API_KEY = 'key';
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        success: true,
        data: [
          { ulice: 'Hlavní', cislo_popisne: '1', obec: 'Praha', psc: '12000' },
          { ulice: 'Vodičkova', cislo_popisne: '5', cislo_orientacni: 'a', obec: 'Praha', psc: '12000', okres: 'Praha', kraj: 'Hl. m. Praha' },
        ],
      }),
    });

    const res = await GET(makeRequest('Praha'));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.data).toHaveLength(2);
    // Normalizace: chybějící pole → undefined, prázdné stringy → ''
    expect(json.data[0]).toEqual({
      ulice: 'Hlavní', cislo_popisne: '1', cislo_orientacni: undefined,
      obec: 'Praha', psc: '12000', okres: undefined, kraj: undefined,
    });
  });

  it('propaguje HTTP status chyby z API (4xx/5xx)', async () => {
    envStore.SMARTFORM_API_KEY = 'key';
    mockFetch.mockResolvedValue({ ok: false, status: 429, text: async () => 'rate limited' });

    const res = await GET(makeRequest('Praha'));
    expect(res.status).toBe(429);
  });

  it('neočekávaný formát odpovědi (success=false) → prázdné data', async () => {
    envStore.SMARTFORM_API_KEY = 'key';
    mockFetch.mockResolvedValue({ ok: true, json: async () => ({ success: false }) });

    const res = await GET(makeRequest('Praha'));
    expect(res.status).toBe(200); // service vrací 200 s prázdným data
    const json = await res.json();
    expect(json.success).toBe(false);
    expect(json.data).toEqual([]);
  });

  it('500 — výjimka při fetch (sítě)', async () => {
    envStore.SMARTFORM_API_KEY = 'key';
    mockFetch.mockRejectedValue(new Error('network down'));

    const res = await GET(makeRequest('Praha'));
    expect(res.status).toBe(500);
  });
});
