// FARNÍ AGENDA - GLOBAL LAYOUT (Next.js App Router)
// Globální rozvržení s navigací, Supabase provider a šablonou

import '@/styles/globals.css';
import { createClient } from '@/lib/supabase/client';
import Link from 'next/link';

export const metadata = {
  title: 'Farní Agenda - Informační systém Starokatolické církve',
  description: 'Správa agendy osob, majetku a financí pro Starokatolickou církev v ČR',
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Check auth state server-side for navigation
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  
  const navItems = [
    { href: '/', label: '🏠 Přehled' },
    { href: '/osoby', label: '👥 Osoby' },
    { href: '/majetek', label: '🏛️ Majetek' },
    { href: '/finance', label: '💰 Finance' },
    { href: '/krestni-zapisky', label: '✝️ Křestní zápisy' },
  ];

  return (
    <html lang="cs">
      <body className="min-h-screen bg-gray-50 text-gray-900 font-sans">
        {/* Header / Navigace */}
        <header className="bg-white shadow-sm border-b border-gray-200 sticky top-0 z-10">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex items-center justify-between h-16">
              {/* Logo */}
              <Link href="/" className="text-xl font-bold text-blue-700 hover:text-blue-800 transition-colors">
                Farní Agenda
              </Link>

              {/* Desktop navigation */}
              <nav className="hidden md:flex items-center gap-1">
                {navItems.map((item) => (
                  <Link
                    key={item.href}
                    href={user ? item.href : '/login'}
                    className="px-3 py-2 rounded-md text-sm font-medium text-gray-700 hover:text-blue-600 hover:bg-blue-50 transition-colors"
                  >
                    {item.label}
                  </Link>
                ))}
              </nav>

              {/* Auth section */}
              <div className="flex items-center gap-3">
                {user ? (
                  <>
                    <span className="hidden sm:inline text-sm text-gray-600">{user.email}</span>
                    <Link href="/logout" className="text-sm font-medium text-red-600 hover:text-red-700 px-2 py-1 rounded hover:bg-red-50 transition-colors">
                      Odhlásit se
                    </Link>
                  </>
                ) : (
                  <Link href="/login" className="bg-blue-600 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-blue-700 transition-colors shadow-sm">
                    Přihlásit se
                  </Link>
                )}

                {/* Mobile menu button */}
                <button className="md:hidden p-2 rounded-md text-gray-600 hover:text-blue-600 hover:bg-blue-50" onClick={() => {
                  const menu = document.getElementById('mobile-menu');
                  if (menu) menu.classList.toggle('hidden');
                }}>
                  ☰
                </button>
              </div>
            </div>

            {/* Mobile navigation */}
            <div id="mobile-menu" className="md:hidden hidden pb-4 border-t border-gray-100 mt-2 pt-3">
              {navItems.map((item) => (
                <Link
                  key={item.href}
                  href={user ? item.href : '/login'}
                  className="block px-3 py-2 rounded-md text-sm font-medium text-gray-700 hover:text-blue-600 hover:bg-blue-50 transition-colors"
                >
                  {item.label}
                </Link>
              ))}
            </div>
          </div>
        </header>

        {/* Main content */}
        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          {children}
        </main>

        {/* Footer */}
        <footer className="bg-white border-t border-gray-200 mt-auto">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
            <p className="text-center text-sm text-gray-500">
              Farní Agenda © {new Date().getFullYear()} — Informační systém Starokatolické církve v ČR
            </p>
          </div>
        </footer>
      </body>
    </html>
  );
}
