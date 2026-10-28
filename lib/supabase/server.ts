// FARNÍ AGENDA - SUPABASE SERVER CLIENT (SSR)
// Správný Supabase SSR pattern: ANON klíč + session v cookies.
//
// PŘEDTÍM (audit 007): service_role klíč bez cookies → RLS se obcházelo a
// auth.uid() bylo vždy NULL (session nebyla z requestu načtená).
// Teď: createServerClient čte session cookie z requestu, takže RLS funguje
// a data jsou omezena na farnosti přihlášeného uživatele.
//
// POZOR: funkce je ASYNC (Next 15+ cookies() vrací Promise) — volající musí awaitovat.

import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      auth: { persistSession: false },
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            // Route handler → Set-Cookie hlavičky se napíšou do response.
            // Server Component → Next to dovolí, ale varuje; middleware (middleware.ts)
            // session stejně obnovuje, takže selhání tady není kritické.
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // ignorováno — viz výše
          }
        },
      },
    },
  );
}
