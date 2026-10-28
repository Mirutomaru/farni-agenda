// FARNÍ AGENDA - LOGIN PAGE (Server Component)
// Stránka pro přihlášení přes Google OAuth

import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import Link from 'next/link';

export default async function LoginPage() {
  // Pokud je uživatel už přihlášený, přesměruj na dashboard
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  
  if (user) {
    // Přehledová stránka je v / (app/page.tsx), ne /dashboard
    redirect('/');
  }

  return (
    <div className="min-h-[calc(100vh-240px)] flex items-center justify-center">
      <div className="card max-w-md w-full">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Farní Agenda</h1>
          <p className="text-gray-600">Informační systém Starokatolické církve v ČR</p>
        </div>

        {/* Google Sign-In Button */}
        <form action="/api/auth/signin" method="get" className="mb-6">
          <button
            type="submit"
            className="w-full flex items-center justify-center gap-3 px-4 py-3 bg-white border border-gray-300 rounded-lg font-medium text-gray-700 hover:bg-gray-50 transition-colors shadow-sm"
          >
            {/* Google Logo SVG */}
            <svg width="20" height="20" viewBox="0 0 48 48">
              <path fill="#FFC107" d="M43.611,20.083H42V20H24v8h11.303c-1.649,4.657-6.08,8-11.303,8c-6.627,0-12-5.373-12-12c0-6.627,5.373-12,12-12c3.059,0,5.842,1.154,7.961,3.039l5.657-5.657C34.046,6.053,29.268,4,24,4C12.955,4,4,12.955,4,24c0,11.045,8.955,20,20,20c11.045,0,20-8.955,20-20C44,22.659,43.862,21.35,43.611,20.083z"/>
              <path fill="#FF3D37" d="M6.306,14.691l6.571,4.819C14.655,15.108,18.961,12,24,12c3.059,0,5.842,1.154,7.961,3.039l5.657-5.657C34.046,6.053,29.268,4,24,4C16.318,4,9.656,8.337,6.306,14.691z"/>
              <path fill="#4CAF50" d="M24,44c5.166,0,9.86-1.977,13.409-5.192l-6.19-5.238C29.211,35.091,26.715,36,24,36c-5.202,0-9.619-3.317-11.283-7.946l-6.522,5.025C9.505,38.538,16.272,44,24,44z"/>
              <path fill="#1976D2" d="M43.611,20.083H42V20H24v8h11.303c-0.792,2.237-2.231,4.166-4.087,5.571c0.001-0.001,0.002-0.001,0.003-0.002l6.19,5.238C36.971,39.205,44,34,44,24C44,22.659,43.862,21.35,43.611,20.083z"/>
            </svg>
            Přihlásit se přes Google
          </button>
        </form>

        <div className="border-t border-gray-200 pt-6">
          <p className="text-xs text-center text-gray-500 mb-4">Nebo se přihlaste pomocí e-mailu a hesla</p>
          
          {/* Email login form */}
          <form action="/api/auth/signin-email" method="post" className="space-y-4">
            <div>
              <label htmlFor="email-login" className="block text-sm font-medium text-gray-700 mb-1">E-mail</label>
              <input
                id="email-login"
                name="email"
                type="email"
                required
                placeholder="vas@email.cz"
                className="form-input"
              />
            </div>
            <div>
              <label htmlFor="password-login" className="block text-sm font-medium text-gray-700 mb-1">Heslo</label>
              <input
                id="password-login"
                name="password"
                type="password"
                required
                placeholder="Vaše heslo"
                className="form-input"
              />
            </div>
            <button type="submit" className="w-full btn-primary">
              Přihlásit se
            </button>
          </form>
        </div>

        {/* Help text */}
        <div className="mt-6 p-3 bg-blue-50 border border-blue-200 rounded-md">
          <p className="text-xs text-blue-700">
            💡 Kontaktujte svého správce, pokud nemáte přihlašovací údaje nebo potřebujete přístup k systému.
          </p>
        </div>
      </div>
    </div>
  );
}
