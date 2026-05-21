// FARNÍ AGENDA - EDGE FUNCTION
// Birthday Watcher - Kontrola kulatých narozenin a odesílání e-mailů
// Klíčová oprava: PBKDF2 key derivation (stejná jako encrypt/route.ts)

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const SENDGRID_API_KEY = Deno.env.get('SENDGRID_API_KEY');
const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');
const ENCRYPTION_KEY = Deno.env.get('ENCRYPTION_KEY');

if (!ENCRYPTION_KEY) {
  console.warn('⚠️  ENCRYPTION_KEY není nastaven, dešifrování emailů nebude fungovat');
}

// Sdílená derivace klíče: PBKDF2 s SHA-256, 100k iterací, 32-byte výstup
// Identická implementace jako v app/api/encrypt/route.ts - bez toho nelze dešifrovat
async function deriveKey(password: string): Promise<CryptoKey> {
  const encoder = new TextEncoder();
  const salt = encoder.encode('farni-agenda-salt');
  
  // PBKDF2 derivace — MUSÍ odpovídat encrypt/route.ts (100k iterací, SHA-256)
  const baseKey = await crypto.subtle.importKey(
    'raw',
    encoder.encode(password),
    { name: 'PBKDF2' },
    false,
    ['deriveBits']
  );
  
  const derivedBits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt: salt,
      iterations: 100_000,
      hash: 'SHA-256'
    },
    baseKey,
    256 // 32 bytes = 256 bits for AES-256
  );
  
  return crypto.subtle.importKey(
    'raw',
    derivedBits,
    { name: 'AES-CBC' },
    false,
    ['decrypt']
  );
}

async function decryptField(encryptedValue: string): Promise<string | null> {
  if (!ENCRYPTION_KEY) {
    console.warn('Nelze dešifrovat - ENCRYPTION_KEY není nastaven');
    return null;
  }

  try {
    const key = await deriveKey(ENCRYPTION_KEY);

    // Formát: iv(hex):encrypted(base64) - shodný s encrypt/route.ts
    const parts = encryptedValue.split(':');
    if (parts.length !== 2) throw new Error('Neplatný formát šifrovaných dat');

    const hex = parts[0];
    if (hex.length % 2 !== 0 || !/^[0-9a-fA-F]+$/.test(hex)) {
      throw new Error('IV není validní hex string');
    }
    
    const iv = new Uint8Array(hex.match(/.{1,2}/g)!.map(b => parseInt(b, 16)));

    // base64 -> ArrayBuffer
    const binaryString = atob(parts[1]);
    const encryptedData = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      encryptedData[i] = binaryString.charCodeAt(i);
    }

    const decryptedBuffer = await crypto.subtle.decrypt({ name: 'AES-CBC', iv }, key, encryptedData);
    return new TextDecoder().decode(decryptedBuffer);
  } catch (err) {
    console.warn(`Chyba při dešifrování: ${err.message}`);
    return null;
  }
}

