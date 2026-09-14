// FARNÍ AGENDA - NEXT.JS API ROUTE (THIN LAYER)
// Deleguje logiku na lib/services/smartform-service

import { NextRequest, NextResponse } from 'next/server';
import { GET as handleSearch } from '@/lib/services/smartform-service';

export async function GET(request: NextRequest): Promise<NextResponse> {
  return await handleSearch(request);
}
