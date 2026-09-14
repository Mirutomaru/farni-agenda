// FARNÍ AGENDA - NEXT.JS API ROUTE (THIN LAYER)
// Deleguje logiku na lib/services/smartform-service

import { NextRequest, NextResponse } from 'next/server';
import { GET as handleSearch } from '@/lib/services/smartform-service';
import { requireUser } from '@/lib/auth/require-user';

export async function GET(request: NextRequest): Promise<NextResponse> {
  // Auth: bez platné session → 401 (service role key obchází RLS, takže auth je nutná)
  const auth = await requireUser();
  if (auth.ok === false) return auth.response;

  return await handleSearch(request);
}
