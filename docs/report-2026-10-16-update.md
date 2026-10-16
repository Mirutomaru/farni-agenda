# Report — Farní Agenda (web) · Stav po P0 + P1 + P2

**Datum:** 2026-10-16 · **Commit:** `849d9df` (master, čistý working tree) · **Stav:** funkční, testy **240/240 green**, E2E **11/11**, build ✓
**Předchozí report:** `docs/report-2026-10-16.md` (commit `0717f68`, 216 testů) — tento report dokumentuje, co se od té doby změnilo.

---

## 1. Technologie (bez změn)

| Vrstva | Technologie | Verze |
|--------|-------------|-------|
| Framework | Next.js (App Router) | 16.2.6 |
| UI | React + Tailwind CSS | 18.2 |
| Jazyk | TypeScript (**strict mode**) | 5.3 |
| Databáze | Supabase (Postgres, RLS, RPC funkce) | — |
| Testy | Jest + Testing Library + **Playwright E2E v CI** | 29.7 / 14.1 / 1.5x |
| Lint | ESLint 9 (flat config) | 9.39 |
| CI | GitHub Actions: tsc → jest → lint → build → **E2E** | — |
| PDF | jsPDF (+ embedded DejaVu Sans font pro diakritiku) | 2.5.1 |

## 2. Struktura kódu (reálná měření po P0–P2)

- **Hlavní kód: 6 940 řádků** (app + lib + components)
- **Testy: 3 527 řádků** → poměr test:kód ≈ **1 : 2,0** (zlepšeno z 1 : 2,4)
- **SQL: 1 210 řádků** (schema.sql + migrace 001–006)
- **Edge funkce: 1 176 řádků** (6 funkcí v `supabase/functions/`)
- **Celkem TS/TSX: 10 467 řádků**, 120 souborů v gitu, 14 commitů

### Největší soubory kódu (po dekompozici)
| Soubor | Řádky | Poznámka |
|--------|-------|----------|
| `lib/services/osoba-service.ts` | 483 | největší služba, stabilní |
| `app/statistiky/page.tsx` | 417 | kandidát na další dekompozici (P3) |
| `app/krestni-zapisky/page.tsx` | 359 | + SvatbaForm + export tlačítka |
| `lib/services/export-service.ts` | 301 | **nový** (P2-3) |
| `components/features/osoba-form/` | ~645 celkem | **dekomponován z monolitu 578 řádků** na 6 souborů |

