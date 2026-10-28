// FARNÍ AGENDA - AUTH HELPER PRO API ROUTES
// Ověření přihlášeného uživatele (Supabase session cookie) v route handleru.
//
// Použití:
//   const auth = await requireUser();
//   if (!auth.ok) return auth.response; // 401 JSON
//   // auth.user je k dispozici dál

import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

export type AuthResult =
  | { ok: true; user: any }
  | { ok: false; response: NextResponse };

/**
 * Ověří session aktuálního requestu (cookie) a vrátí uživatele.
 * - Neplatná/chybějící session → { ok: false, response: 401 JSON }
 * - Platná session → { ok: true, user }
 */
export async function requireUser(): Promise<AuthResult> {
  const supabase = await createClient();

  // getUser() ověří JWT na auth serveru (ne jen decode) — bezpečnější než getSession()
  const { data: { user }, error } = await supabase.auth.getUser();

  if (error || !user) {
    return { ok: false, response: unauthorizedResponse() };
  }

  return { ok: true, user };
}

/** Standardní 401 odpověď pro neautorizované requesty. */
export function unauthorizedResponse(message = 'Neautorizováno — přihlaste se'): NextResponse {
  return NextResponse.json({ error: message }, { status: 401 });
}
