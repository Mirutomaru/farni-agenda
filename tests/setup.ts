// FARNÍ AGENDA - SETUP PRO TESTOVÁNÍ
// Před spuštěním testů

import '@testing-library/jest-dom';

import { createClient } from '@supabase/supabase-js';

// Mock Supabase client pro všechny testy
global.supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://localhost:54321',
  process.env.SUPABASE_SERVICE_ROLE_KEY || 'test-key'
);

// Mock crypto pro šifrování
jest.mock('crypto', () => ({
  randomBytes: jest.fn().mockReturnValue(Buffer.from('0'.repeat(32), 'hex')),
  createCipheriv: jest.fn(() => ({
    update: jest.fn((data) => data.toString()),
    final: jest.fn(() => '')
  })),
  createDecipheriv: jest.fn(() => ({
    update: jest.fn((data) => data.toString()),
    final: jest.fn(() => '')
  }))
}));

// Mock console pro potlačení výstupů v testech
global.console = {
  ...console,
  log: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
};

// ✅ FIX: Mock window.alert — OsobaForm volá alert() při validaci a úspěchu
if (typeof global.window !== 'undefined') {
  global.window.alert = jest.fn();
} else if (typeof global.alert === 'function' && global.alert.toString().indexOf('[native code]') > -1) {
  // jsdom environment — override native alert with mock
  (global as any).alert = jest.fn();
}
// Pokud alert nebyl nativní funkce, vytvoříme ho jako jest.fn()
if (typeof (global as any).alert !== 'function') {
  (global as any).alert = jest.fn();
}

export const mockAlert = global.alert as jest.MockedFunction<typeof alert>;

// Testovací helper funkce
export const mockPerson = (overrides = {}) => ({
  id: 'test-person-uuid',
  farnost_id: 'test-farnost-uuid',
  krestni_jmeno: 'Jan',
  prijmeni: 'Novák',
  datum_narozeni: '1974-05-14',
  pohlavi: true,
  clenstvi_od: new Date().toISOString(),
  clenstvi_zdroj: 'krest',
  status: 'aktivni',
  role_cirkinni: ['clen_rady'],
  ...overrides
});

export const mockFarnost = (overrides = {}) => ({
  id: 'test-farnost-uuid',
  nazev: 'Testovací Farnost',
  zkratka: 'TF',
  adresa: 'Testovací 1, Praha',
  psc: '100 00',
  obec: 'Praha',
  telefon: '+420 123 456 789',
  email: 'test@farnost.cz',
  aktivni: true,
  ...overrides
});

export const mockUser = (overrides = {}) => ({
  id: 'test-user-uuid',
  email: 'test@example.com',
  role: 'superadmin',
  PRIMARY_farnost_id: null,
  DALSI_farnosti: [],
  aktivni: true,
  ...overrides
});

// Cleanup po každém testu
afterEach(() => {
  jest.clearAllMocks();
});