### Vrstvy (aktuálně)
- **app/** — 23 rout: dashboard, osoby (+full-text search), majetek, finance (+opravený filtr + export), křestní zápisy (+SvatbaForm + svědkové + export), statistiky, login/logout, **API routes `/api/export-csv` a `/api/export-pdf`**
- **lib/services/** — 8 služeb: osoba, svatosti (**+ buildSvedkoveRows/groupSvedkoveBySvatba**), finance, majetek, certificate, report, smartform, **export (nová)**
- **supabase/functions/** — 6 funkcí (kanonická složka; duplicitní `functions/` smazána): audit-logger, birthday-watcher (**+ výročí**), certificates-generator, monthly-statistics (**P0 fix: throw místo tichého warn**), weekly-backup, shared
- **migrations/** — 6 idempotentních migrací (001–003 původní, **004 svědkové, 005 full-text, 006 výročí**)

### Databáze (14 tabulek)
`osoby`, `farnosti`, `uzivatele`, `uzivatel_farnost`, `finance`, `majetek`, `krestni_zapis`, `svatby`, **`svatba_svedkove` (teď živá — UI + RLS + opravený index)**, `pohreby`, `bировani_zapis`, `audit_log`, `osoby_blind_index` (**tež plně využita pro full-text**), `logs`

## 3. Co se změnilo od předchozího reportu (P0 → P1 → P2)

### ✅ P0 — stabilita a data (commit `d77037a`)
| # | Zlepšení | Stav |
|---|----------|------|
| 1 | Push na GitHub | ⏳ **zbývá** (uživatel: „bez gitu") |
| 2 | Sjednotit edge funkce | ✅ smazána duplicitní `functions/`, kanonická `supabase/functions/` |
| 3 | Svědkové svatby v kódu | ✅ `SvatbaForm` + service funkce + migrace 004 (opraven index `svateba_id`→`svatba_id`) + RLS |

### ✅ P1 — kvalita a proces (commit `d77037a`)
| # | Zlepšení | Stav |
|---|----------|------|
| 4 | Kanónické schéma | ✅ smazány `schema-v2.sql`/`schema-v3-improvements.sql`, README dokumentuje migrace |
| 5 | E2E testy do CI | ✅ Playwright spec přepsán na reálné selektory, **11 scénářů**, CI job (Chromium) |
| 6 | Rozdělit velké UI soubory | ✅ `osoba-form.tsx` (578) → adresář se 6 subkomponentami; import path zachován |
| 7 | Deployment na Vercel | ⏳ **zbývá** (po P2, dle uživatele) |

### ✅ P2 — funkční rozšíření (commit `849d9df`)
| # | Zlepšení | Stav |
|---|----------|------|
| 8 | Výročí svatb a pohřbů | ✅ RPC `check_anniversary_notifications(horizon)` + birthday-watcher (horizont 3 dny, dynamický předmět e-mailu) |
| 9 | Export CSV/PDF | ✅ `/api/export-csv` + `/api/export-pdf` (osoby/finance/křestní zápisy), jsPDF s DejaVu fontem; **opraveny mrtvé odkazy v /finance** |
| 10 | Full-text vyhledávání | ✅ RPC `search_persons()` přes `osoby_blind_index` (tsvector + GIN), ILIKE fallback pro krátké dotazy i při chybě RPC |
| 11 | Kalendář farnosti | ⏳ zbývá (P3) |

### 🐛 Bonusové opravy nalezené při P2
- **`.gitignore` ignoroval celý `supabase/`** → birthday-watcher a monthly-statistics nikdy nebyly v gitu; opraveno přesnými výjimkami (`supabase/*` + `!supabase/functions/`)
- Stejně tak untracked byly `lib/supabase/` (client+server) a SQL testy — vše teď trackované
- **Bug v `/finance`:** po client-side navigaci se select filtru neaktualizoval (uncontrolled inputs + `defaultValue`) → fix přes `key` na `<form>`

## 4. Kvalita kódu (ověřeno dnes reálně)

| Kontrola | Výsledek |
|----------|----------|
| Jest testy | ✅ **240/240 passed** (15 souborů, ~2 s; bylo 216 → +24 nových) |
| Playwright E2E | ✅ **11/11 scénářů** (~54 s, Chromium) — nově v CI |
| TypeScript strict | ✅ `tsc --noEmit` bez chyb |
| ESLint 9 | ✅ **0 chyb** (160 varování = stejné typy jako před P2: useEffect+setState, any v testech) |
| Build Next.js | ✅ 23/23 route, `Compiled successfully in ~1.2 s` |
| TODO/FIXME/HACK v kódu | **0** (čistě) |

## 5. Rizika a slabá místa (aktuálně)

### 🔴 Vysoké
1. **Žádný git remote** — projekt stále žije jen lokálně (`git remote -v` prázdný); ztráta disku = ztráta projektu. *Jediné zbývající P0.*

### 🟡 Střední
2. **CI běží na placeholder env klíčích** — build je statický a projde, ale `ENCRYPTION_KEY` atd. jsou fiktivní (přijatelné, vědět)
3. **E-mailová infrastruktura** — SendGrid/Resend klíče v env; birthday-watcher spouštěný externím cronem → závislost na třetí straně
4. **`app/statistiky/page.tsx` (417 řádků)** — další kandidát na dekompozici (P3)

### 🟢 Nízké / poznámky
5. **Multi-tenancy připravena** (`uzivatel_farnost`, blind index) — investice do budoucna (OK)
6. **`logs` vs `audit_log`** — rozlišení zdokumentováno v README: `audit_log` = změny dat, `logs` = operační události systému; sloučení by byla větší rework než výhoda

## 6. Zbývající práce (prioritizace)

### P3 — nasazení a další funkce
| # | Zlepšení | Popis | Odhad |
|---|----------|-------|-------|
| 1 | **Push na GitHub** | `git remote add origin` + push master (uživatel: až na explicitní pokyn) | 15 min |
| 2 | **Deployment na Vercel** | `vercel.json` hotový; nastavit reálné env ve Vercel dashboardu → veřejná adresa | 1 h |
| 3 | **Aplikovat migrace 004–006 na live DB** | před prvním nasazením (svědkové, full-text index, výročí) | 30 min |
| 4 | **Kalendář farnosti** | měsíční přehled křestů/svatb/pohrebů (data už jsou) | 4–6 h |
| 5 | **Dekompozice `statistiky/page.tsx`** | 417 řádků → subkomponenty grafů | 2 h |

## 7. Shrnutí stavu

✅ **Silné stránky:** čistá vrstvená architektura, strict TS, **240 testů + 11 E2E green**, CI s E2E, audit log, multi-tenancy připravena, 0 TODO v kódu, full-text search, export CSV/PDF, výročí svatb/pohřbů
⚠️ **Hlavní mezera:** žádný git remote (ztráta dat) — vše ostatní z původního reportu je vyřešeno

**Doporučené pořadí: 1 → 3 → 2** (GitHub push + migrace na live DB + Vercel nasazení) — za ~2,5 h máš projekt zálohovaný a veřejně dostupný.
