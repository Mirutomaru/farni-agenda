// @jest-environment node
// FARNÍ AGENDA - UNIT TESTY PRO CERTIFICATE SERVICE (křestní/birovací certifikáty)
// Mockuje Supabase createClient + fetchWithRetry; POST handler end-to-end.
// Jest sandbox nemá globální Request → next/server je mocknuto, request = fake objekt.

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

// env_config — konfigurace s Firebase URL pro certifikáty
const config = {
  NEXT_PUBLIC_SUPABASE_URL: 'https://test.supabase.co',
  SUPABASE_SERVICE_ROLE_KEY: 'service-role-key',
  FIREBASE_CERTIFICATE_FUNCTION_URL: 'https://us-central1-fa.cloudfunctions.net/gen-cert',
  FIREBASE_FUNCTION_KEY: 'fb-key',
};
jest.mock('@/lib/config/env_config', () => ({
  getConfig: jest.fn(() => config),
}));

// Supabase — chainable mock (select + maybeSingle)
let dbResult: { data: any; error: any } = { data: { id: 'rec-1' }, error: null };
const mockFrom = jest.fn((table: string) => {
  const chain: Record<string, any> = {};
  chain.select = jest.fn(() => chain);
  chain.eq = jest.fn(() => chain);
  chain.maybeSingle = jest.fn(async () => dbResult);
  return chain;
});
jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn(() => ({ from: (...a) => mockFrom(...a) })),
}));

// fetchWithRetry — mock HTTP volání na Firebase Cloud Function
const mockFetch = jest.fn();
jest.mock('@/lib/utils/retry', () => ({
  fetchWithRetry: (opts: any) => mockFetch(opts),
}));

import { POST } from '@/lib/services/certificate-service';

function makeRequest(body: Record<string, unknown>): any {
  return { json: async () => body };
}

describe('certificate-service POST — validace vstupů', () => {
  beforeEach(() => { jest.clearAllMocks(); });

  it('400 — chybějící personId', async () => {
    const res = await POST(makeRequest({ type: 'krest' }));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toMatch(/personId/i);
  });

  it('400 — personId jako number (ne string)', async () => {
    const res = await POST(makeRequest({ personId: 123, type: 'krest' }));
    expect(res.status).toBe(400);
  });

  it('400 — neplatný typ certifikátu', async () => {
    const res = await POST(makeRequest({ personId: 'p-1', type: 'svatba' }));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toMatch(/typ/i);
  });
});

describe('certificate-service POST — generování certifikátu', () => {
  const savedFunctionUrl = config.FIREBASE_CERTIFICATE_FUNCTION_URL;

  beforeEach(() => {
    jest.clearAllMocks();
    dbResult = { data: { id: 'rec-1' }, error: null };
    // Každý test začíná s kompletní konfigurací (503 test URL maže)
    config.FIREBASE_CERTIFICATE_FUNCTION_URL = savedFunctionUrl;
  });

  it('404 — záznam o křtu nenalezen v DB', async () => {
    dbResult = { data: null, error: null };
    const res = await POST(makeRequest({ personId: 'missing', type: 'krest' }));
    expect(res.status).toBe(404);
    const json = await res.json();
    expect(json.error).toMatch(/nebyl nalezen/i);
  });

  it('503 — chybějící FIREBASE_CERTIFICATE_FUNCTION_URL', async () => {
    delete config.FIREBASE_CERTIFICATE_FUNCTION_URL;
    const res = await POST(makeRequest({ personId: 'p-1', type: 'krest' }));
    expect(res.status).toBe(503);
  });

  it('200 — úspěšné vygenerování křestního certifikátu (deleguje na Firebase)', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, pdfBase64: 'JVBERi0=', filename: 'krest.pdf' }),
    });

    const res = await POST(makeRequest({ personId: 'p-1', type: 'krest' }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.pdfBase64).toBe('JVBERi0=');

    // Volání šlo na správnou tabulku (krestni_zapis) a s Bearer auth
    expect(mockFrom).toHaveBeenCalledWith('krestni_zapis');
    const fetchOpts = mockFetch.mock.calls[0][0];
    expect(fetchOpts.url).toBe(config.FIREBASE_CERTIFICATE_FUNCTION_URL);
    expect(fetchOpts.init.headers.Authorization).toBe('Bearer fb-key');
  });

  it('200 — birovací certifikát čte tabulku birovani_zapis', async () => {
    mockFetch.mockResolvedValue({ ok: true, json: async () => ({ success: true }) });

    await POST(makeRequest({ personId: 'p-2', type: 'birovan' }));
    expect(mockFrom).toHaveBeenCalledWith('birovani_zapis');
  });

  it('propaguje HTTP status chyby z Firebase (500)', async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 500, text: async () => 'fn error' });

    const res = await POST(makeRequest({ personId: 'p-1', type: 'krest' }));
    expect(res.status).toBe(500);
  });

  it('500 — výjimka při fetch (sítě)', async () => {
    mockFetch.mockRejectedValue(new Error('network down'));

    const res = await POST(makeRequest({ personId: 'p-1', type: 'krest' }));
    expect(res.status).toBe(500);
  });

  it('500 — DB chyba při načítání záznamu', async () => {
    dbResult = { data: null, error: { message: 'relation not found' } };
    const res = await POST(makeRequest({ personId: 'p-1', type: 'krest' }));
    expect(res.status).toBe(500);
  });
});
