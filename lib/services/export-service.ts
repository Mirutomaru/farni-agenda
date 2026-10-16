// FARNÍ AGENDA - EXPORT SERVICE (P2)
// Generování CSV a PDF exportů dat (osoby, finance, křestní zápisy).
// Čisté funkce toCsv/escapeCsvValue jsou plně testovatelné bez DOM.

import { createClient } from '@/lib/supabase/server';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { loggerFromRequest, Logger } from '@/lib/logging/logger';
import { requireUser } from '@/lib/auth/require-user';

// === CSV: ČISTÉ FUNKCE (testovatelné) ===

/**
 * Unescape CSV hodnoty — obalí do uvozovek pokud obsahuje oddělovač, uvozovku nebo nový řádek.
 * Uvozovky uvnitř se zdvojnásobí podle RFC 4180.
 */
export function escapeCsvValue(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return '';
  const str = String(value);
  if (/[",\n\r]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/**
 * Vygeneruje CSV string z hlaviček a řádků.
 * Vrací BOM (\uFEFF) na začátku pro správné vykreslení diakritiky v Excelu (UTF-8).
 */
export function toCsv(headers: string[], rows: (string | number | null | undefined)[][]): string {
  const lines = [headers.map(escapeCsvValue).join(',')];
  for (const row of rows) {
    lines.push(row.map(escapeCsvValue).join(','));
  }
  return '\uFEFF' + lines.join('\r\n');
}

// === PDF: GENEROVÁNÍ PŘES JSPDF ===

/**
 * Vygeneruje jednoduchý tabulkový PDF dokument.
 * Vrací binární obsah (Uint8Array) — route ho zabalí do Response s Content-Disposition.
 */
export async function buildPdf(
  title: string,
  headers: string[],
  rows: (string | number | null | undefined)[][],
): Promise<ArrayBuffer> {
  const { default: jsPDF } = await import('jspdf');

  // Embedovaný font s diakritikou (DejaVu Sans) — bez něj by helvetica vykreslovala č/ř/ž jako ?
  const { DEJAVU_SANS_BASE64 } = await import('@/lib/assets/dejavu-sans-base64');
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });

  // Registrace fontu (base64 → jsPDF zvládne)
  doc.addFileToVFS('DejaVuSans.ttf', DEJAVU_SANS_BASE64);
  doc.addFont('DejaVuSans.ttf', 'DejaVu', 'normal');
  doc.setFont('DejaVu', 'normal');

  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 12;
  const usableWidth = pageWidth - margin * 2;

  // Výpočet šířek sloupců podle obsahu (max délka, omezeno na 5-40% šířky)
  const colCount = headers.length;
  const maxLens: number[] = headers.map((h, i) => {
    let max = h.length;
    for (const row of rows) {
      const cell = String(row[i] ?? '');
      if (cell.length > max) max = Math.min(cell.length, 40);
    }
    return max;
  });
  const totalLen = maxLens.reduce((a, b) => a + b, 0) || 1;
  const colWidths = maxLens.map((l) => (usableWidth * l) / totalLen);

  // Nadpis
  doc.setFontSize(14);
  doc.text(title, margin, margin + 4);
  doc.setFontSize(9);
  doc.setTextColor(120);
  doc.text(`Vygenerováno: ${new Date().toLocaleDateString('cs-CZ')} — Farní Agenda`, margin, margin + 9);

  // Tabulka
  let y = margin + 15;
  const rowHeight = 7;

  // Hlavička
  doc.setFillColor(240, 244, 248);
  doc.rect(margin, y - 4, usableWidth, rowHeight, 'F');
  doc.setTextColor(30);
  let x = margin;
  for (let i = 0; i < colCount; i++) {
    const text = doc.splitTextToSize(String(headers[i]), colWidths[i] - 2) as string[];
    doc.text(text[0], x + 1, y);
    x += colWidths[i];
  }
  y += rowHeight;

  // Řádky
  for (const row of rows) {
    if (y > 195) {
      doc.addPage();
      y = margin + 4;
    }
    x = margin;
    for (let i = 0; i < colCount; i++) {
      const cellText = String(row[i] ?? '');
      const text = doc.splitTextToSize(cellText, colWidths[i] - 2) as string[];
      doc.text(text[0], x + 1, y);
      x += colWidths[i];
    }
    y += rowHeight;
  }

  // Počet záznamů
  doc.setFontSize(8);
  doc.setTextColor(120);
  doc.text(`Celkem záznamů: ${rows.length}`, margin, y + 4);

  return doc.output('arraybuffer');
}

// === DATA FETCHING (server-side, service role key) ===

type ExportType = 'osoby' | 'finance' | 'krestni-zapisky';

interface ExportResult {
  filename: string;
  headers: string[];
  rows: (string | number | null | undefined)[][];
}

/** Formátování data pro export (null-safe) */
function fmtDate(value: unknown): string {
  if (!value) return '';
  const d = new Date(String(value));
  return isNaN(d.getTime()) ? String(value) : d.toLocaleDateString('cs-CZ');
}

async function fetchExportData(type: ExportType, log: Logger): Promise<ExportResult> {
  const supabase = createClient();
  const dateStr = new Date().toISOString().slice(0, 10);

  if (type === 'osoby') {
    // Pouze nešifrovaná pole — citlivá data zůstávají v DB (email_encrypted atd.)
    const { data, error } = await supabase
      .from('osoby')
      .select('id, krestni_jmeno, prijmeni, datum_narozeni, clenstvi_status, verejny_email, verejna_telefon, role_cirkinni')
      .order('prijmeni');

    if (error) throw new Error(`Chyba načítání osob: ${error.message}`);

    return {
      filename: `osoby-${dateStr}.csv`,
      headers: ['Jméno', 'Příjmení', 'Datum narození', 'Status', 'Veřejný e-mail', 'Veřejný telefon', 'Role'],
      rows: (data || []).map((o: any) => [
        o.krestni_jmeno,
        o.prijmeni,
        fmtDate(o.datum_narozeni),
        o.clenstvi_status || '',
        o.verejny_email || '',
        o.verejna_telefon || '',
        (o.role_cirkinni || []).join('; '),
      ]),
    };
  }

  if (type === 'finance') {
    const { data, error } = await supabase
      .from('finance')
      .select('datum_příjmu, typ, kategorie, castka, měna, popisek, protiplatitel, variabilni_symbol')
      .order('datum_příjmu', { ascending: false });

    if (error) throw new Error(`Chyba načítání financí: ${error.message}`);

    return {
      filename: `finance-${dateStr}.csv`,
      headers: ['Datum', 'Typ', 'Kategorie', 'Částka', 'Měna', 'Popisek', 'Protiplatitel', 'Variabilní symbol'],
      rows: (data || []).map((f: any) => [
        fmtDate(f['datum_příjmu']),
        f.typ,
        f.kategorie,
        Number(f.castka).toFixed(2),
        f.měna || 'CZK',
        f.popisek || '',
        f.protiplatitel || '',
        f.variabilni_symbol || '',
      ]),
    };
  }

  // krestni-zapisky — s připojenými jmény osob (pokrtený, rodiče, kmotři)
  const { data: zapisy, error } = await supabase
    .from('krestni_zapis')
    .select('datum_krstu, misto_krstu, pokrteny_id, otec_id, matka_id, kmotr_id, kmotra_id')
    .order('datum_krstu', { ascending: false });

  if (error) throw new Error(`Chyba načítání křestních zápisů: ${error.message}`);

  // Načtení jmen všech unikátních osob v jednom dotazu
  const allIds = new Set<string>();
  for (const z of zapisy || []) {
    const row = z as Record<string, unknown>;
    for (const key of ['pokrteny_id', 'otec_id', 'matka_id', 'kmotr_id', 'kmotra_id'] as const) {
      if (row[key]) allIds.add(String(row[key]));
    }
  }

  const names: Record<string, string> = {};
  if (allIds.size > 0) {
    const { data: osobyData } = await supabase.from('osoby').select('id, krestni_jmeno, prijmeni').in('id', [...allIds]);
    for (const o of osobyData || []) {
      names[String(o.id)] = `${o.krestni_jmeno} ${o.prijmeni}`;
    }
  }

  const nameOf = (id: unknown): string => (id ? names[String(id)] || '' : '');

  return {
    filename: `krestni-zapisy-${dateStr}.csv`,
    headers: ['Datum křtu', 'Místo křtu', 'Pokrtený', 'Otec', 'Matka', 'Kmotr', 'Kmotra'],
    rows: (zapisy || []).map((z: any) => [
      fmtDate(z.datum_krstu),
      z.misto_krstu,
      nameOf(z.pokrteny_id),
      nameOf(z.otec_id),
      nameOf(z.matka_id),
      nameOf(z.kmotr_id),
      nameOf(z.kmotra_id),
    ]),
  };
}

// === API HANDLERY (export pro route.ts) ===

function parseExportType(searchParams: URLSearchParams): ExportType | null {
  const typ = searchParams.get('typ');
  if (typ === 'osoby' || typ === 'finance' || typ === 'krestni-zapisky') return typ;
  return null;
}

export async function handleCsvExport(request: NextRequest): Promise<NextResponse> {
  const log = loggerFromRequest(request, 'EXPORT');

  // Auth: bez platné session → 401 (service role key obchází RLS)
  const auth = await requireUser();
  if (!auth.ok) return auth.response;

  try {
    const type = parseExportType(new URL(request.url).searchParams);
    if (!type) return NextResponse.json({ error: 'Neplatný typ exportu (osoby|finance|krestni-zapisky)' }, { status: 400 });

    const result = await fetchExportData(type, log);
    const csv = toCsv(result.headers, result.rows);

    log.info('CSV export vygenerován', { type, count: result.rows.length });

    return new NextResponse(csv, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${result.filename}"`,
      },
    });
  } catch (error) {
    log.error('Chyba CSV exportu', { error: error instanceof Error ? error.message : 'Neznámá' });
    return NextResponse.json({ error: 'Export selhal', details: error instanceof Error ? error.message : undefined }, { status: 500 });
  }
}

export async function handlePdfExport(request: NextRequest): Promise<NextResponse> {
  const log = loggerFromRequest(request, 'EXPORT');

  const auth = await requireUser();
  if (!auth.ok) return auth.response;

  try {
    const type = parseExportType(new URL(request.url).searchParams);
    if (!type) return NextResponse.json({ error: 'Neplatný typ exportu (osoby|finance|krestni-zapisky)' }, { status: 400 });

    const result = await fetchExportData(type, log);
    const titles: Record<ExportType, string> = {
      osoby: 'Seznam osob',
      finance: 'Finanční přehled',
      'krestni-zapisky': 'Křestní zápisy',
    };

    const pdfBuffer = await buildPdf(titles[type], result.headers, result.rows);
    log.info('PDF export vygenerován', { type, count: result.rows.length });

    return new NextResponse(pdfBuffer, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${result.filename.replace('.csv', '.pdf')}"`,
      },
    });
  } catch (error) {
    log.error('Chyba PDF exportu', { error: error instanceof Error ? error.message : 'Neznámá' });
    return NextResponse.json({ error: 'Export selhal', details: error instanceof Error ? error.message : undefined }, { status: 500 });
  }
}
