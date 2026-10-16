// FARNÍ AGENDA - SUPABASE EDGE FUNCTION (Deno)
// Náhrada za Firebase birthday-watcher
// Spouštěno externím cronem (např. cron-job.org) každý den v 8:00

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

serve(async (req: Request) => {
  // Ověření metody (povolit pouze POST pro bezpečnost cronu)
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Tato funkce vyžaduje HTTP POST' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  try {
    // Inicializace Supabase klienta (službový klíč pro server-side přístup)
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    console.log('[BIRTHDAY-WATCHER] Start kontrola narozenin...');

    // 1. SQL filtr: Najdi pouze osoby s kulatými narozeninami dnes (násobek 5)
    // Toto volání je velmi rychlé a nezatěžuje databázi stahováním celé tabulky
    const { data: people, error } = await supabase.rpc('check_birthday_notifications');

    if (error) {
      console.error('[BIRTHDAY-WATCHER] Chyba RPC funkce:', error);
      return new Response(JSON.stringify({ success: false, error: error.message }), { status: 500 });
    }

    // 1b. P2: Výročí svatb a smuteční výročí úmrtí (horizont 3 dny)
    let anniversaries: any[] = [];
    const { data: annData, error: annError } = await supabase.rpc('check_anniversary_notifications', { p_days_ahead: 3 });
    if (annError) {
      // RPC chybí (migrace 006 neaplikována) — nenefailuje celý watcher
      console.warn('[BIRTHDAY-WATCHER] Výročí nedostupná:', annError.message);
    } else {
      anniversaries = annData || [];
    }

    // Pokud nemáme žádné narozeniny ani výročí, skončíme (úspora zdrojů)
    if ((!people || people.length === 0) && anniversaries.length === 0) {
      console.log('[BIRTHDAY-WATCHER] Žádné kulaté narozeniny ani výročí.');
      
      // Audit log do DB
      await supabase.from('audit_log').insert({
        user_id: 'system',
        action: 'BIRTHDAY_CHECK_EMPTY',
        table_name: 'osoby',
        data_after: { message: 'Žádné osoby s kulatými narozeninami ani výročí' },
      });

      return new Response(JSON.stringify({ success: true, count: 0, anniversaries: 0, message: 'Žádné narozeniny ani výročí' }), { status: 200 });
    }

    // 2. Načtení adminů pro odeslání reportu
    const { data: admins } = await supabase
      .from('uzivatele')
      .select('id, email')
      .eq('role', 'superadmin')
      .eq('aktivni', true);

    let emailsSent = 0;
    let emailsFailed = 0;
    const today = new Date();
    const dayStr = String(today.getDate()).padStart(2, '0');
    const monthStr = String(today.getMonth() + 1).padStart(2, '0');

    // Tvorba a odeslání emailu pro každého admina
    for (const admin of admins || []) {
      if (!admin.email) continue;

      let htmlBody = '';

      // Nadpis podle obsahu (narozeniny / výročí / obojí)
      const hasBirthdays = people.length > 0;
      if (hasBirthdays && anniversaries.length > 0) {
        htmlBody = `<h1>Upozornění farnosti (${dayStr}.${monthStr})</h1>`;
      } else if (anniversaries.length > 0) {
        htmlBody = `<h1>Nadcházející výročí (${dayStr}.${monthStr})</h1>`;
      } else {
        htmlBody = `<h1>Kulaté narozeniny dnes (${dayStr}.${monthStr})</h1>`;
      }

      if (hasBirthdays) {
        htmlBody += '<ul>';

        for (const person of people) {
          // Dešifrování emailu pouze pro relevantní osoby (max ~5-10 osob, žádný timeout)
          let decryptedEmail = '';
          if (person.email_encrypted) {
            try {
              const key = await deriveEncryptionKey();
              const ivHex = person.email_encrypted.split(':')[0];
              
              // Hex IV -> Uint8Array
              const ivBytes = new Uint8Array(ivHex.match(/.{1,2}/g).map(b => parseInt(b, 16)));
              
              // base64 data -> ArrayBuffer (přesUint8Array)
              const b64Data = person.email_encrypted.split(':')[1];
              const binaryStr = atob(b64Data);
              const encryptedBuffer = new Uint8Array(binaryStr.length);
              for (let i = 0; i < binaryStr.length; i++) {
                encryptedBuffer[i] = binaryStr.charCodeAt(i);
              }

              // Decryption
              const decryptedBuffer = await crypto.subtle.decrypt(
                { name: 'AES-CBC', iv: ivBytes },
                key,
                encryptedBuffer.buffer as ArrayBuffer
              );
              
              decryptedEmail = new TextDecoder().decode(decryptedBuffer);
            } catch (decryptErr) {
              console.error(`[BIRTHDAY-WATCHER] Chyba dešifrování pro ${person.jmeno}:`, decryptErr.message);
              // Pokud se nepodaří dešifrovat, neodesíláme email této osobě
              decryptedEmail = null; 
            }
          }

          htmlBody += `<li><strong>${person.jmeno}</strong> (${person.vek} let)`;
          if (decryptedEmail) {
            htmlBody += ` <span style="color: gray; font-size: 0.8em;">(${decryptedEmail})</span>`;
          }
          htmlBody += '</li>';
        }

        htmlBody += '</ul>';
      }

      // P2: Sekce výročí svatb a smutečních výročí úmrtí
      if (anniversaries.length > 0) {
        const svatby = anniversaries.filter((a: any) => a.typ === 'svatba');
        const pohreby = anniversaries.filter((a: any) => a.typ === 'pohreb');

        htmlBody += '<h2>📅 Nadcházející výročí (3 dny)</h2>';

        if (svatby.length > 0) {
          htmlBody += '<h3>Výročí svatb</h3><ul>';
          for (const a of svatby) {
            const when = a.dni_do_vyroci === 0 ? 'dnes' : `za ${a.dni_do_vyroci} dnů`;
            htmlBody += `<li>💍 <strong>${a.jmeno}</strong> — ${a.let + 1}. výročí (${when}, svatba z ${new Date(a.datum_puvodni).toLocaleDateString('cs-CZ')})</li>`;
          }
          htmlBody += '</ul>';
        }

        if (pohreby.length > 0) {
          htmlBody += '<h3>Smuteční výročí úmrtí</h3><ul>';
          for (const a of pohreby) {
            const when = a.dni_do_vyroci === 0 ? 'dnes' : `za ${a.dni_do_vyroci} dnů`;
            htmlBody += `<li>🕊️ <strong>${a.jmeno}</strong> — ${a.let + 1}. smuteční rok (${when}, úmrtí ${new Date(a.datum_puvodni).toLocaleDateString('cs-CZ')})</li>`;
          }
          htmlBody += '</ul>';
        }
      }

      htmlBody += '<p>Systém Farní Agenda</p>';

      // Předmět podle obsahu
      const subject = hasBirthdays && anniversaries.length > 0
        ? `🎂 Narozeniny + 📅 výročí - ${dayStr}.${monthStr}`
        : anniversaries.length > 0
          ? `📅 Nadcházející výročí - ${dayStr}.${monthStr}`
          : `🎂 Kulaté narozeniny - ${dayStr}.${monthStr}`;

      // Odeslání přes Resend nebo SendGrid (podle env)
      const resendKey = Deno.env.get('RESEND_API_KEY');
      const sendgridKey = Deno.env.get('SENDGRID_API_KEY');

      if (resendKey) {
        try {
          const res = await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: { 
              Authorization: `Bearer ${resendKey}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              from: 'Farní Agenda <noreply@farni-agenda.cz>',
              to: [admin.email],
              subject,
              html: htmlBody,
            }),
          });

          if (res.ok) emailsSent++; else emailsFailed++;
        } catch (e) {
          console.error(`[BIRTHDAY-WATCHER] Chyba Resend pro admina ${admin.id}:`, e.message);
          emailsFailed++;
        }
      } else if (sendgridKey) {
        try {
          const res = await fetch('https://api.sendgrid.com/v3/mail/send', {
            method: 'POST',
            headers: { 
              Authorization: `Bearer ${sendgridKey}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              personalizations: [{ to: [{ email: admin.email }] }],
              from: { email: 'noreply@farni-agenda.cz', name: 'Farní Agenda' },
              subject,
              content: [{ type: 'text/html', value: htmlBody }],
            }),
          });

          if (res.ok) emailsSent++; else emailsFailed++;
        } catch (e) {
          console.error(`[BIRTHDAY-WATCHER] Chyba SendGrid pro admina ${admin.id}:`, e.message);
          emailsFailed++;
        }
      }
    }

    // Audit log úspěchu/nehody
    await supabase.from('audit_log').insert({
      user_id: 'system',
      action: 'BIRTHDAY_NOTIFICATION_SENT',
      table_name: 'osoby',
      data_after: { 
        pocet_narozenin: people.length, 
        pocet_vyroci: anniversaries.length,
        odeslane_emaily: emailsSent, 
        selhane_emaily: emailsFailed 
      },
    });

    return new Response(JSON.stringify({ success: true, count: people.length, anniversaries: anniversaries.length }), { status: 200 });

  } catch (err) {
    console.error('[BIRTHDAY-WATCHER] Kritická chyba:', err);
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
});

// Helper pro odvození klíče z env var (PBKDF2 -> AES-256)
async function deriveEncryptionKey(): Promise<CryptoKey> {
  const rawKey = Deno.env.get('ENCRYPTION_KEY') || '';
  if (!rawKey) throw new Error('Chybí ENCRYPTION_KEY v Edge Function');

  // PBKDF2 pro odvození klíče (stejné jako v encryption.ts na backendu)
  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw', 
    encoder.encode(rawKey), 
    { name: 'PBKDF2' }, 
    false, 
    ['deriveKey']
  );

  return await crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: new Uint8Array(16), iterations: 100000, hash: 'SHA-256' },
    keyMaterial,
    { name: 'AES-CBC', length: 256 },
    false,
    ['decrypt'] // Edge Function jen dešifruje, nepotřebuje encrypt
  );
}
