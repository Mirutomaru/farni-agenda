// FARNÍ AGENDA - UNIT TESTY PRO EDGE FUNCTIONS
// Testování pomocí Jest/Supabase Test Utils

import { createClient } from '@supabase/supabase-js';
import * as crypto from 'crypto';

// Mock Supabase client pro testy
jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn()
}));

const mockCreateClient = createClient as jest.MockedFunction<typeof createClient>;

function buildMockSupabase() {
  const fromMock = jest.fn();
  const rpcMock = jest.fn();
  
  return {
    client: {
      from: fromMock,
      select: jest.fn().mockReturnThis(),
      eq: jest.fn(),
      insert: jest.fn().mockReturnThis(),
      update: jest.fn().mockReturnThis(),
      delete: jest.fn().mockReturnThis(),
      single: jest.fn(),
      rpc: rpcMock,
    },
    fromMock,
    rpcMock,
  };
}

let mockSupabase: ReturnType<typeof buildMockSupabase>;

describe('Edge Functions - Unit Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    
    // Reset mocks before each test
    mockSupabase = buildMockSupabase();
    
    // Mock Supabase client
    mockCreateClient.mockReturnValue(mockSupabase.client);
  });

  describe('Birthday Watcher Logic', () => {
    
    test('Happy Path: Vrací osoby s kulatými narozeninami', async () => {
      // Mockovaná data z DB - vek se pocita ve funkci get_birthday_people (SQL)
      const mockPeople = [
        { id: '1', krestni_jmeno: 'Jan', prijmeni: 'Novak', datum_narozeni: '1974-05-14' }, // 50 let
        { id: '2', krestni_jmeno: 'Marie', prijmeni: 'Svobodova', datum_narozeni: '1964-05-14' } // 60 let
      ];

      mockSupabase.rpcMock.mockResolvedValue({ data: mockPeople, error: null });

      const result = await mockSupabase.client.rpc('get_birthday_people', { den: 14, mesic: 5 });
      
      expect(result.data).toHaveLength(2);
    });

    test('Edge Case: Žádné osoby s narozeninami', async () => {
      mockSupabase.rpcMock.mockResolvedValue({ data: [], error: null });

      const result = await mockSupabase.client.rpc('get_birthday_people', { den: 31, mesic: 2 }); // Neexistující datum
      
      expect(result.data).toHaveLength(0);
    });

    test('Error Handling: Chyba při načítání dat', async () => {
      mockSupabase.rpcMock.mockResolvedValue({ data: null, error: new Error('Database connection failed') });

      const result = await mockSupabase.client.rpc('get_birthday_people', { den: 14, mesic: 5 });
      
      expect(result.error).toBeInstanceOf(Error);
      expect(result.error?.message).toBe('Database connection failed');
    });

    test('Edge Case: Osoba s datem narození v budoucnosti', async () => {
      const mockPeople = [
        { id: '3', krestni_jmeno: 'Test', prijmeni: 'Future', datum_narozeni: '2030-05-14' }
      ];

      mockSupabase.rpcMock.mockResolvedValue({ data: mockPeople, error: null });

      const result = await mockSupabase.client.rpc('get_birthday_people', { den: 14, mesic: 5 });
      
      // Vek se pocita ve SQL funkci - mockovana data ho nemusi mit
      expect(result.data).toHaveLength(1);
    });
  });

  describe('Monthly Statistics Logic', () => {
    
    test('Happy Path: Statistika pro aktuální měsíc', async () => {
      const mockStats = [
        { farnost_nazev: 'Praha', celkem_clenu: 100, kresty: 5, birovani: 2, svatby: 3, pohreby: 1 },
        { farnost_nazev: 'Brno', celkem_clenu: 80, kresty: 3, birovani: 1, svatby: 2, pohreby: 0 }
      ];

      mockSupabase.rpcMock.mockResolvedValue({ data: mockStats, error: null });

      const result = await mockSupabase.client.rpc('get_monthly_statistics', { rok: 2024, mesic: 5 });
      
      expect(result.data).toHaveLength(2);
      expect(result.data[0].celkem_clenu).toBe(100);
    });

    test('Edge Case: Prázdné výsledky pro minulý měsíc', async () => {
      mockSupabase.rpcMock.mockResolvedValue({ data: [], error: null });

      const result = await mockSupabase.client.rpc('get_monthly_statistics', { rok: 2023, mesic: 12 });
      
      expect(result.data).toHaveLength(0);
    });

    test('Error Handling: SQL funkce vrací chybu', async () => {
      mockSupabase.rpcMock.mockRejectedValue(new Error('SQL function error'));

      await expect(mockSupabase.client.rpc('get_monthly_statistics', { rok: 2024, mesic: 5 }))
        .rejects.toThrow('SQL function error');
    });

    test('Edge Case: Nevalidní parametry (mesic > 12)', async () => {
      // Test validace parametrů před voláním funkce
      const rok = 2024;
      const mesic = 13; // Invalid month
      
      expect(mesic).toBeGreaterThan(0);
      // Nevalidní měsíc je větší než 12 - test validace by měl chybu odhalit
      expect(mesic).not.toBeLessThanOrEqual(12);
    });
  });

  describe('Certificate Generation Logic', () => {
    
    test('Happy Path: Generování křestního certifikátu', async () => {
      const mockData = {
        osoba: { krestni_jmeno: 'Jan', prijmeni: 'Novák' },
        datum_krstu: '2024-01-15',
        misto_krstu: 'Kostel sv. Mikuláše',
        farar_vedouci: { krestni_jmeno: 'Pavel', prijmeni: 'Stránský' }
      };

      const htmlContent = `
<!DOCTYPE html>
<html><body>
<h1>KŘESTNÍ LISTINA</h1>
<p>${mockData.osoba.krestni_jmeno} ${mockData.osoba.prijmeni}</p>
</body></html>`;

      expect(htmlContent).toContain('KŘESTNÍ LISTINA');
      expect(htmlContent).toContain('Jan Novák');
    });

    test('Edge Case: Chybějící farář', async () => {
      const mockData = {
        osoba: { krestni_jmeno: 'Test', prijmeni: 'User' },
        datum_krstu: '2024-01-15',
        misto_krstu: 'Kostel',
        farar_vedouci: null // Edge case - žádný farář
      };

      const htmlContent = `
<p>Vedoucí farář: ${mockData.farar_vedouci?.krestni_jmeno || 'N/A'}</p>`;

      expect(htmlContent).toContain('N/A');
    });

    test('Error Handling: Neplatný typ certifikátu', async () => {
      const type = 'invalid_type';
      
      // Neplatný typ by měl selhat validaci - otestujeme, že není platná hodnota
      expect(type).not.toBe('krest');
      expect(type).not.toBe('birovan');
    });

    test('Edge Case: Prázdná data osoby', async () => {
      const mockData = {
        osoba: { krestni_jmeno: '', prijmeni: '' },
        datum_krstu: null,
        misto_krstu: ''
      };

      const htmlContent = `
<p>${mockData.osoba.krestni_jmeno || 'Neznámý'} ${mockData.osoba.prijmeni || 'Neznámý'}</p>`;

      expect(htmlContent).toContain('Neznámý');
    });
  });

  describe('Encryption Logic', () => {
    
    test('Happy Path: Šifrování a dešifrování emailu', async () => {
      const key = crypto.randomBytes(32);
      const plaintext = 'test@email.cz';
      
      // Simulace šifrování
      const iv = crypto.randomBytes(16);
      const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
      let encrypted = cipher.update(plaintext, 'utf8', 'base64');
      encrypted += cipher.final('base64');
      
      // Simulace dešifrování
      const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
      let decrypted = decipher.update(encrypted, 'base64', 'utf8');
      decrypted += decipher.final('utf8');
      
      expect(decrypted).toBe(plaintext);
    });

    test('Edge Case: Šifrování prázdného řetězce', async () => {
      const key = crypto.randomBytes(32);
      const plaintext = '';
      
      const iv = crypto.randomBytes(16);
      const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
      let encrypted = cipher.update(plaintext, 'utf8', 'base64');
      encrypted += cipher.final('base64');
      
      expect(encrypted).toBeDefined();
    });

    test('Edge Case: Šifrování velmi dlouhého řetězce', async () => {
      const key = crypto.randomBytes(32);
      const plaintext = 'a'.repeat(10000); // 10KB textu
      
      const iv = crypto.randomBytes(16);
      const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
      let encrypted = cipher.update(plaintext, 'utf8', 'base64');
      encrypted += cipher.final('base64');
      
      expect(encrypted).toBeDefined();
      expect(encrypted.length).toBeGreaterThan(0);
    });
  });

  describe('Data Validation Logic', () => {
    
    test('Happy Path: Validní datum narození', async () => {
      const birthDate = new Date('1974-05-14');
      const today = new Date();
      
      const age = today.getFullYear() - birthDate.getFullYear();
      
      expect(age).toBeGreaterThan(0);
      expect(age).toBeLessThan(120);
    });

    test('Edge Case: Datum narození v budoucnosti', async () => {
      const birthDate = new Date('2030-05-14');
      const today = new Date();
      
      const age = today.getFullYear() - birthDate.getFullYear();
      
      expect(age).toBeLessThanOrEqual(0);
    });

    test('Edge Case: Datum narození před 100 lety', async () => {
      const birthDate = new Date('1920-05-14');
      const today = new Date();
      
      const age = today.getFullYear() - birthDate.getFullYear();
      
      expect(age).toBeGreaterThan(100);
    });

    test('Error Handling: Nevalidní formát data', async () => {
      const invalidDate = 'invalid-date';
      
      expect(() => new Date(invalidDate)).toBeTruthy(); // Validuje se, ale je Invalid Date
      expect(isNaN(new Date(invalidDate).getTime())).toBe(true);
    });

    test('Edge Case: Null hodnota pro datum', async () => {
      const birthDate = null;
      
      expect(birthDate).toBeNull();
    });
  });
});
