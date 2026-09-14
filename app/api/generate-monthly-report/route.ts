// FARNÍ AGENDA - NEXT.JS API ROUTE (THIN LAYER)
// Deleguje logiku na lib/services/report-service

import { NextRequest, NextResponse } from 'next/server';
import { POST as handleReport } from '@/lib/services/report-service';

export async function POST(request: NextRequest): Promise<NextResponse> {
  return await handleReport(request);
}
