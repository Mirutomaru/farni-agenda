// FARNÍ AGENDA - NEXT.JS API ROUTE (THIN LAYER)
// Generování křestního certifikátu (PDF) — deleguje na certificate-service

import { NextRequest, NextResponse } from 'next/server';
import { POST as handleCertificate } from '@/lib/services/certificate-service';
import { requireUser } from '@/lib/auth/require-user';

export async function POST(request: NextRequest): Promise<NextResponse> {
  // Auth: bez platné session → 401 (service role key obchází RLS, takže auth je nutná)
  const auth = await requireUser();
  if (auth.ok === false) return auth.response;

  return await handleCertificate(request);
}
