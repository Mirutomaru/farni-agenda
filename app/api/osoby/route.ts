// FARNÍ AGENDA - NEXT.JS API ROUTE (THIN LAYER)
// Vytváření/aktualizace osob s server-side šifrováním citlivých polí

import { NextRequest, NextResponse } from 'next/server';
import { saveOsobaService, updateOsobaService } from '@/lib/services/osoba-service';
import { requireUser } from '@/lib/auth/require-user';

export async function POST(request: NextRequest): Promise<NextResponse> {
  // Auth: bez platné session → 401 (service role key obchází RLS, takže auth je nutná)
  const auth = await requireUser();
  if (auth.ok === false) return auth.response;

  return await saveOsobaService(request);
}

export async function PUT(request: NextRequest): Promise<NextResponse> {
  // Auth: bez platné session → 401
  const auth = await requireUser();
  if (auth.ok === false) return auth.response;

  return await updateOsobaService(request);
}
