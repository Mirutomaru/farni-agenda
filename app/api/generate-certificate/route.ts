// FARNÍ AGENDA - NEXT.JS API ROUTE
// Generování certifikátů (křestní/birovací listiny)
// Deleguje na Edge Function certificates-generator pro PDF generování

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const personId = body.personId; // oprava: name zpersonId na personId
    const type = body.type as 'krest' | 'birovan';

    if (!personId || !type) {
      return NextResponse.json(
        { error: 'Chybí personId nebo type' },
        { status: 400 }
      );
    }

    if (type !== 'krest' && type !== 'birovan') {
      return NextResponse.json(
        { error: 'Neplatný typ certifikátu. Povolené hodnoty: krest, birovani' },
        { status: 400 }
      );
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
    
    const supabase = createClient(supabaseUrl, serviceKey);

    // Nejprve ověříme existenci záznamu
    let dbTable: string;
    if (type === 'krest') {
      dbTable = 'krestni_zapis';
    } else {
      dbTable = 'birovani_zapis';
    }

    const { data: existingRecord, error: fetchError } = await supabase
      .from(dbTable)
      .select('id')
      .eq('id', personId)
      .maybeSingle(); // maybeSingle místo single - vrací null místo chyby pro 0 rows

    if (fetchError) {
      return NextResponse.json(
        { error: 'Chyba při načítání záznamu' },
        { status: 500 }
      );
    }

    if (!existingRecord) {
      return NextResponse.json(
        { error: `Záznam o ${type === 'krest' ? 'křtu' : 'birování'} nebyl nalezen` },
        { status: 404 }
      );
    }

    // Delegace na Edge Function pro generování PDF
    const { data: certResult, error: funcError } = await supabase.functions.invoke('certificates-generator', {
      body: { personId, type }
    });

    if (funcError) {
      console.error('Edge function error:', funcError);
      return NextResponse.json(
        { error: 'Generování certifikátu selhalo na serveru' },
        { status: 502 }
      );
    }

    // Audit log - tentokrát s reálným user_id z auth tokenů requestu
    const authHeader = request.headers.get('authorization') || '';
    const userId = authHeader.replace('Bearer ', '') || null;

    await supabase.from('logs').insert([{
      user_id: userId,
      akce: 'CERTIFICATE_GENERATED',
      tabulka: type === 'krest' ? 'krestni_zapis' : 'birovani_zapis',
      objekt_id: personId,
      data_po: { url: (certResult as any).url },
    }]);

    return NextResponse.json({ success: true, ...(certResult as object) });

  } catch (error) {
    console.error('Chyba při generování certifikátu:', error instanceof Error ? error.message : 'Neznámá chyba');
    
    return NextResponse.json(
      { error: 'Generování selhalo', details: error instanceof Error ? error.message : 'Neznámá chyba' },
      { status: 500 }
    );
  }
}
