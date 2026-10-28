// FARNÍ AGENDA - AUTH SIGNIN (server action)
// Handles Google OAuth sign-in redirect

import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { loggerFromRequest } from '@/lib/logging/logger';

export async function GET(request: Request) {
  const log = loggerFromRequest(request, 'AUTH');
  const url = new URL(request.url);
  const origin = process.env.NEXT_PUBLIC_SITE_URL || `${url.protocol}//${url.hostname}${url.port ? ':' + url.port : ''}`;
  
  const supabase = await createClient();
  
  // Google OAuth redirect — callback route je v /api/auth/callback
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: `${origin}/api/auth/callback`,
      scopes: 'email profile',
    },
  });

  if (error) {
    log.error('Auth error', {}, error);
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }

  // Redirect to OAuth provider
  redirect(data.url);
}
