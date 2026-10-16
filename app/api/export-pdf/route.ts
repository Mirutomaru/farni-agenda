// FARNÍ AGENDA - PDF EXPORT ROUTE (P2)
// GET /api/export-pdf?typ=osoby|finance|krestni-zapisky
// Vrací PDF soubor ke stažení (DejaVu font pro diakritiku).

import type { NextRequest } from 'next/server';
import { handlePdfExport } from '@/lib/services/export-service';

export async function GET(request: NextRequest) {
  return await handlePdfExport(request);
}
