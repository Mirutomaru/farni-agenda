// FARNÍ AGENDA - SUPABASE CLIENT (browser)
// Vytvoří Supabase klienta pro použití v client komponentách.
//
// PŘEDTÍM (audit 007): createClient z @supabase/supabase-js ukládal session do
// localStorage → SSR stránky ji neviděly a RLS videlo auth.uid() = NULL.
// Teď: createBrowserClient z @supabase/ssr ukládá session do COOKIES, které
// sdílí s server klientem (lib/supabase/server.ts) — jeden zdroj pravdy.

import { createBrowserClient } from '@supabase/ssr';

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
