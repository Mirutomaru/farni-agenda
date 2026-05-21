// FARNÍ AGENDA - NEXT.JS API ROUTE
// Generování měsíčního reportu pro synodu

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { rok, mesic } = body;

    if (!rok || !mesic) {
      return NextResponse.json({ error: 'Chybí rok nebo měsíc' }, { status: 400 });
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
    
    const supabase = createClient(supabaseUrl, serviceKey);

    const { data: stats, error } = await supabase.rpc('get_monthly_statistics', { rok, mesic });

    if (error) throw error;

    let emailBody = `<h1>Měsíční statistiky Starokatolické církve</h1>`;
    emailBody += `<p>Období: ${String(mesic).padStart(2, '0')}/${rok}</p>`;
    
    emailBody += '<table border="1" cellpadding="8" style="border-collapse: collapse;">';
    emailBody += '<tr><th>Farnost</th><th>Členů</th><th>Křty</th><th>Birování</th><th>Svatby</th><th>Pohřby</th></tr>';

    let celkemClenu = 0, kresty = 0, birovani = 0, svatby = 0, pohreby = 0;

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
      kresty += stat.kresty || 0;
      birovani += stat.birovani || 0;
      svatby += stat.svatby || 0;
      pohreby += stat.pohreby || 0;
    }

    emailBody += '</table>';
    
    emailBody += `<h2>Celkem za církev:</h2>`;
    emailBody += `<ul>
      <li><strong>Členů:</strong> ${celkemClenu}</li>
      <li><strong>Křty:</strong> ${kresty}</li>
      <li><strong>Birování:</strong> ${birovani}</li>
      <li><strong>Svatby:</strong> ${svatby}</li>
      <li><strong>Pohřby:</strong> ${pohreby}</li>
    </ul>`;

    const { data: admins } = await supabase
      .from('uzivatele')
      .select('email')
      .in('role', ['biskup', 'synodalni_rada']);

    if (admins && admins.length > 0) {
      for (const admin of admins) {
        try {
          await sendEmail(admin.email, `📊 Statistiky - ${String(mesic).padStart(2, '0')}/${rok}`, emailBody);
        } catch (err) {
          console.error(`Chyba při odesílání e-mailu pro ${admin.email}:`, err);
        }
      }
    }

    return NextResponse.json({ 
      success: true, 
      count: stats?.length || 0,
      totals: { celkemClenu, kresty, birovani, svatby, pohreby }
    });

  } catch (error) {
    console.error('Chyba při generování reportu:', error instanceof Error ? error.message : 'Neznámá chyba');
    
    return NextResponse.json(
      { error: 'Generování reportu selhalo', details: error instanceof Error ? error.message : 'Neznámá chyba' },
      { status: 500 }
    );
  }
}

async function sendEmail(to: string, subject: string, html: string) {
  const resendApiKey = process.env.RESEND_API_KEY;
  const sendgridApiKey = process.env.SENDGRID_API_KEY;

  if (resendApiKey) {
    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${resendApiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: 'Farní Agenda <stats@farni-agenda.cz>',
        to: [to],
        subject,
        html
      })
    });
  } else if (sendgridApiKey) {
    await fetch('https://api.sendgrid.com/v3/mail/send', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${sendgridApiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        personalizations: [{ to: [{ email: to }] }],
        from: { email: 'stats@farni-agenda.cz', name: 'Farní Agenda' },
        subject,
        html_content: html
      })
    });
  } else {
    throw new Error('Není nastaveno žádné e-mailové API');
  }
}
