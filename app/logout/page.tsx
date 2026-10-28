// FARNÍ AGENDA - LOGOUT PAGE (Server Component)
// GET /logout — odhlásí uživatele a přesměruje na login
// Layout odkazuje na /logout; stránka volá signOut() + redirect.

import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';

export default async function LogoutPage() {
  const supabase = await createClient();

  // Defenzivně: i kdyby signOut selhal (např. placeholder env),
  // cookie se smaže a uživatel skončí na loginu
  try {
    await supabase.auth.signOut();
  } catch {
    // signOut může hodit při chybě sítě — lokální session je
    // v tu chvíli už vyčištěná, redirect proběhne dál
  }

  redirect('/login');
}
