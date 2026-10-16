-- FARNÍ AGENDA - BIRTHDAY WATCHER MIGRACE (pg_cron + Edge Function)
-- Původní Firebase function → Supabase pg_cron pro detekci + Edge Function pro notifikace
-- 
-- DŮLEŽITÉ: datum_narozeni NENÍ šifrováný → lze přímo filtrovat v DB
-- email JE šifrovaný → dešifruje se až po nalezení relevantních osob

-- === 1. SQL FUNKCE PRO DETEKCI NAROZENIN ===

CREATE OR REPLACE FUNCTION check_birthday_notifications()
RETURNS TABLE (
  person_id uuid,
  jmeno text,
  vek integer,
  email_encrypted text,
  farnost_id uuid
) AS $$
DECLARE
  today_day INTEGER := EXTRACT(DAY FROM CURRENT_DATE)::INTEGER;
  today_month INTEGER := EXTRACT(MONTH FROM CURRENT_DATE)::INTEGER;
BEGIN
  -- Načteme osoby s kulatými narozeninami dnes (násobek 5 let)
  RETURN QUERY
    SELECT 
      o.id,
      o.krestni_jmeno || ' ' || o.prijmeni AS jmeno,
      EXTRACT(YEAR FROM CURRENT_DATE)::INTEGER - EXTRACT(YEAR FROM o.datum_narozeni::date)::INTEGER AS vek,
      o.email_encrypted,
      o.farnost_id
    FROM osoby o
    WHERE o.clenstvi_status = 'aktivni'
      AND EXTRACT(DAY FROM o.datum_narozeni::date) = today_day
      AND EXTRACT(MONTH FROM o.datum_narozeni::date) = today_month
      AND (EXTRACT(YEAR FROM CURRENT_DATE)::INTEGER - EXTRACT(YEAR FROM o.datum_narozeni::date)::INTEGER) > 0
      AND ((EXTRACT(YEAR FROM CURRENT_DATE)::INTEGER - EXTRACT(YEAR FROM o.datum_narozeni::date)::INTEGER)) % 5 = 0;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- === 2. EDGES FUNCTION PRO ODESILANI NOTIFIKACI (migrace z Firebase sendEmailViaProvider) ===

