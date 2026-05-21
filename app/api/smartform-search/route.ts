// FARNÍ AGENDA - NEXT.JS API ROUTE
// Proxy pro Smartform.cz API - chrání API klíč na serveru
import { NextRequest, NextResponse } from 'next/server';

const SMARTFORM_API_KEY = process.env.SMARTFORM_API_KEY;
const SMARTFORM_BASE_URL = 'https://api.smartform.cz/v1';

if (!SMARTFORM_API_KEY) {
  console.error('⚠️ SMARTFORM_API_KEY není nastaven v environment proměnných');
}

export async function GET(request: NextRequest) {
  if (!SMARTFORM_API_KEY) {
    return NextResponse.json(
      { error: 'Smartform API není nakonfigurováno' },
      { status: 503 }
    );
  }

  const searchParams = request.nextUrl.searchParams;
  const query = searchParams.get('query');
  const limit = parseInt(searchParams.get('limit') || '5', 10);

  if (!query || query.length < 2) {
    return NextResponse.json(
      { error: 'Dotaz musí mít alespoň 2 znaky' },
      { status: 400 }
    );
  }

  try {
    const response = await fetch(
      `${SMARTFORM_BASE_URL}/search?query=${encodeURIComponent(query)}&limit=${Math.min(limit, 10)}`,
      {
        headers: {
          'Authorization': `Bearer ${SMARTFORM_API_KEY}`,
          'Content-Type': 'application/json',
        },
        // Cache na 5 minut - adresy se nemění často
        next: { revalidate: 300 }
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Smartform API error (${response.status}): ${errorText}`);
      return NextResponse.json(
        { error: 'Chyba při volání Smartform API' },
        { status: response.status }
      );
    }

    const data = await response.json();
    
    // Normalizace odpovědi - vždy vrátit pole s konzistentní strukturou
    const results: Array<{
      ulice: string;
      cislo_popisne: string;
      cislo_orientacni?: string;
      obec: string;
      psc: string;
      okres?: string;
      kraj?: string;
    }> = [];

    if (data.success && Array.isArray(data.data)) {
      for (const item of data.data) {
        results.push({
          ulice: item.ulice || '',
          cislo_popisne: item.cislo_popisne || '',
          cislo_orientacni: item.cislo_orientacni,
          obec: item.obec || '',
          psc: item.psc || '',
          okres: item.okres,
          kraj: item.kraj,
        });
      }
    }

    return NextResponse.json({ success: true, data: results });

  } catch (error) {
    console.error('Chyba při komunikaci se Smartform API:', error instanceof Error ? error.message : 'Neznámá chyba');
    return NextResponse.json(
      { error: 'Interní chyba serveru' },
      { status: 500 }
    );
  }
}
