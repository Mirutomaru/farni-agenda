// FARNÍ AGENDA - API ROUTE: /api/majetek (POST)
// Tenká vrstva — auth + delegace na majetek-service.
// Formulář app/majetek/new/page.tsx posílá JSON body se záznamem o majetku.

import { requireUser } from '@/lib/auth/require-user';
import { saveMajetekService } from '@/lib/services/majetek-service';
import type { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest): Promise<NextResponse> {
  const auth = await requireUser();
  if (auth.ok === false) return auth.response;

  return saveMajetekService(request);
}
