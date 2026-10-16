// FARNÍ AGENDA - EDGE FUNCTION
// Monthly Statistics - Měsíční report pro synodu a farnosti

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const SENDGRID_API_KEY = Deno.env.get('SENDGRID_API_KEY');
const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');

serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Metoda není povolena' }), { status: 405 });
  }

  try {
    console.log('📊 Měsíční statistiky spuštěny');

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    // Získání aktuálního roku a měsíce
    const now = new Date();
    const rok = now.getFullYear();
    const mesic = now.getMonth() + 1;

    console.log(`Statistiky pro: ${rok}-${String(mesic).padStart(2, '0')}`);

    // Volání SQL funkce pro statistiky
    const { data: stats, error } = await supabase.rpc('get_monthly_statistics', { rok, mesic });

    if (error) throw error;

    console.log(`Načteno statistik pro ${stats?.length || 0} farností`);

    // Tvorba e-mailového obsahu
    const emailSubject = `📊 Statistiky Starokatolické církve - ${String(mesic).padStart(2, '0')}/${rok}`;
    
    let emailBody = `<h1>Měsíční statistiky</h1>`;
    emailBody += `<p>Období: ${String(mesic).padStart(2, '0')}/${rok}</p>`;
    emailBody += '<table border="1" cellpadding="8" style="border-collapse: collapse;">';
    emailBody += '<tr><th>Farnost</th><th>Členů</th><th>Křty</th><th>Birování</th><th>Svatby</th><th>Pohřby</th></tr>';

    let celkemClenu = 0, celkemKresty = 0, celkemBirovani = 0, celkemSvatby = 0, celkemPohreby = 0;

    for (const stat of stats || []) {
      emailBody += `<tr>
        <td>${stat.farnost_nazev}</td>
        <td>${stat.celkem_clenu}</td>
        <td>${stat.kresty || 0}</td>
        <td>${stat.birovani || 0}</td>
        <td>${stat.svatby || 0}</td>
        <td>${stat.pohreby || 0}</td>
      </tr>`;

      celkemClenu += stat.celkem_clenu || 0;
      celkemKresty += stat.kresty || 0;
      celkemBirovani += stat.birovani || 0;
      celkemSvatby += stat.svatby || 0;
      celkemPohreby += stat.pohreby || 0;
    }

    emailBody += '</table>';
    
    // Celkové součty
    emailBody += `<h2>Celkem za církev:</h2>`;
    emailBody += `<ul>
      <li><strong>Členů:</strong> ${celkemClenu}</li>
      <li><strong>Křty:</strong> ${celkemKresty}</li>
      <li><strong>Birování:</strong> ${celkemBirovani}</li>
      <li><strong>Svatby:</strong> ${celkemSvatby}</li>
      <li><strong>Pohřby:</strong> ${celkemPohreby}</li>
    </ul>`;

    emailBody += '<p>Systém Monthly Statistics</p>';

    // Odeslání e-mailu biskupovi a synodní radě
    const { data: admins } = await supabase
      .from('uzivatele')
      .select('email')
      .in('role', ['biskup', 'synodalni_rada']);

    if (admins && admins.length > 0) {
      for (const admin of admins) {
        try {
          await sendEmail(admin.email, emailSubject, emailBody);
          console.log(`E-mail odeslán: ${admin.email}`);
        } catch (err) {
          console.error(`Chyba při odesílání e-mailu pro ${admin.email}:`, err);
        }
      }
    }

    // Audit log
    await supabase.from('logs').insert([{
      user_id: 'system',
      akce: 'MONTHLY_STATS_GENERATED',
      tabulka: 'statistics',
      data_po: { rok, mesic, farnosti: stats?.length || 0 },
      created_at: new Date().toISOString()
    }]);

    return new Response(JSON.stringify({ 
      success: true, 
      count: stats?.length || 0,
      totals: { celkemClenu, celkemKresty, celkemBirovani, celkemSvatby, celkemPohreby }
    }), { status: 200 });

  } catch (error) {
    console.error('Chyba v Monthly Statistics:', error instanceof Error ? error.message : 'Neznámá chyba');
    
    return new Response(JSON.stringify({ error: 'Generování statistik selhalo', details: error.message }), { 
      status: 500, 
      headers: { 'Content-Type': 'application/json' } 
    });
  }
});

async function sendEmail(to: string, subject: string, html: string) {
  if (RESEND_API_KEY) {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: 'Farní Agenda <stats@farni-agenda.cz>',
        to: [to],
        subject,
        html
      })
    });
    // Oprava: HTTP chyba API (401/5xx) už není tichá — volající dostane throw
    if (!res.ok) {
      throw new Error(`Resend API vrátilo HTTP ${res.status}`);
    }
  } else if (SENDGRID_API_KEY) {
    const res = await fetch('https://api.sendgrid.com/v3/mail/send', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${SENDGRID_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        personalizations: [{ to: [{ email: to }] }],
        from: { email: 'stats@farni-agenda.cz', name: 'Farní Agenda' },
        subject,
        html_content: html
      })
    });
    if (!res.ok) {
      throw new Error(`SendGrid API vrátilo HTTP ${res.status}`);
    }
  } else {
    // Oprava P0: starý kód jen console.warn → volající si myslel, že e-mail byl odeslán.
    // Nyní throw (volající v handleru chytá a loguje per-admin).
    throw new Error('Není nastaveno žádné e-mailové API (chybí RESEND_API_KEY i SENDGRID_API_KEY)');
  }
}

export { sendEmail };
