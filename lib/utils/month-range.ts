// FARNÍ AGENDA - ÚTILITA PRO MĚSÍČNÍ DATOVÝ ROZSAH
// Čistá funkce pro výpočet prvního a posledního dne měsíce z parametru "RRRR-MM".
// Vytaženo z app/finance/page.tsx, aby bylo možné testovat bez renderování stránky.

export interface MonthRange {
  firstDay: string; // RRRR-MM-01
  lastDay: string;  // RRRR-MM-DD (poslední den měsíce)
}

/**
 * Vypočítá rozsah měsícem z parametru ve formátu "RRRR-MM".
 * Vrátí null pro neplatný vstup (např. "2026-1", "abc-def").
 *
 * Poslední den se počítá přes UTC datum: den 0 měsíce N+1 = poslední den měsíce N.
 * Bez timezone triků (starý kód `new Date('RRR/MM/01').getDate() - 1` vracel 0).
 */
export function getMonthRange(mesicParam: string): MonthRange | null {
  const [rok, mesice] = mesicParam.split('-');
  if (!/^\d{4}$/.test(rok) || !/^\d{2}$/.test(mesice)) return null;

  const rokNum = parseInt(rok, 10);
  const mesicNum = parseInt(mesice, 10);
  if (mesicNum < 1 || mesicNum > 12) return null;

  // den 0 měsíce s indexem mesicNum (= měsíc N+1) je poslední den měsíce N
  const daysInMonth = new Date(Date.UTC(rokNum, mesicNum, 0)).getUTCDate();

  return {
    firstDay: `${rok}-${mesice}-01`,
    lastDay: `${rok}-${mesice}-${String(daysInMonth).padStart(2, '0')}`,
  };
}
