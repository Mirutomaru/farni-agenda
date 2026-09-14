// FARNÍ AGENDA - AUTH CALLBACK (server action)
// Handles OAuth callback after Google sign-in redirect

import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { loggerFromRequest } from '@/lib/logging/logger';

export async function GET(request: Request) {
  const log = loggerFromRequest(request, 'AUTH');
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  
  if (!code) {
    return new Response(JSON.stringify({ error: 'No OAuth code provided' }), { status: 400 });
  }

  const supabase = createClient();
  
  // Exchange code for session
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    log.error('Auth callback error', {}, error);
    redirect('/login?error=auth_failed');
  }

  // Redirect to dashboard after successful authentication
  // Přehledová stránka je v / (app/page.tsx), ne /dashboard
  redirect('/');
}
