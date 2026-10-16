// FARNÍ AGENDA - EDGE FUNCTION
// Weekly Backup - Týdenní export databáze do Google Cloud Storage
// FIX #10: Sdílená GCP utilita z shared/gcp-auth.ts (místo duplikovaného kódu)

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getGoogleAccessToken } from '../shared/gcp-auth.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const GCP_SERVICE_ACCOUNT_KEY_JSON = Deno.env.get('GCP_SERVICE_ACCOUNT_KEY') || '{}';
const GCS_BUCKET_NAME = Deno.env.get('GCS_BUCKET_NAME') || 'farni-agenda-backups';

// Chunking export pro velkou databázi (omezení edge functions: ~48MB RAM)
async function chunkedExport(supabase: ReturnType<typeof createClient>, table: string, limit: number = 500): Promise<any[]> {
  const allRows: any[] = [];
  let offset = 0;

  while (true) {
    const { data, error } = await supabase
      .from(table)
      .select('*')
      .range(offset, offset + limit - 1);

    if (error) throw new Error(`Export tabulky ${table} selhal: ${error.message}`);
    if (!data || data.length === 0) break;

    allRows.push(...data);

    if (data.length < limit) break; // Poslední stránka
    offset += limit;
  }

  return allRows;
}

serve(async (req: Request) => {
  if (req.method !== 'POST') {
    return new Response(
      JSON.stringify({ error: 'Metoda není povolena' }),
      { status: 405, headers: { 'Content-Type': 'application/json' } }
    );
  }

  try {
    console.log('💾 Weekly Backup spuštěn');

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    // Získání dnešního data pro název souboru
    const now = new Date();
    const timestamp = now.toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const fileName = `backup-${timestamp}.json.gz`;

    const tables = ['farnosti', 'osoby', 'majetek', 'finance', 'logs'];
    const backupData: Record<string, any[]> = {};
    const tableStats: Record<string, number> = {};

    // Export každé tabulky s chunkingem (#5 oprava)
    for (const table of tables) {
      console.log(`Exportování ${table}...`);
      backupData[table] = await chunkedExport(supabase, table, 500);
      tableStats[table] = backupData[table].length;
    }

    const jsonBackup = JSON.stringify(backupData);
    console.log(`Celková velikost backupu: ${(jsonBackup.length / 1024).toFixed(1)} KB`);

    // Upload na GCS - používá sdílenou utilitu (#10 oprava)
    console.log('Nahrávání na GCS...');
    const token = await getGoogleAccessToken(GCP_SERVICE_ACCOUNT_KEY_JSON);

    const uploadUrl = `https://storage.googleapis.com/upload/storage/v1/b/${GCS_BUCKET_NAME}/o?uploadType=media&name=${encodeURIComponent(fileName)}`;

    const uploadResponse = await fetch(uploadUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        'X-Goog-Upload-Protocol': 'raw',
      },
      body: jsonBackup,
    });

    if (!uploadResponse.ok) {
      const errText = await uploadResponse.text();
      throw new Error(`GCS upload failed (${uploadResponse.status}): ${errText}`);
    }

    const gcsUrl = `https://storage.googleapis.com/${GCS_BUCKET_NAME}/${fileName}`;

    // Audit log
    await supabase.from('logs').insert([{
      user_id: 'system',
      akce: 'BACKUP',
      tabulka: 'database',
      data_po: {
        fileName,
        size: jsonBackup.length,
        tables: tableStats,
        gcsUrl,
      },
    }]);

    return new Response(
      JSON.stringify({
        message: 'Backup úspěšně dokončen',
        fileName,
        size: `${(jsonBackup.length / 1024).toFixed(1)} KB`,
        tables: tableStats,
        gcsUrl,
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Chyba v Weekly Backup:', error instanceof Error ? error.message : 'Neznámá chyba');

    return new Response(
      JSON.stringify({
        error: 'Chyba při vytváření zálohy',
        details: error.message,
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
});
