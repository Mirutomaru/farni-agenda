// FARNÍ AGENDA - EDGE FUNCTION (Deno Runtime)
// Audit Logger - Append-only historie změn s delta trackingem
// VSTUP: { action, table, record_id, data_before?, data_after?, userId?, ipAddress?, userAgent? }

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const SENDGRID_API_KEY = Deno.env.get('SENDGRID_API_KEY');
const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');

// === VALIDACE INPUTU ===
interface AuditPayload {
  action: 'INSERT' | 'UPDATE' | 'DELETE';
  table: string;
  record_id: string;
  data_before?: Record<string, unknown> | null;
  data_after?: Record<string, unknown> | null;
  user_id?: string;
  ip_address?: string | null;
  user_agent?: string | null;
}

function validateInput(data: unknown): { valid: boolean; payload?: AuditPayload; error?: string } {
  if (!data || typeof data !== 'object') {
    return { valid: false, error: 'Neplatný vstupní formát' };
  }

  const body = data as Record<string, unknown>;
  
  const action = body.action as string;
  const table = body.table as string;
  const recordId = body.record_id || body.id || null;

  if (!['INSERT', 'UPDATE', 'DELETE'].includes(action)) {
    return { valid: false, error: `Neplatná akce. Povolené hodnoty: INSERT, UPDATE, DELETE` };
  }

  if (!table || typeof table !== 'string') {
    return { valid: false, error: 'Chybí název tabulky (povinný string)' };
  }

  if (!recordId) {
    return { valid: false, error: 'Chybí identifikátor záznamu' };
  }

  const payload: AuditPayload = {
    action: action as 'INSERT' | 'UPDATE' | 'DELETE',
    table,
    record_id: String(recordId),
    data_before: body.data_before || null,
    data_after: body.data_after || null,
    user_id: (body.user_id as string) || 'system',
    ip_address: (body.ip_address as string) || null,
    user_agent: (body.user_agent as string) || null,
  };

  return { valid: true, payload };
}

// === GENEROVÁNÍ HASH PRO INTEGRTU ZÁZNAMU ===
function computeHash(payload: AuditPayload): string {
  const str = [
    payload.record_id,
    payload.table,
    payload.action,
    JSON.stringify(payload.data_before || {}),
    JSON.stringify(payload.data_after || {}),
    payload.user_id,
  ].join('|');

  // Deno Crypto API
  const encoder = new TextEncoder();
  const data = encoder.encode(str);
  
  // Pro jednoduchost použiji base64 hash (v produkci SHA-256)
  let hash = '';
  for (let i = 0; i < str.length; i++) {
    hash += ((str.charCodeAt(i) * 31 + i) % 16).toString(16);
  }
  
  return hash.padStart(32, '0').substring(0, 32);
}

// === ODESLÁNÍ NOTIFIKACE ADMINŮM ===
async function sendNotifications(adminEmails: string[], payload: AuditPayload): Promise<void> {
  const timestamp = new Date().toISOString();
  
  for (const email of adminEmails) {
    try {
      if (!RESEND_API_KEY && !SENDGRID_API_KEY) continue;

      const subject = `🔒 Audit: ${payload.action} na ${payload.table}`;
      
      // Tvorba obsahu notifikace s delta informacemi
      let htmlContent = `<h3>Audit Notifikace</h3>`;
      htmlContent += `<p><strong>Akce:</strong> ${payload.action}</p>`;
      htmlContent += `<p><strong>Tabulka:</strong> ${payload.table}</p>`;
      htmlContent += `<p><strong>Záznam ID:</strong> ${payload.record_id}</p>`;
      htmlContent += `<p><strong>Uživatel:</strong> ${payload.user_id || 'system'}</p>`;
      htmlContent += `<p><strong>Čas:</strong> ${timestamp}</p>`;

      if (payload.data_before && payload.data_after) {
        const changedFields = Object.keys(payload.data_after).filter(
          key => JSON.stringify(payload.data_before![key]) !== JSON.stringify(payload.data_after[key])
        );
        
        if (changedFields.length > 0) {
          htmlContent += `<h4>Změněné pole:</h4><ul>`;
          for (const field of changedFields.slice(0, 5)) { // Max 5 polí pro čitelnost
            const oldVal = JSON.stringify(payload.data_before![field]);
            const newVal = JSON.stringify(payload.data_after[field]);
            htmlContent += `<li>${field}: ${oldVal} → ${newVal}</li>`;
          }
          if (changedFields.length > 5) {
            htmlContent += `<li>... a ${changedFields.length - 5} dalších</li>`;
          }
          htmlContent += `</ul>`;
        }
      }

      const emailPayload = {
        from: 'Farní Agenda <alerts@farni-agenda.cz>',
        to: [email],
        subject,
        html: htmlContent
      };

      if (RESEND_API_KEY) {
        await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${RESEND_API_KEY}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(emailPayload)
        });
      } else if (SENDGRID_API_KEY) {
        await fetch('https://api.sendgrid.com/v3/mail/send', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${SENDGRID_API_KEY}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            personalizations: [{ to: [{ email }] }],
            from: { email: 'alerts@farni-agenda.cz', name: 'Farní Agenda' },
            subject,
            html_content: htmlContent
          })
        });
      }
    } catch (notifyError) {
      // Nefailuje celý audit kvůli chybě notifikace
      console.error(`[AUDIT-LOGGER] Chyba při odesílání notifikace na ${email}:`, 
        notifyError instanceof Error ? notifyError.message : 'Neznámá');
    }
  }
}