serve(async (req: Request) => {
  if (req.method !== 'POST') {
    return new Response(
      JSON.stringify({ error: 'Metoda není povolena' }),
      { status: 405, headers: { 'Content-Type': 'application/json' } }
    );
  }

  try {
    console.log('🎂 Birthday Watcher spuštěn');

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    // Získání dnešního data
    const today = new Date();
    const day = today.getDate();
    const month = today.getMonth() + 1;

    console.log(`Kontrola narozenin pro: ${day}.${month}`);

    // Načteme jen osoby s email_encrypted a datum_narozeni v aktuálním měsíci
    // FIX: clenstvi_status místo status (sjednocení se schema-v2/v3)
    const { data: osoby, error: personsError } = await supabase
      .from('osoby')
      .select(`
        id, krestni_jmeno, prijmeni, datum_narozeni,
        email_encrypted, farnost_id, role_cirkinni, clenstvi_status
      `)
      .eq('clenstvi_status', 'aktivni');

    if (personsError) throw personsError;

    console.log(`Načteno ${osoby?.length || 0} aktivních osob`);

    const birthdayPeople: Array<{
      id: string;
      jmeno: string;
      vek?: number;
      email?: string;
      farnost_id: string;
    }> = [];

    for (const osoba of osoby || []) {
      const birthDate = new Date(osoba.datum_narozeni);
      const birthDay = birthDate.getDate();
      const birthMonth = birthDate.getMonth() + 1;

      if (birthDay === day && birthMonth === month) {
        const age = today.getFullYear() - birthDate.getFullYear();
        const isKulata = age > 0 && age % 5 === 0;

        if (!isKulata) continue;

        // Dešifrování emailu
        let email: string | undefined;
        if (osoba.email_encrypted) {
          try {
            const encryptedStr = typeof osoba.email_encrypted === 'string'
              ? osoba.email_encrypted
              : '';

            if (encryptedStr) {
              email = await decryptField(encryptedStr);
            }
          } catch (err) {
            console.warn(`Nelze dešifrovat email pro ${osoba.krestni_jmeno} ${osoba.prijmeni}`);
          }
        }

        birthdayPeople.push({
          id: osoba.id,
          jmeno: `${osoba.krestni_jmeno} ${osoba.prijmeni}`,
          vek: age,
          email,
          farnost_id: osoba.farnost_id!,
        });
      }
    }

    if (birthdayPeople.length === 0) {
      return new Response(
        JSON.stringify({ message: 'Žádné kulaté narozeniny dnes', count: 0 }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Našli jsme ${birthdayPeople.length} osob s kulatými narozeninami`);

    // Načtení Superadminů pro odeslání reportu
    const { data: superadmins, error: adminsError } = await supabase
      .from('uzivatele')
      .select('*')
      .eq('role', 'superadmin')
      .eq('aktivni', true);

    if (adminsError) throw adminsError;

    // Tvorba e-mailového obsahu
    const emailSubject = `🎂 Kulaté narozeniny ve Starokatolické církvi - ${day}.${month}`;

    let emailBody = `<h1>Kulaté narozeniny dnes (${day}.${month})</h1>`;
    emailBody += `<p>Dnes slaví kulaté narozeniny následující členové naší církve:</p>`;
    emailBody += '<ul>';

    for (const osoba of birthdayPeople) {
      emailBody += `
        <li>
          <strong>${osoba.jmeno}</strong>
          ${osoba.vek ? `(věk: ${osoba.vek})` : ''}
          ${osoba.email ? `<br><small>Email: ${osoba.email}</small>` : ''}
        </li>
      `;
    }

    emailBody += '</ul>';
    emailBody += '<p>Systém Birthday Watcher</p>';

    // Odeslání e-mailů Superadminům
    const sentEmails: Array<{ adminId: string; success: boolean }> = [];

    for (const admin of superadmins || []) {
      try {
        if (!admin.email) continue;

        await sendEmailViaProvider(admin.email, emailSubject, emailBody);

        sentEmails.push({ adminId: admin.id, success: true });
        console.log(`E-mail odeslán na ${admin.email}`);
      } catch (err) {
        console.error(`Chyba při odeslání e-mailu pro admina ${admin.id}:`, err);
        sentEmails.push({ adminId: admin.id, success: false });
      }
    }

    // Audit log
    await supabase.from('logs').insert([{
      user_id: 'system',
      akce: 'BIRTHDAY_CHECK',
      tabulka: 'osoby',
      data_po: {
        pocet_narozenin: birthdayPeople.length,
        jmena: birthdayPeople.map(p => p.jmeno),
        odeslane_emaily: sentEmails.filter(e => e.success).length,
        selhane_emaily: sentEmails.filter(e => !e.success).length,
      },
    }]);

    return new Response(
      JSON.stringify({
        message: 'Birthday Watcher úspěšně dokončen',
        count: birthdayPeople.length,
        people: birthdayPeople.map(p => ({ jmeno: p.jmeno, vek: p.vek })),
        emailsSent: sentEmails.filter(e => e.success).length,
        emailsFailed: sentEmails.filter(e => !e.success).length,
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Chyba v Birthday Watcher:', error instanceof Error ? error.message : 'Neznámá chyba');

    return new Response(
      JSON.stringify({
        error: 'Chyba při zpracování narozenin',
        details: error.message,
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
});

// Abstrakce email provideru (Resend nebo SendGrid)
async function sendEmailViaProvider(to: string, subject: string, html: string) {
  if (RESEND_API_KEY) {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'Farní Agenda <noreply@farni-agenda.cz>',
        to: [to],
        subject,
        html,
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Resend error (${response.status}): ${errText}`);
    }
  } else if (SENDGRID_API_KEY) {
    const response = await fetch('https://api.sendgrid.com/v3/mail/send', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${SENDGRID_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        personalizations: [{ to: [{ email: to }] }],
        from: { email: 'noreply@farni-agenda.cz', name: 'Farní Agenda' },
        subject,
        content: [{ type: 'text/html', value: html }],
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`SendGrid error (${response.status}): ${errText}`);
    }
  } else {
    console.warn('Není nastaveno žádné e-mailové API (SendGrid nebo Resend)');
    throw new Error('Žádné emailové API není nakonfigurováno');
  }
}
