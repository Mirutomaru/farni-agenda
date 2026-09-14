// FARNÍ AGENDA - MONTHLY REPORT SERVICE
// Generování měsíčních statistik a jejich odesílání administrátorům
// VSTUP: { rok: number, mesic: number } → VÝSTUP: { success: boolean, count: number, totals: Object }

import { createClient } from '@supabase/supabase-js';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { loggerFromRequest, Logger } from '@/lib/logging/logger';
import { getConfig, getSupabaseConfig, getEmailConfig } from '@/lib/config/env_config';

type ReportTotals = {
  celkemClenu: number;
  kresty: number;
  birovani: number;
  svatby: number;
  pohreby: number;
};

interface FarnostStatRow {
  farnost_nazev: string;
  celkem_clenu: number;
  aktivni_clenu: number;
  kresty: number;
  birovani: number;
  svatby: number;
  pohreby: number;
}

// === VALIDACE VSTUPŮ ===
function validateReportInput(data: unknown): { valid: boolean; rok?: number; mesic?: number; error?: string } {
  if (!data || typeof data !== 'object') return { valid: false, error: 'Neplatný vstupní formát' };
  
  const payload = data as Record<string, unknown>;
  const rok = payload.rok;
  const mesic = payload.mesic;

  if (!rok || typeof rok !== 'number' || rok < 2000 || rok > 9999) {
    return { valid: false, error: 'Chybí nebo je neplatný rok (číslo 2000-9999)' };
  }
  if (!mesic || typeof mesic !== 'number' || mesic < 1 || mesic > 12) {
    return { valid: false, error: 'Chybí nebo je neplatný měsíc (číslo 1-12)' };
  }

  return { valid: true, rok, mesic };
}

// === FORMÁTOVÁNÍ HTML REPORTU ===
function formatReportHtml(stats: FarnostStatRow[], rok: number, mesic: number): string {
  const formattedMesic = String(mesic).padStart(2, '0');
  
  let html = `<h1>Měsíční statistiky Starokatolické církve</h1>`;
  html += `<p>Období: ${formattedMesic}/${rok}</p>`;
  html += '<table border="1" cellpadding="8" style="border-collapse: collapse;">';
  html += '<tr><th>Farnost</th><th>Členů</th><th>Křty</th><th>Birování</th><th>Svatby</th><th>Pohřby</th></tr>';

  const totals: ReportTotals = { celkemClenu: 0, kresty: 0, birovani: 0, svatby: 0, pohreby: 0 };

  for (const stat of stats || []) {
    html += `<tr><td>${stat.farnost_nazev}</td><td>${stat.celkem_clenu || 0}</td>
      <td>${stat.kresty || 0}</td><td>${stat.birovani || 0}</td>
      <td>${stat.svatby || 0}</td><td>${stat.pohreby || 0}</td></tr>`;

    totals.celkemClenu += stat.celkem_clenu || 0;
    totals.kresty += stat.kresty || 0;
    totals.birovani += stat.birovani || 0;
    totals.svatby += stat.svatby || 0;
    totals.pohreby += stat.pohreby || 0;
  }

  html += '</table>';
  html += `<h2>Celkem za církev:</h2><ul>
    <li><strong>Členů:</strong> ${totals.celkemClenu}</li>
    <li><strong>Křty:</strong> ${totals.kresty}</li>
    <li><strong>Birování:</strong> ${totals.birovani}</li>
    <li><strong>Svatby:</strong> ${totals.svatby}</li>
    <li><strong>Pohřby:</strong> ${totals.pohreby}</li>
  </ul>`;

  return html;
}

