// FARNÍ AGENDA - ESLINT FLAT CONFIG (ESLint 9 + eslint-config-next 16)
// Next.js 16 používá flat config; `next lint` ho automaticky najde.
import coreWebVitals from 'eslint-config-next/core-web-vitals';
import typescript from 'eslint-config-next/typescript';

export default [
  {
    ignores: ['node_modules/**', '.next/**', 'out/**', 'supabase/functions/**'],
  },
  ...coreWebVitals,
  ...typescript,
  {
    // BASELINE pro existující kód (P1 — ESLint zaveden 2026-09)
    // Reálné chyby (prefer-const, no-unescaped-entities, ban-ts-comment,
    // no-require-imports, use-before-define) byly opraveny přímo v kódu.
    // Zbývající legacy patterny jdou jako warnings — postupně zvedat na error:
    rules: {
      // 97× any — vázané na tsconfig strict:false (P3 hygiena)
      '@typescript-eslint/no-explicit-any': 'warn',
      // React Compiler pravidlo; 2× false positive na async load funkcích,
      // 1× skutečný synchronní setState v effectu (statistiky-dashboard)
      'react-hooks/set-state-in-effect': 'warn',
    },
  },
];
