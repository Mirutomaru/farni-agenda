// @jest-environment node
// FARNÍ AGENDA - TESTY EXPORT SERVICE (P2)
// Čisté funkce escapeCsvValue/toCsv/buildPdf + API handlery s mockovaným Supabase klientem.

const mockLogger = { info: jest.fn(), warn: jest.fn(), error: jest.fn() };
jest.mock('@/lib/logging/logger', () => ({
  loggerFromRequest: jest.fn(() => mockLogger),
}));

// next/server — minimální stub (Jest sandbox nemá NextResponse)
jest.mock('next/server', () => {
  class MockNextResponse {
    status: number;
    body: unknown;
    private _headers: Map<string, string>;

    constructor(body?: unknown, init?: { status?: number; headers?: Record<string, string> }) {
      this.body = body;
      this.status = init?.status ?? 200;
      this._headers = new Map(Object.entries(init?.headers ?? {}));
    }

    get headers() {
      return this._headers;
    }

    async arrayBuffer(): Promise<ArrayBuffer> {
      if (this.body instanceof ArrayBuffer) return this.body;
      const bytes = Buffer.from(String(this.body ?? ''), 'utf-8');
      // Kopie do čistého ArrayBufferu (Node Buffer může být slice sdíleného poolu)
      return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
    }

    static json(body: unknown, init?: { status?: number }): MockNextResponse {
      const res = new MockNextResponse(JSON.stringify(body), { status: init?.status ?? 200 });
      res._headers.set('Content-Type', 'application/json');
      return res;
    }
  }
  return { NextResponse: MockNextResponse };
});

jest.mock('@/lib/supabase/server', () => ({ createClient: jest.fn() }));
jest.mock('@/lib/auth/require-user', () => ({ requireUser: jest.fn() }));

import { escapeCsvValue, toCsv, buildPdf, handleCsvExport, handlePdfExport } from '@/lib/services/export-service';
import { createClient } from '@/lib/supabase/server';
import { requireUser } from '@/lib/auth/require-user';

const mockCreateClient = createClient as jest.MockedFunction<typeof createClient>;
const mockRequireUser = requireUser as jest.MockedFunction<typeof requireUser>;

/** Supabase mock — vrací řádky podle tabulky; order() i in() jsou thenable. */
function makeSupabaseMock(rowsByTable: Record<string, any[]>) {
  return {
    from: jest.fn((table: string) => ({
      select: jest.fn(() => {
        const rows = rowsByTable[table] ?? [];
        const result = () => Promise.resolve({ data: rows, error: null });
        return {
          order: jest.fn(result),
          in: jest.fn(result),
        };
      }),
    })),
  };
}

function makeRequest(url: string): any {
  return { url };
}

