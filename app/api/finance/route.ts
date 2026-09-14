// FARNÍ AGENDA - API ROUTE: /api/finance (POST)
// Tenká vrstva — auth + delegace na finance-service.
// Formulář app/finance/new/page.tsx posílá JSON body s finanční operací.

import { requireUser } from '@/lib/auth/require-user';
import { saveFinanceService } from '@/lib/services/finance-service';
import type { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest): Promise<NextResponse> {
  const auth = await requireUser();
  if (auth.ok === false) return auth.response;

  return saveFinanceService(request);
}
