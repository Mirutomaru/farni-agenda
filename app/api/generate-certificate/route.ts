// FARNÍ AGENDA - NEXT.JS API ROUTE (THIN LAYER)
// Deleguje logiku na lib/services/certificate-service

import { NextRequest, NextResponse } from 'next/server';
import { POST as handleCertificate } from '@/lib/services/certificate-service';

export async function POST(request: NextRequest): Promise<NextResponse> {
  return await handleCertificate(request);
}
