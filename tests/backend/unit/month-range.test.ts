// FARNÍ AGENDA - UNIT TESTY PRO MĚSÍČNÍ DATOVÝ ROZSAH (lib/utils/month-range.ts)
// P0 fix: starý inline výpočet v finance/page.tsx vracel lastDay = 0 a filtr se
// nikdy neaplikoval na query. Tato čistá funkce je nyní testovatelná samostatně.

import { getMonthRange } from '@/lib/utils/month-range';

describe('getMonthRange - výpočet měsíčního rozsahu', () => {

  describe('Happy path: platné měsíce', () => {
    test('Březen (31 dní)', () => {
      expect(getMonthRange('2026-03')).toEqual({ firstDay: '2026-03-01', lastDay: '2026-03-31' });
    });

    test('Duben (30 dní)', () => {
      expect(getMonthRange('2026-04')).toEqual({ firstDay: '2026-04-01', lastDay: '2026-04-30' });
    });

    test('Červen (30 dní)', () => {
      expect(getMonthRange('2026-06')).toEqual({ firstDay: '2026-06-01', lastDay: '2026-06-30' });
    });

    test('Prosinec (31 dní, poslední měsíc roku)', () => {
      expect(getMonthRange('2026-12')).toEqual({ firstDay: '2026-12-01', lastDay: '2026-12-31' });
    });

    test('Leden (31 dní, první měsíc roku)', () => {
      expect(getMonthRange('2027-01')).toEqual({ firstDay: '2027-01-01', lastDay: '2027-01-31' });
    });

    test('Říjen (31 dní) — regression test pro původní bug (lastDay = 0)', () => {
      const range = getMonthRange('2026-10');
      expect(range).not.toBeNull();
      // Starý kód: new Date('2026/11/01').getDate() - 1 = 0 → "2026-10-0"
      expect(range!.lastDay).toBe('2026-10-31');
    });

    test('Únor v obyčejném roce (28 dní)', () => {
      expect(getMonthRange('2026-02')).toEqual({ firstDay: '2026-02-01', lastDay: '2026-02-28' });
    });

    test('Únor v přestupném roce (29 dní)', () => {
      expect(getMonthRange('2024-02')).toEqual({ firstDay: '2024-02-01', lastDay: '2024-02-29' });
    });

    test('Únor v přestupném roce 2000 (dělitelný 400 → 29 dní)', () => {
      expect(getMonthRange('2000-02')).toEqual({ firstDay: '2000-02-01', lastDay: '2000-02-29' });
    });

    test('Únor v roce 1900 (nedělitelný 400 → 28 dní)', () => {
      expect(getMonthRange('1900-02')).toEqual({ firstDay: '1900-02-01', lastDay: '1900-02-28' });
    });
  });

  describe('Edge cases: neplatný vstup vrací null', () => {
    test('Prázdný string', () => {
      expect(getMonthRange('')).toBeNull();
    });

    test('Chybějící měsíc (jen rok)', () => {
      expect(getMonthRange('2026')).toBeNull();
    });

    test('Jednociferní měsíc bez nuly', () => {
      expect(getMonthRange('2026-1')).toBeNull();
    });

    test('Měsíc 00', () => {
      expect(getMonthRange('2026-00')).toBeNull();
    });

    test('Měsíc 13', () => {
      expect(getMonthRange('2026-13')).toBeNull();
    });

    test('Nečíselný rok', () => {
      expect(getMonthRange('abcd-05')).toBeNull();
    });

    test('Nečíselný měsíc', () => {
      expect(getMonthRange('2026-xx')).toBeNull();
    });

    test('Příliš dlouhý rok (5 číslic)', () => {
      expect(getMonthRange('12026-05')).toBeNull();
    });
  });
});
