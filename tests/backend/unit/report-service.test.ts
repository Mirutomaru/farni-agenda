// @jest-environment node
// FARNÍ AGENDA - UNIT TESTY PRO REPORT SERVICE (měsíční statistiky)
// Mockuje Supabase createClient (rpc + from) a env_config; POST handler end-to-end.

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

// env_config — validní konfigurace; email provider chybí → sendEmail loguje a nefačí
const config = {
  NEXT_PUBLIC_SUPABASE_URL: 'https://test.supabase.co',
  SUPABASE_SERVICE_ROLE_KEY: 'service-role-key',
};
jest.mock('@/lib/config/env_config', () => ({
  getConfig: jest.fn(() => config),
  getSupabaseConfig: jest.fn(() => config),
  getEmailConfig: jest.fn(() => { throw new Error('No email provider configured'); }),
}));

// Supabase client — mockujeme createClient (rpc + from chain)
const mockRpc = jest.fn();
let adminResult = { data: [{ email: 'admin@farnost.cz' }], error: null };
jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn(() => ({
    rpc: (...args: unknown[]) => mockRpc(...args),
    from: (table: string) => {
      const chain: Record<string, any> = {};
      chain.select = jest.fn(() => chain);
      chain.in = jest.fn(async () => adminResult);
      return chain;
    },
  })),
}));

import { POST } from '@/lib/services/report-service';

function makeRequest(body: Record<string, unknown>): any {
  return { json: async () => body };
}

describe('report-service POST — validace vstupů', () => {
  beforeEach(() => { jest.clearAllMocks(); });

  it('400 — chybějící rok a měsíc', async () => {
    const res = await POST(makeRequest({}));
    expect(res.status).toBe(400);
  });

  it('400 — neplatný rok (pod 2000)', async () => {
    const res = await POST(makeRequest({ rok: 1999, mesic: 5 }));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toMatch(/rok/i);
  });

  it('400 — neplatný měsíc (13)', async () => {
    const res = await POST(makeRequest({ rok: 2026, mesic: 13 }));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toMatch(/měsíc/i);
  });

  it('400 — rok jako string (ne number)', async () => {
    const res = await POST(makeRequest({ rok: '2026', mesic: 5 }));
    expect(res.status).toBe(400);
  });
});

describe('report-service POST — generování reportu', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    adminResult = { data: [{ email: 'admin@farnost.cz' }], error: null };
  });

  it('200 — úspěšné vygenerování se součty (totals)', async () => {
    mockRpc.mockResolvedValue({
      data: [
        { farnost_nazev: 'Farnost A', celkem_clenu: 100, aktivni_clenu: 80, kresty: 5, birovani: 2, svatby: 3, pohreby: 1 },
        { farnost_nazev: 'Farnost B', celkem_clenu: 60, aktivni_clenu: 40, kresty: 2, birovani: 1, svatby: 0, pohreby: 2 },
      ],
      error: null,
    });

    const res = await POST(makeRequest({ rok: 2026, mesic: 5 }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.count).toBe(2);
    // Součty se sčítají napříč farnostmi
    expect(json.totals).toEqual({
      celkemClenu: 160, kresty: 7, birovani: 3, svatby: 3, pohreby: 3,
    });
  });

  it('200 — prázdné statistiky (žádné farnosti) → count=0', async () => {
    mockRpc.mockResolvedValue({ data: [], error: null });

    const res = await POST(makeRequest({ rok: 2026, mesic: 5 }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.count).toBe(0);
    expect(json.totals.celkemClenu).toBe(0);
  });

  it('500 — RPC chyba (DB nedostupná)', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'relation not found' } });

    const res = await POST(makeRequest({ rok: 2026, mesic: 5 }));
    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.error).toBeTruthy();
  });

  it('volá RPC get_monthly_statistics s předaným rokem a měsícem', async () => {
    mockRpc.mockResolvedValue({ data: [], error: null });

    await POST(makeRequest({ rok: 2030, mesic: 12 }));
    expect(mockRpc).toHaveBeenCalledWith('get_monthly_statistics', { rok: 2030, mesic: 12 });
  });

  it('chyba emailu nefačí celý report (sendEmail je best-effort)', async () => {
    // admin existuje → sendEmail se volá; getEmailConfig hází → chyta se a loguje
    mockRpc.mockResolvedValue({ data: [], error: null });

    const res = await POST(makeRequest({ rok: 2026, mesic: 5 }));
    expect(res.status).toBe(200); // report prošel i přes email chybu
    expect(mockLogger.error).toHaveBeenCalled(); // email chyba se loguje
  });
});