// === ODESLÁNÍ E-MAILU s retry patternem ===
async function sendEmail(log: Logger, to: string, subject: string, htmlContent: string): Promise<void> {
  try {
    const emailConfig = getEmailConfig();

    if (emailConfig.provider === 'resend') {
      await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${emailConfig.key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ from: 'Farní Agenda <stats@farni-agenda.cz>', to, subject, html: htmlContent }),
      });
    } else {
      await fetch('https://api.sendgrid.com/v3/mail/send', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${emailConfig.key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ personalizations: [{ to: [{ email: to }] }], from: { email: 'stats@farni-agenda.cz', name: 'Farní Agenda' }, subject, html_content: htmlContent }),
      });
    }
    
    log.info('Report odeslán', { to, subject });
  } catch (emailError) {
    const msg = emailError instanceof Error ? emailError.message : 'Neznámá chyba emailu';
    log.error('Chyba při odesílání e-mailu na ' + to, { error: msg });
    // Nefailuje celý report jen kvůli chybě emailu
  }
}

// === ZÍSKÁNÍ ADMINISTRÁTORŮ PRO ODESLÁNÍ REPORTU ===
async function getAdminEmails(log: Logger): Promise<string[]> {
  const config = getConfig();
  const supabase = createClient(config.NEXT_PUBLIC_SUPABASE_URL, config.SUPABASE_SERVICE_ROLE_KEY);
  
  const { data: admins, error } = await supabase.from('uzivatele').select('email')
    .in('role', ['biskup', 'synodalni_rada']);

  if (error) {
    log.error('Chyba při načítání adminů', { error: error.message });
    return [];
  }
  
  return admins?.map(a => a.email).filter(Boolean) || [];
}

// === HLAVNÍ LOGIKA GENEROVÁNÍ REPORTU ===
async function generateMonthlyReport(rok: number, mesic: number): Promise<{ 
  success: boolean; count?: number; totals?: ReportTotals; error?: string 
}> {
  const config = getConfig();
  const supabase = createClient(config.NEXT_PUBLIC_SUPABASE_URL, config.SUPABASE_SERVICE_ROLE_KEY);

  // Načtení statistik z DB (RPC funkce)
  try {
    const { data: stats, error } = await supabase.rpc('get_monthly_statistics', { rok, mesic });
    if (error) throw error;

    // Formátování a odesílání reportu
    const emailHtml = formatReportHtml(stats, rok, mesic);
    const adminEmails = await getAdminEmails(getLoggerForReport());

    for (const admin of adminEmails) {
      const formattedMesic = String(mesic).padStart(2, '0');
      await sendEmail(getLoggerForReport(), admin, `📊 Statistiky - ${formattedMesic}/${rok}`, emailHtml);
    }

    // Výpočet celkových součtů
    const totals: ReportTotals = { celkemClenu: 0, kresty: 0, birovani: 0, svatby: 0, pohreby: 0 };
    for (const stat of stats || []) {
      totals.celkemClenu += stat.celkem_clenu || 0;
      totals.kresty += stat.kresty || 0;
      totals.birovani += stat.birovani || 0;
      totals.svatby += stat.svatby || 0;
      totals.pohreby += stat.pohreby || 0;
    }

    return { success: true, count: stats?.length || 0, totals };
  } catch (dbError) {
    const log = getLoggerForReport();
    log.error('Chyba při generování reportu', { error: dbError instanceof Error ? dbError.message : 'Neznámá' });
    return { success: false, error: 'Generování reportu selhalo' };
  }
}

function getLoggerForReport(): Logger {
  return loggerFromRequest({ headers: new Headers() }, 'REPORT');
}

// === EXPORT PRO API ROUTE ===
export async function POST(request: NextRequest): Promise<NextResponse> {
  const log = loggerFromRequest(request, 'REPORT');
  
  try {
    const body = await request.json();
    
    // Validace vstupů
    const validation = validateReportInput(body);
    if (!validation.valid) return NextResponse.json({ error: validation.error }, { status: 400 });

    // Delegování na service layer
    const result = await generateMonthlyReport(validation.rok!, validation.mesic!);

    if (!result.success) return NextResponse.json({ error: result.error }, { status: 500 });

    log.info('Report vygenerován úspěšně', { rok: validation.rok, mesic: validation.mesic, count: result.count });
    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    log.error('Nečekaná chyba v REPORT-SERVICE', { error: error instanceof Error ? error.message : 'Neznámá' });
    return NextResponse.json({ error: 'Generování reportu selhalo', details: error instanceof Error ? error.message : 'Neznámá' }, { status: 500 });
  }
}
