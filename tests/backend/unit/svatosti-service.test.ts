// FARNÍ AGENDA - UNIT TESTY PRO SVÁTOSTI SERVICE
// Testování normalizace, sloučení a filtrace záznamů ze tří tabulek svátostí.

import {
  normalizeKrest,
  normalizeBirovani,
  normalizeSvatba,
  mergeSvatosti,
  filterByTyp,
  certificateTypeFor,
  monthRange,
  buildSvedkoveRows,
  groupSvedkoveBySvatba,
} from '@/lib/services/svatosti-service';

describe('svatosti-service', () => {
  describe('normalizeKrest', () => {
    test('mapuje sloupce krestni_zapis na normalizovaný tvar', () => {
      const result = normalizeKrest({
        id: 'k1',
        pokrteny_id: 'os1',
        datum_krstu: '2026-05-14',
        misto_krstu: 'Hradec Králové',
      });

      expect(result).toEqual({
        id: 'k1',
        typ: 'krest',
        osobaId: 'os1',
        druhOsobaId: undefined,
        datum: '2026-05-14',
        misto: 'Hradec Králové',
      });
    });

    test('chybějící volitelné pole → null', () => {
      const result = normalizeKrest({ id: 'k2' });
      expect(result.osobaId).toBeNull();
      expect(result.datum).toBeNull();
      expect(result.misto).toBeNull();
    });
  });

  describe('normalizeBirovani', () => {
    test('mapuje sloupce birovani_zapis na normalizovaný tvar', () => {
      const result = normalizeBirovani({
        id: 'b1',
        birovan_id: 'os2',
        datum_birovani: '2026-04-01',
        misto_birovani: 'Pardubice',
      });

      expect(result).toEqual({
        id: 'b1',
        typ: 'birovani',
        osobaId: 'os2',
        druhOsobaId: undefined,
        datum: '2026-04-01',
        misto: 'Pardubice',
      });
    });
  });

  describe('normalizeSvatba', () => {
    test('mapuje sloupce svatby na normalizovaný tvar s oběma osobami', () => {
      const result = normalizeSvatba({
        id: 's1',
        muz_id: 'os3',
        zena_id: 'os4',
        datum_svatby: '2026-06-20',
        misto_svatby: 'Praha',
      });

      expect(result).toEqual({
        id: 's1',
        typ: 'svadba',
        osobaId: 'os3',
        druhOsobaId: 'os4',
        datum: '2026-06-20',
        misto: 'Praha',
      });
    });

    test('chybějící žena → null (rozvedený/úmrť)', () => {
      const result = normalizeSvatba({ id: 's2', muz_id: 'os3' });
      expect(result.druhOsobaId).toBeNull();
    });
  });

  describe('mergeSvatosti', () => {
    test('sloučí záznamy ze všech tří tabulek a seřadí sestupně podle data', () => {
      const merged = mergeSvatosti(
        [{ id: 'k1', pokrteny_id: 'a', datum_krstu: '2026-01-15' }],
        [{ id: 'b1', birovan_id: 'b', datum_birovani: '2026-03-10' }],
        [{ id: 's1', muz_id: 'c', zena_id: 'd', datum_svatby: '2026-02-20' }]
      );

      expect(merged).toHaveLength(3);
      // Nejnovější první
      expect(merged[0].id).toBe('b1');
      expect(merged[1].id).toBe('s1');
      expect(merged[2].id).toBe('k1');
    });

    test('omezuje na limit položek (výchozí 50)', () => {
      const many = Array.from({ length: 60 }, (_, i) => ({
        id: `k${i}`,
        pokrteny_id: 'x',
        datum_krstu: `2026-01-${String((i % 28) + 1).padStart(2, '0')}`,
      }));

      const merged = mergeSvatosti(many, [], []);
      expect(merged).toHaveLength(50);
    });

    test('respektuje explicitní limit', () => {
      const many = Array.from({ length: 10 }, (_, i) => ({
        id: `k${i}`,
        datum_krstu: '2026-01-01',
      }));

      expect(mergeSvatosti(many, [], [], 3)).toHaveLength(3);
    });

    test('zvládne null/undefined vstupy (DB vrátila nic)', () => {
      const merged = mergeSvatosti(null, undefined, []);
      expect(merged).toEqual([]);
    });

    test('záznamy bez data jdou na konec', () => {
      const merged = mergeSvatosti(
        [{ id: 'k1', datum_krstu: '2026-05-01' }, { id: 'k2' }],
        [],
        []
      );

      expect(merged[0].id).toBe('k1');
      expect(merged[1].id).toBe('k2');
    });
  });

  describe('filterByTyp', () => {
    const records = [
      { id: 'k1', typ: 'krest' as const, datum: '2026-01-01', misto: null },
      { id: 'b1', typ: 'birovani' as const, datum: '2026-01-02', misto: null },
      { id: 's1', typ: 'svadba' as const, datum: '2026-01-03', misto: null },
    ];

    test('filtruje na křty', () => {
      expect(filterByTyp(records, 'krest')).toHaveLength(1);
      expect(filterByTyp(records, 'krest')[0].id).toBe('k1');
    });

    test('prázdný typ vrátí vše', () => {
      expect(filterByTyp(records, '')).toHaveLength(3);
      expect(filterByTyp(records, undefined)).toHaveLength(3);
    });

    test('neznámý typ vrátí vše (defenzivně)', () => {
      expect(filterByTyp(records, 'pohreb')).toHaveLength(3);
    });
  });

  describe('certificateTypeFor', () => {
    test('křest → krest', () => {
      expect(certificateTypeFor('krest')).toBe('krest');
    });

    test('birování → birovani (dle kontraktu certificate-service)', () => {
      // Pozor: service validuje 'birovan' ne 'birovani' — tohle je úmyslné mapování
      expect(certificateTypeFor('birovani')).toBe('birovan');
    });

    test('svatba zatím certifikát nemá', () => {
      expect(certificateTypeFor('svadba')).toBeNull();
    });
  });

  describe('monthRange', () => {
    test('vrací hranice měsíce (1. den → 1. den následujícího)', () => {
      const range = monthRange(2026, 4); // květen 2026 (0-based)

      expect(range.from).toBe('2026-05-01');
      expect(range.toExclusive).toBe('2026-06-01');
    });

    test('prosinec přechází do dalšího roku', () => {
      const range = monthRange(2026, 11); // prosinec 2026

      expect(range.from).toBe('2026-12-01');
      expect(range.toExclusive).toBe('2027-01-01');
    });

    test('únor má správnou horní hranici (oprava bugu s "-31")', () => {
      const range = monthRange(2026, 1); // únor 2026

      expect(range.from).toBe('2026-02-01');
      expect(range.toExclusive).toBe('2026-03-01');
    });
  });

  describe('buildSvedkoveRows', () => {
    test('vytvoří řádky pro tabulku svatba_svedkove', () => {
      const rows = buildSvedkoveRows('sv1', ['os5', 'os6']);
      expect(rows).toEqual([
        { svatba_id: 'sv1', svedek_id: 'os5' },
        { svatba_id: 'sv1', svedek_id: 'os6' },
      ]);
    });

    test('odstraní duplicity (UNIQUE(svatba_id, svedek_id))', () => {
      const rows = buildSvedkoveRows('sv1', ['os5', 'os5', 'os6']);
      expect(rows).toHaveLength(2);
    });

    test('vynechá prázdné/null/undefined hodnoty (nezvolený svědek)', () => {
      const rows = buildSvedkoveRows('sv1', ['', null, undefined, 'os5']);
      expect(rows).toEqual([{ svatba_id: 'sv1', svedek_id: 'os5' }]);
    });

    test('žádní svědkové → prázdné pole (bez insertu)', () => {
      expect(buildSvedkoveRows('sv1', [])).toEqual([]);
      expect(buildSvedkoveRows('sv1', [null, ''])).toEqual([]);
    });
  });

  describe('groupSvedkoveBySvatba', () => {
    test('seskupí svědky podle svatby pro zobrazení v UI', () => {
      const map = groupSvedkoveBySvatba([
        { svatba_id: 'sv1', svedek_id: 'os5' },
        { svatba_id: 'sv1', svedek_id: 'os6' },
        { svatba_id: 'sv2', svedek_id: 'os7' },
      ]);

      expect(map.get('sv1')).toEqual(['os5', 'os6']);
      expect(map.get('sv2')).toEqual(['os7']);
    });

    test('ignoruje řádky bez svatba_id nebo svedek_id (defenzivně)', () => {
      const map = groupSvedkoveBySvatba([
        { svatba_id: null, svedek_id: 'os5' },
        { svatba_id: 'sv1', svedek_id: undefined },
        { svatba_id: 'sv1', svedek_id: 'os6' },
      ]);

      expect(map.get('sv1')).toEqual(['os6']);
    });

    test('null/undefined vstup → prázdná mapa', () => {
      expect(groupSvedkoveBySvatba(null).size).toBe(0);
      expect(groupSvedkoveBySvatba(undefined).size).toBe(0);
    });
  });
});