// === ZÁPIS DO AUDIT TABULKY ===
async function writeAuditLog(payload: AuditPayload): Promise<boolean> {
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  try {
    await supabase.from('audit_log').insert([{
      user_id: payload.user_id,
      action: payload.action,
      table_name: payload.table,
      record_id: payload.record_id,
      data_before: JSON.stringify(payload.data_before || {}),
      data_after: JSON.stringify(payload.data_after || {}),
      ip_address: payload.ip_address ? String(payload.ip_address) : null,
      user_agent: payload.user_agent,
      created_at: new Date().toISOString(),
      data_hash: computeHash(payload),
    }]);

    console.log(`[AUDIT-LOGGER] ✅ Zapsáno: ${payload.action} na ${payload.table}[${payload.record_id}]`);
    return true;

  } catch (dbError) {
    console.error('[AUDIT-LOGGER] ❌ Chyba při zápisu audit logu:', 
      dbError instanceof Error ? dbError.message : 'Neznámá');
    return false;
  }
}

// === ZÍSKÁNÍ ADMIN EMAILŮ PRO NOTIFIKACE ===
async function getAdminEmails(): Promise<string[]> {
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
  
  try {
    const { data: admins } = await supabase
      .from('uzivatele')
      .select('email')
      .eq('role', 'superadmin');

    return admins?.map(a => a.email).filter(Boolean) || [];
  } catch (error) {
    console.error('[AUDIT-LOGGER] Chyba při načítání adminů:', 
      error instanceof Error ? error.message : 'Neznámá');
    return [];
  }
}

// === MAIN HANDLER ===
serve(async (req: Request) => {
  if (req.method !== 'POST') {
    return new Response(
      JSON.stringify({ error: 'Metoda není povolena' }),
      { status: 405, headers: { 'Content-Type': 'application/json' } }
    );
  }

  try {
    const body = await req.json();
    
    // Validace vstupů
    const validation = validateInput(body);
    if (!validation.valid) {
      return new Response(
        JSON.stringify({ error: validation.error }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const payload = validation.payload!;

    // Zápis do audit logu (append-only)
    const logged = await writeAuditLog(payload);

    if (!logged) {
      return new Response(
        JSON.stringify({ error: 'Zápis audit logu selhal' }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Asynchroní notifikace adminů (neblocking)
    const adminEmails = await getAdminEmails();
    if (adminEmails.length > 0 && ['INSERT', 'UPDATE'].includes(payload.action)) {
      sendNotifications(adminEmails, payload).catch(err => {
        console.error('[AUDIT-LOGGER] Chyba notifikace:', err);
      });
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        logged: true,
        action: payload.action,
        table: payload.table,
        timestamp: new Date().toISOString()
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[AUDIT-LOGGER] ❌ Neočekávaná chyba:', 
      error instanceof Error ? error.message : 'Neznámá');
    
    return new Response(
      JSON.stringify({ 
        error: 'Chyba při zpracování audit logu',
        details: error instanceof Error ? error.message : 'Neznámá'
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
});
