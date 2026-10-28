// FARNÍ AGENDA - PROXY (Supabase session refresh) — Next 16: middleware → proxy
// Při každém requestu obnoví session cookie (token refresh), aby SSR stránky
// a API routy vždy viděly platnou session. Doporučený pattern od Supabase pro
// Next.js App Router + @supabase/ssr.

import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

export async function proxy(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      auth: { persistSession: false },
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          // Token refresh → napíšeme nové cookie do response
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // getUser() ověří JWT na auth serveru a při expiraci obnoví token do cookie.
  // Chybu ignorujeme — nepřihlášený uživatel je platný stav (login page).
  await supabase.auth.getUser();

  return supabaseResponse;
}

// Login/logout stránky nevyžadují refresh, ale nevadí. API routy + data stránky ano.
export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
};
