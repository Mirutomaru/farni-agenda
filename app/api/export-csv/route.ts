// FARNÍ AGENDA - CSV EXPORT ROUTE (P2)
// GET /api/export-csv?typ=osoby|finance|krestni-zapisky
// Vrací CSV soubor ke stažení (BOM pro Excel + diakritiku).

import type { NextRequest } from 'next/server';
import { handleCsvExport } from '@/lib/services/export-service';

export async function GET(request: NextRequest) {
  return await handleCsvExport(request);
}