describe('Export Service (P2)', () => {
  beforeEach(() => {
    mockRequireUser.mockResolvedValue({ ok: true, user: { id: 'u1' } });
  });

  describe('escapeCsvValue', () => {
    test('Prázdné hodnoty → prázdný string', () => {
      expect(escapeCsvValue(null)).toBe('');
      expect(escapeCsvValue(undefined)).toBe('');
    });

    test('Běžná hodnota bez úprav', () => {
      expect(escapeCsvValue('Novák')).toBe('Novák');
      expect(escapeCsvValue(42)).toBe('42');
    });

    test('Hodnota s čárkou → uvozovky (RFC 4180)', () => {
      expect(escapeCsvValue('Praha, centrum')).toBe('"Praha, centrum"');
    });

    test('Hodnota s uvozovkami → zdvojnásobení', () => {
      expect(escapeCsvValue('Řekl "ahoj"')).toBe('"Řekl ""ahoj"""');
    });

    test('Hodnota s novým řádkem → uvozovky', () => {
      expect(escapeCsvValue('řádek1\nřádek2')).toBe('"řádek1\nřádek2"');
    });
  });

  describe('toCsv', () => {
    test('Vrací BOM + hlavičku + řádky s CRLF', () => {
      const csv = toCsv(['Jméno', 'Příjmení'], [['Jan', 'Novák'], ['Marie', 'Svobodová']]);
      expect(csv.startsWith('\uFEFF')).toBe(true);
      expect(csv).toBe('\uFEFFJméno,Příjmení\r\nJan,Novák\r\nMarie,Svobodová');
    });

    test('Prázdné řádky → jen hlavička', () => {
      const csv = toCsv(['A'], []);
      expect(csv).toBe('\uFEFFA');
    });

    test('Null hodnoty v řádcích → prázdné buňky', () => {
      const csv = toCsv(['A', 'B'], [['x', null]]);
      expect(csv).toBe('\uFEFFA,B\r\nx,');
    });
  });

  describe('buildPdf', () => {
    test('Vygeneruje PDF s ArrayBuffer obsahem (DejaVu font)', async () => {
      const buffer = await buildPdf(
        'Seznam osob',
        ['Jméno', 'Příjmení'],
        [['Jan', 'Novák'], ['Marie', 'Svobodová']],
      );

      expect(buffer).toBeInstanceOf(ArrayBuffer);
      // PDF header %PDF- (prvních 5 bajtů)
      const bytes = new Uint8Array(buffer);
      const header = String.fromCharCode(...bytes.slice(0, 5));
      expect(header).toBe('%PDF-');
    });

    test('Zvládne prázdné tabulky', async () => {
      const buffer = await buildPdf('Prázdný export', ['A'], []);
      expect(buffer.byteLength).toBeGreaterThan(100);
    });
  });

  describe('handleCsvExport', () => {
    test('Vrací CSV s Content-Disposition pro typ osoby', async () => {
      mockCreateClient.mockReturnValue(makeSupabaseMock({
        osoby: [
          { id: '1', krestni_jmeno: 'Jan', prijmeni: 'Novák', datum_narozeni: '1974-05-14', clenstvi_status: 'aktivni', verejny_email: null, verejna_telefon: null, role_cirkinni: [] },
        ],
      }) as any);

      const res = await handleCsvExport(makeRequest('http://localhost/api/export-csv?typ=osoby'));
      expect(res.status).toBe(200);
      expect(res.headers.get('Content-Type')).toContain('text/csv');
      expect(res.headers.get('Content-Disposition')).toContain('osoby-');

      const body = await res.arrayBuffer();
      const text = Buffer.from(body).toString('utf-8');
      expect(text).toContain('Jméno,Příjmení');
      expect(text).toContain('Jan,Novák');
    });

    test('Neplatný typ → 400', async () => {
      mockCreateClient.mockReturnValue(makeSupabaseMock({}) as any);
      const res = await handleCsvExport(makeRequest('http://localhost/api/export-csv?typ=xyz'));
      expect(res.status).toBe(400);
    });

    test('Bez auth → 401', async () => {
      mockRequireUser.mockResolvedValueOnce({ ok: false, response: { status: 401 } as any });
      const res = await handleCsvExport(makeRequest('http://localhost/api/export-csv?typ=osoby'));
      expect(res.status).toBe(401);
    });

    test('Finance export formátuje částky na 2 desetinná místa', async () => {
      mockCreateClient.mockReturnValue(makeSupabaseMock({
        finance: [
          { 'datum_příjmu': '2026-10-01', typ: 'příjem', kategorie: 'Dary', castka: 150, měna: 'CZK', popisek: null, protiplatitel: null, variabilni_symbol: null },
        ],
      }) as any);

      const res = await handleCsvExport(makeRequest('http://localhost/api/export-csv?typ=finance'));
      expect(res.status).toBe(200);
      const body = Buffer.from(await res.arrayBuffer()).toString("utf-8");
      expect(body).toContain('150.00');
    });

    test('Křestní zápisy exportuje jména osob', async () => {
      mockCreateClient.mockReturnValue(makeSupabaseMock({
        krestni_zapis: [
          { datum_krstu: '2026-01-05', misto_krstu: 'Kostel Nanebevstoupení', pokrteny_id: 'p1', otec_id: 'o1', matka_id: null, kmotr_id: null, kmotra_id: null },
        ],
        osoby: [
          { id: 'p1', krestni_jmeno: 'Tomáš', prijmeni: 'Dvořák' },
          { id: 'o1', krestni_jmeno: 'Petr', prijmeni: 'Dvořák' },
        ],
      }) as any);

      const res = await handleCsvExport(makeRequest('http://localhost/api/export-csv?typ=krestni-zapisky'));
      expect(res.status).toBe(200);
      const body = Buffer.from(await res.arrayBuffer()).toString("utf-8");
      expect(body).toContain('Tomáš Dvořák');
      expect(body).toContain('Petr Dvořák');
    });
  });

  describe('handlePdfExport', () => {
    test('Vrací PDF s Content-Disposition pro typ osoby', async () => {
      mockCreateClient.mockReturnValue(makeSupabaseMock({
        osoby: [
          { id: '1', krestni_jmeno: 'Jan', prijmeni: 'Novák', datum_narozeni: '1974-05-14', clenstvi_status: 'aktivni', verejny_email: null, verejna_telefon: null, role_cirkinni: [] },
        ],
      }) as any);

      const res = await handlePdfExport(makeRequest('http://localhost/api/export-pdf?typ=osoby'));
      expect(res.status).toBe(200);
      expect(res.headers.get('Content-Type')).toContain('application/pdf');
      expect(res.headers.get('Content-Disposition')).toContain('.pdf');

      const buf = new Uint8Array(await res.arrayBuffer());
      expect(String.fromCharCode(...buf.slice(0, 5))).toBe('%PDF-');
    });

    test('Neplatný typ → 400', async () => {
      mockCreateClient.mockReturnValue(makeSupabaseMock({}) as any);
      const res = await handlePdfExport(makeRequest('http://localhost/api/export-pdf?typ=xyz'));
      expect(res.status).toBe(400);
    });
  });
});
