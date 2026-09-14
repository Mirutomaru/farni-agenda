// FARNÍ AGENDA - NEXT.JS API ROUTE (THIN LAYER)
// Vytváření/aktualizace osob s server-side šifrováním citlivých polí

import { NextRequest, NextResponse } from 'next/server';
import { saveOsobaService, updateOsobaService } from '@/lib/services/osoba-service';

export async function POST(request: NextRequest): Promise<NextResponse> {
  return await saveOsobaService(request);
}

export async function PUT(request: NextRequest): Promise<NextResponse> {
  return await updateOsobaService(request);
}
