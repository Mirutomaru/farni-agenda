// FARNÍ AGENDA - EDGE FUNCTION
// Audit Logger - Odesílání notifikací při změnách v databázi

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const SENDGRID_API_KEY = Deno.env.get('SENDGRID_API_KEY');
const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');

serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response(
      JSON.stringify({ error: 'Metoda není povolena' }),
      { status: 405, headers: { 'Content-Type': 'application/json' } }
    );
  }

  try {
    const body = await req.json();
    const { action, table, record, userId, ipAddress, userAgent } = body;

    console.log(`📋 Audit log: ${action} na ${table}`);

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    // Vytvoření audit záznamu
    await supabase.from('logs').insert([{
      user_id: userId || 'system',
      akce: action,
      tabulka: table,
      objekt_id: record?.id || null,
      data_před: action === 'UPDATE' ? body.oldRecord : null,
      data_po: action === 'CREATE' || action === 'UPDATE' ? record : null,
      ip_adresa: ipAddress || null,
      user_agent: userAgent || null,
      created_at: new Date().toISOString()
    }]);

    // Načtení adminů pro notifikaci
    const { data: admins } = await supabase
      .from('uzivatele')
      .select('*')
      .eq('role', 'superadmin');

    // Tvorba notifikace
    const notification = {
      action,
      table,
      record,
      timestamp: new Date().toISOString()
    };

    // Odeslání notifikace (příklad pro Superadminy)
    if (admins && admins.length > 0) {
      for (const admin of admins) {
        await sendNotification(admin.email || 'unknown@email.cz', notification);
      }
    }

    return new Response(
      JSON.stringify({ success: true, logged: true }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Chyba v Audit Logger:', error instanceof Error ? error.message : 'Neznámá chyba');
    
    return new Response(
      JSON.stringify({ 
        error: 'Chyba při zpracování audit logu',
        details: error.message 
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
});

async function sendNotification(userId: string, notification: any) {
  // Implementace odeslání notifikace (e-mail nebo push)
  if (RESEND_API_KEY) {
    try {
      await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${RESEND_API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          from: 'Farní Agenda <alerts@farni-agenda.cz>',
          to: [userId],
          subject: `🔔 Notifikace: ${notification.action} na ${notification.table}`,
          html: `<p>Akce ${notification.action} byla provedena na tabulce ${notification.table}</p>`
        })
      });
    } catch (err) {
      console.error('Chyba při odesílání notifikace:', err);
    }
  }
}
