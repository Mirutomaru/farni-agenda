// FARNÍ AGENDA - EMAIL SIGNIN (API)
// Handles email/password authentication

import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';

export async function POST(request: Request) {
  const url = new URL(request.url);
  const origin = process.env.NEXT_PUBLIC_SITE_URL || `${url.protocol}//${url.hostname}${url.port ? ':' + url.port : ''}`;
  
  const formData = await request.formData();
  const email = formData.get('email') as string;
  const password = formData.get('password') as string;

  if (!email || !password) {
    return new Response(JSON.stringify({ error: 'Email and password are required' }), { 
      status: 400, 
      headers: { 'Content-Type': 'application/json' } 
    });
  }

  const supabase = await createClient();
  
  // Email/password sign-in
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    return new Response(JSON.stringify({ 
      error: 'Nepodařilo se přihlásit. Zkontrolujte vaše přihlašovací údaje.' 
    }), { status: 401, headers: { 'Content-Type': 'application/json' } });
  }

  // Redirect to dashboard after successful sign-in
  // Přehledová stránka je v / (app/page.tsx), ne /dashboard
  redirect('/');
}
