// FARNÍ AGENDA - AUTH SIGNIN (server action)
// Handles Google OAuth sign-in redirect

import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';

export async function GET(request: Request) {
  const url = new URL(request.url);
  const origin = process.env.NEXT_PUBLIC_SITE_URL || `${url.protocol}//${url.hostname}${url.port ? ':' + url.port : ''}`;
  
  const supabase = createClient();
  
  // Google OAuth redirect
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: `${origin}/auth/callback`,
      scopes: 'email profile',
    },
  });

  if (error) {
    console.error('Auth error:', error);
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }

  // Redirect to OAuth provider
  redirect(data.url);
}