/*
Název funkce: birthday-notification-service
Endpoint: https://your-project.supabase.co/functions/v1/birthday-notifications

Request body: {} (prázdné, funkce si sama zavolá check_birthday_notifications())

Response: {
  success: boolean,
  count: number,
  emails_sent: number,
  emails_failed: number,
  people: Array<{ jmeno: string, vek: integer }>
}

TODO: Vytvořit Edge Function v Supabase Dashboard s tímto kódem (Deno runtime):

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
const SUPABASE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');
const SENDGRID_API_KEY = Deno.env.get('SENDGRID_API_KEY');

serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Only POST allowed' }), { 
      status: 405, 
      headers: { 'Content-Type': 'application/json' } 
    });
  }

  try {
    const supabase = createClient(SUPABASE_URL!, SUPABASE_KEY!);

    // Zavoláme SQL funkci pro získání osob s kulatými narozeninami
    const { data: people, error } = await supabase.rpc('check_birthday_notifications');
    
    if (error) throw error;
    if (!people || people.length === 0) {
      return new Response(JSON.stringify({ 
        success: true, 
        count: 0, 
        message: 'Žádné kulaté narozeniny dnes' 
      }), { status: 200 });
    }

    // Získání superadminů pro odeslání notifikace
    const { data: admins } = await supabase
      .from('uzivatele')
      .select('id, email')
      .eq('role', 'superadmin')
      .eq('aktivni', true);

    let emails_sent = 0;
    let emails_failed = 0;

    // Tvorba e-mailového obsahu
    const today = new Date();
    const day = today.getDate();
    const month = today.getMonth() + 1;

    for (const admin of admins || []) {
      if (!admin.email) continue;

      let emailBody = `<h1>Kulaté narozeniny dnes (${day}.${month})</h1>`;
      emailBody += '<ul>';

      for (const person of people) {
        // Dešifrování emailu pro každou osobu
        let personEmail = '';
        if (person.email_encrypted) {
          try {
            const parts = person.email_encrypted.split(':');
            if (parts.length === 2) {
              const key = await deriveKeyFromEnv(); // Funkce musí být v Edge Function
              const iv = new Uint8Array(parts[0].match(/.{1,2}/g).map(b => parseInt(b, 16)));
              const encryptedData = Uint8.fromBase64(parts[1]);
              
              const decryptedBuffer = await crypto.subtle.decrypt(
                { name: 'AES-CBC', iv }, 
                key, 
                encryptedData.buffer
              );
              personEmail = new TextDecoder().decode(decryptedBuffer);
            }
          } catch (decryptErr) {
            console.warn(`Nelze dešifrovat email pro ${person.jmeno}:`, decryptErr.message);
          }
        }

        emailBody += `<li><strong>${person.jmeno}</strong> (${person.vek} let)`;
        if (personEmail) emailBody += ` - <small>Email: ${personEmail}</small>`;
        emailBody += '</li>';
      }

      emailBody += '</ul>';
      emailBody += '<p>Systém Birthday Watcher</p>';

      // Odeslání emailu
      if (RESEND_API_KEY) {
        const resendRes = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: { 
            'Authorization': `Bearer ${RESEND_API_KEY}`,
            'Content-Type': 'application/json' 
          },
          body: JSON.stringify({
            from: 'Farní Agenda <noreply@farni-agenda.cz>',
            to: [admin.email],
            subject: `🎂 Kulaté narozeniny - ${day}.${month}`,
            html: emailBody,
          }),
        });

        if (resendRes.ok) {
          emails_sent++;
        } else {
          emails_failed++;
        }
      } else if (SENDGRID_API_KEY) {
        const sendgridRes = await fetch('https://api.sendgrid.com/v3/mail/send', {
          method: 'POST',
          headers: { 
            'Authorization': `Bearer ${SENDGRID_API_KEY}`,
            'Content-Type': 'application/json' 
          },
          body: JSON.stringify({
            personalizations: [{ to: [{ email: admin.email }] }],
            from: { email: 'noreply@farni-agenda.cz', name: 'Farní Agenda' },
            subject: `🎂 Kulaté narozeniny - ${day}.${month}`,
            content: [{ type: 'text/html', value: emailBody }],
          }),
        });

        if (sendgridRes.ok) {
          emails_sent++;
        } else {
          emails_failed++;
        }
      }
    }

    // Audit log
    await supabase.from('audit_log').insert({
      user_id: 'system',
      action: 'BIRTHDAY_NOTIFICATION',
      table_name: 'osoby',
      data_after: JSON.stringify({
        pocet_narozenin: people.length,
        odeslane_emaily: emails_sent,
        selhane_emaily: emails_failed,
      }),
    });

    return new Response(JSON.stringify({
      success: true,
      count: people.length,
      emails_sent,
      emails_failed,
      people: people.map(p => ({ jmeno: p.jmeno, vek: p.vek })),
    }), { 
      status: 200, 
      headers: { 'Content-Type': 'application/json' } 
    });

  } catch (error) {
    console.error('Birthday notification error:', error);
    return new Response(JSON.stringify({ error: error.message }), { 
      status: 500, 
      headers: { 'Content-Type': 'application/json' } 
    });
  }
});

// Helper pro odvození klíče z env (Edge Function)
async function deriveKeyFromEnv(): Promise<CryptoKey> {
  const key = Deno.env.get('ENCRYPTION_KEY') || '';
  if (!key) throw new Error('ENCRYPTION_KEY není nastaven v Edge Function');
  
  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode(key.padEnd(32, '\0').slice(0, 32)), // PBKDF2 input musí být alespoň 32 bytes pro AES-256
    { name: 'PBKDF2' },
    false,
    ['deriveKey']
  );
  
  return await crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: new Uint8Array(16), iterations: 100000, hash: 'SHA-256' },
    keyMaterial,
    { name: 'AES-CBC', length: 256 },
    false,
    ['decrypt']
  );
}
*/

-- === 3. pg_cron SCHEDULE (spouští Edge Function denně v 8:00) ===

-- Pomocí pg_net extension pro HTTP volání z SQL
CREATE EXTENSION IF NOT EXISTS net;

SELECT cron.schedule('birthday-watcher-daily', '0 8 * * *', 
  $$
    SELECT net.http_post(
      'https://your-project.supabase.co/functions/v1/birthday-notifications',
      '{}'::text,
      array[ARRAY['Authorization', 'Bearer YOUR_SERVICE_KEY']]::text[]
    )
  $$
);

-- ALTERNATIVA: Pokud nemáte pg_net nebo Business plan s pg_cron
-- Použijte externí cron job (např. na vašem serveru):
-- curl -X POST https://your-project.supabase.co/functions/v1/birthday-notifications \
--   -H 'Authorization: Bearer YOUR_SERVICE_KEY' \
--   -H 'Content-Type: application/json' \
--   -d '{}'

-- === 4. VERIFIKACE A TESTOVANI ===

-- Test funkce manuálně:
SELECT * FROM check_birthday_notifications();

-- Kontrola pg_cron schedule:
SELECT * FROM cron.job WHERE jobname = 'birthday-watcher-daily';

-- Kontrola audit logu po spuštění:
SELECT * FROM audit_log 
WHERE action = 'BIRTHDAY_NOTIFICATION' 
ORDER BY created_at DESC 
LIMIT 10;
