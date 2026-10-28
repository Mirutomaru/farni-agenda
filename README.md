# FARNÍ AGENDA - Starokatolická církev

Informační systém pro správu agendy osob, majetku a financí farností.

## 🎯 Cíl projektu

Vytvořit bezpečný, low-cost informační systém pro Starokatolickou církev (cca 1000 členů) s důrazem na:
- **Bezpečnost dat** - šifrování citlivých informací
- **GDPR compliance** - lokální zpracování dat
- **Nízké náklady** - Supabase + Next.js stack
- **Česká integrace** - Smartform.cz pro adresy

## 🏗️ Architektura

```
┌─────────────────┐
│   Next.js App   │ (Vercel hosting)
│   (React)       │
└────────┬────────┘
         │
         ▼
┌─────────────────┐     ┌──────────────┐
│  Supabase Auth  │◄────│ Google OAuth │
│  (PostgreSQL)   │     │   2.0        │
└────────┬────────┘     └──────────────┘
         │
    ┌────┴─────┐
    ▼          ▼
┌─────────┐ ┌──────────┐
│ RLS     │ │ Edge     │
│ Policy  │ │ Functions│
└─────────┘ └────┬─────┘
                 │
        ┌────────┼────────┐
        ▼        ▼        ▼
   Birthday  Audit    Weekly
   Watcher   Logger   Backup
```

## ✨ P2 Funkce (nové)

### Full-text vyhledávání osob (`search_persons`)
- RPC funkce `search_persons(query, limit)` — full-text přes `osoby_blind_index` (tsvector + GIN index)
- Krátké dotazy (1–2 znaky) spadnou do ILIKE fallbacku
- Stránka `/osoby` používá RPC; při chybě (migrace 005 neaplikována) automaticky padne na původní ILIKE dotaz

### Výročí svatb a pohřbů (`check_anniversary_notifications`)
- RPC funkce `check_anniversary_notifications(horizon_days)` — vrací nadcházející výročí svatb (5leté násobky) a smuteční výročí úmrtí (1. rok, pak každých 5 let)
- Birthday-watcher volá s horizontem 3 dny a přidá je do e-mailu adminům

### Export dat do CSV/PDF
- API routes `/api/export-csv?typ=osoby|finance|krestni-zapisky` a `/api/export-pdf?typ=...`
- CSV: BOM pro Excel + diakritiku, RFC 4180 escaping
- PDF: jsPDF s embedded DejaVu Sans fontem (diakritika)
- Tlačítka na stránkách `/osoby`, `/finance`, `/krestni-zapisky`

## 📁 Struktura projektu

```
farni-agenda/
├── schema.sql              # SQL schéma a RLS politiky (verze 3.0 — kanonické)
├── migrations/             # Inkrementální migrace (001–008) pro existující DB
├── app/                    # Next.js App Router (stránky + API routes)
│   ├── osoby/              # CRUD osob (detail, edit, křestní záznamy)
│   ├── finance/            # Finance s měsíčním filtrem
│   └── statistiky/         # Statistiky s grafy
├── components/             # Sdílené UI komponenty
├── lib/                    # Doménová logika (services, utils) + Supabase klienti
├── supabase/functions/     # Edge funkce (Deno) — jediný kanonický adresář
│   ├── birthday-watcher/   # Kontrola narozenin (cron 8:00 UTC)
│   ├── monthly-statistics/ # Měsíční statistiky + e-mail report
│   ├── audit-logger/       # Audit logování
│   ├── certificates-generator/ # PDF křestní/birovací listiny
│   └── weekly-backup/      # Týdenní zálohy do GCS
├── tests/                  # Jest unit testy (216+) + Playwright E2E
└── .env.local              # Lokální proměnné
```

## 🔐 Bezpečnost

### Šifrování dat
- **Encryption at Rest**: PostgreSQL šifrování na úrovni disku
- **Field-level encryption**: Citlivá pole v tabulce `osoby` šifrována pomocí `pgcrypto`
  - `ico_encrypted`
  - `obcan_prukaz_encrypted`
  - `adresa_trvaly_bydlist_encrypted`
  - `email_encrypted`
  - `telefon_encrypted`

### Row Level Security (RLS)
- **Superadmin**: Vidí všechna data napříč všemi farnostmi
- **Farnost Admin**: Vidí pouze data své farnosti
- **Autentizace**: Výhradně Google OAuth 2.0 přes Supabase Auth

### Audit logy (dvě tabulky s odlišným účelem)

V databázi vedle sebe existují **dvě** logovací tabulky — mají odlišný účel a nesloučí se:

| Tabulka | Účel | Kdo píše | Obsah |
|---------|------|----------|-------|
| `audit_log` | **Změny dat** (append-only) | Doménové servisy (`osoba-service`, `finance-service`, `majetek-service`) + DB trigger | `action` (INSERT/UPDATE/DELETE), `table_name`, `record_id`, `data_before`/`data_after` (JSONB delta), IP, user-agent |
| `logs` | **Operační události systému** | Edge funkce (`weekly-backup`, `certificates-generator`, `monthly-statistics`) | `akce` (CREATE/UPDATE/DELETE/LOGIN/EXPORT/BIRTHDAY_CHECK/BACKUP), `tabulka`, `objekt_id`, data před/po, IP, user-agent |

**Pravidlo:**
- Změnil se **záznam v databázi** → `audit_log` (append-only, UPDATE/DELETE zakázány RLS)
- Spustil se **systémový proces** (backup, export, generování certifikátu) → `logs`

> ⚠️ Historicky README uvádělo, že „každá změna vytváří záznam v tabulce `logs`" — to nebylo přesné. Doménové servisy píší do `audit_log`, edge funkce do `logs`.

## 🚀 Edge Functions

Všechny funkce žijí **pouze** v `supabase/functions/` (deploy: `supabase functions deploy <nazev>`). Starý adresář `functions/` byl sjednocen do něj — nevytvářejte tam nové kopie.

### 1. Birthday Watcher (`supabase/functions/birthday-watcher`)
**Spouštění**: Cron každodenně v 8:00 UTC (nebo ručně přes `pg_notify('realtime_changes', ...)` / curl)

**Funkce**:
- Kontroluje osoby s kulatými narozeninami (násobek 5 let)
- **P2**: Volá RPC `check_anniversary_notifications(3)` — upozorní na výročí svatb a smuteční výročí úmrtí v horizontu 3 dnů
- Dešifruje emaily pro notifikaci
- Odešle e-mail Superadminům přes SendGrid/Resend (předmět se přizpůsobí obsahu: narozeniny / výročí / obojí)
- Vytvoří audit záznam (včetně počtu výročí)

### 2. Monthly Statistics (`supabase/functions/monthly-statistics`)
**Spouštění**: Cron na začátku měsíce (nebo ručně)

**Funkce**:
- Volá RPC `get_monthly_statistics(rok, mesic)` — statistiky členů, křest, birování, finance
- Odešle e-mail report Superadminům přes Resend/SendGrid
- Chybějící API klíč nebo HTTP chyba = throw (žádné tiché selhání)

### 3. Audit Logger (`supabase/functions/audit-logger`)
**Spouštění**: Voláno z frontendu při každé změně

**Funkce**:
- Vytváří audit záznam v `logs` tabulce
- Odesílá notifikaci Superadminům
- Ukládá IP adresu a user agent

### 4. Certificates Generator (`supabase/functions/certificates-generator`)
**Spouštění**: Voláno při uložení křestního záznamu / birování

**Funkce**:
- Generuje PDF křestní/birovací listinu (jsPDF)
- Ukládá do GCS a vrací odkaz

### 5. Weekly Backup (`supabase/functions/weekly-backup`)
**Spouštění**: Cron každou neděli v 2:00 UTC

**Funkce**:
- Exportuje všechny tabulky do JSON
- Nahrává na Google Cloud Storage
- Vytváří audit záznam s odkazem na backup

## 📊 Databázové tabulky

### `farnosti`
Základní informace o farnostech.

| Pole | Typ | Popis |
|------|-----|-------|
| id | UUID | Primární klíč |
| nazev | TEXT | Název farnosti |
| zkratka | TEXT | Zkratka (uniqu) |
| adresa | TEXT | Plná adresa |
| ic | TEXT | Identifikační číslo |
| dic | TEXT | Daňové identifikační číslo |

### `osoby`
Evidence členů farnosti.

| Pole | Typ | Popis |
|------|-----|-------|
| id | UUID | Primární klíč |
| farnost_id | UUID | Vazba na farnost |
| krestni_jmeno | TEXT | Křestní jméno (nešifrováno) |
| prijmeni | TEXT | Příjmení (nešifrováno) |
| datum_narozeni | DATE | Datum narození |
| pohlavi | BOOLEAN | Muž/Žena |
| ico_encrypted | BYTEA | IČO (šifrováno) |
| role_cirkinni | TEXT[] | Církevní role |
| krest_datum | DATE | Datum křtu |
| biřmování_datum | DATE | Datum biřmování |

### `majetek`
Evidence majetku farností.

| Pole | Typ | Popis |
|------|-----|-------|
| id | UUID | Primární klíč |
| nazev | TEXT | Název majetku |
| kategorie | TEXT | Nemovitost/Movitost/Duchovní pomůcky |
| inventární_cislo | TEXT | Inventární číslo (unique) |
| hodnota | DECIMAL | Hodnota v Kč |
| zodpovedna_osoba_id | UUID | Zodpovědná osoba |

### `finance`
Peněžní deník.

| Pole | Typ | Popis |
|------|-----|-------|
| id | UUID | Primární klíč |
| typ | TEXT | Příjem/Výdaj |
| kategorie | TEXT | Dar/Mzda/Údržba/Energie |
| castka | DECIMAL | Částka v Kč |
| datum_příjmu | DATE | Datum transakce |
| variabilni_symbol | TEXT | VS pro platbu |

### `logs`
Operační události systému (píší edge funkce — backup, certifikáty, statistiky). Pro změny dat viz `audit_log`.

| Pole | Typ | Popis |
|------|-----|-------|
| user_id | UUID | Kdo provedl akci |
| akce | TEXT | CREATE/UPDATE/DELETE/LOGIN/EXPORT/BIRTHDAY_CHECK/BACKUP |
| tabulka | TEXT | Název tabulky |
| objekt_id | UUID | Dotčený záznam |
| data_před / data_po | JSONB | Stav před a po akci |

### `audit_log`
Append-only audit změn dat (píší doménové servisy + DB trigger). UPDATE/DELETE zakázány RLS.

| Pole | Typ | Popis |
|------|-----|-------|
| user_id | VARCHAR | Kdo změnu provedl (default `system`) |
| action | TEXT | INSERT/UPDATE/DELETE |
| table_name / record_id | — | Dotčená tabulka a záznam |
| data_before / data_after | JSONB | Delta stavu před/po změně |

## 🔧 Konfigurace

### Environmentální proměnné (.env.local)

```bash
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# Google OAuth
GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-client-secret

# Smartform.cz (adresy)
SMARTFORM_API_KEY=your-smartform-api-key

# E-mailové API (SendGrid nebo Resend)
SENDGRID_API_KEY=your-sendgrid-key
RESEND_API_KEY=your-resend-key

# Šifrování
ENCRYPTION_KEY=vase-slovo-pro-šifrovani-min-32-char

# Google Cloud Storage (pro backupy)
GCP_SERVICE_ACCOUNT_KEY='{"type":"service_account",...}'
GCS_BUCKET_NAME=farni-agenda-backups
```

## 📦 Instalace a nasazení

### 1. Nastavení Supabase

**Kanónické schéma je `schema.sql` (verze 3.0)** — kompletní, konsolidované (tabulky + RLS + audit trigger + RPC funkce). Staré soubory `schema-v2.sql` a `schema-v3-improvements.sql` byly odstraněny; jejich obsah je v `schema.sql`.

```bash
# Přihlášení do Supabase CLI
supabase login

# Vytvoření nového projektu
supabase init
```

**Nová databáze** — stačí aplikovat kanonické schéma:

```bash
psql -h db.your-project.supabase.co -U postgres -c "CREATE EXTENSION pgcrypto;"
psql -h db.your-project.supabase.co -U postgres -f schema.sql
```

**Existující databáze** — aplikovat inkrementální migrace v pořadí (jsou idempotentní):

```bash
for f in migrations/001_append_only_audit.sql \
          migrations/002_birthday_watcher_migration.sql \
          migrations/003_supabase_rpc_functions.sql \
          migrations/004_svatba_svedkove.sql \
          migrations/005_fulltext_search.sql \
          migrations/006_anniversary_notifications.sql \
          migrations/007_rls_gaps.sql \
          migrations/008_rpc_security.sql; do
  psql -h db.your-project.supabase.co -U postgres -f "$f"
done
```

> ⚠️ Migrace nikdy neupravujte zpětně — nová změna schématu = nový soubor `migrations/00N_*.sql` + zrcadlení do `schema.sql`.

### 2. Nastavení Edge Functions

Všechny funkce žijí v `supabase/functions/`:

```bash
# Přihlášení
supabase login

# Deploy funkcí
supabase functions deploy birthday-watcher
supabase functions deploy monthly-statistics
supabase functions deploy audit-logger
supabase functions deploy certificates-generator
supabase functions deploy weekly-backup
```

### 3. Nastavení cron jobs (Supabase Cron)

```sql
-- Birthday Watcher - denně v 8:00 UTC
SELECT cron.schedule('birthday-watcher', '0 8 * * *', 
  'SELECT pg_notify(\'supabase/functions/birthday-watcher\', null);');

-- Weekly Backup - každou neděli v 2:00 UTC
SELECT cron.schedule('weekly-backup', '0 2 * * 0',
  'SELECT pg_notify(\'supabase/functions/weekly-backup\', null);');
```

### 4. Nasazení Next.js na Vercel

```bash
# Instalace závislostí
npm install @supabase/supabase-js

# Testování lokálně
npm run dev

# Deploy na Vercel
vercel --prod
```

## 🎨 Frontend komponenty

### `osoba-form/` (adresář s subkomponentami)
Komplexní formulář pro přidání osoby, rozdělený na logické sekce:
- **IdentitySection** — základní údaje (jméno, příjmení, datum narození, pohlaví)
- **ContactSection** — citlivé údaje + **Smartform.cz integrace** (našeptávač adres z RÚIAN)
- **RolesSection** — církevní role (checkboxy)
- **SacramentsSection** — data svátostí (křest, biřmování)
- **index.tsx** — orchestrátor (jediný zdroj pravdy formulářových dat + odeslání na backend)

Šifrování citlivých polí probíhá **server-side**; validace přes Zod. Import path zůstává `@/components/features/osoba-form`.

### RLS Policy příklad

```sql
-- Správce farnosti vidí jen svou farnost
CREATE POLICY osoby_farnost_policy ON osoby
  FOR ALL
  USING (
    farnost_id IN (SELECT farnost_id FROM user_farnosti WHERE user_id = auth.uid())
    OR EXISTS (
      SELECT 1 FROM user_roles 
      WHERE user_id = auth.uid() AND role = 'superadmin'
    )
  );
```

## 📈 Monitoring a reporting

### Superadmin dashboard
- Přehled všech farností
- Agregované finance za celou církev
- Počet členů podle farnosti
- Audit logy všech změn

### Farnost admin dashboard
- Přehled členů své farnosti
- Evidence majetku
- Peněžní deník
- Reporty pro daně

## 🔒 GDPR compliance

1. **Data minimization**: Šifrování pouze nezbytných dat
2. **Access control**: RLS zajišťuje izolaci dat mezi farnostmi
3. **Audit trail**: Všechny změny logovány
4. **Backup & recovery**: Týdenní zálohy na GCS
5. **Right to be forgotten**: Možnost smazání osobních údajů

## 🛠️ Troubleshooting

### Šifrování nefunguje
- Zkontrolujte `ENCRYPTION_KEY` v environmentálních proměnných
- Ověřte, že pgcrypto extension je nainstalována
- Zkontrolujte logy Edge Functions

### RLS blokuje přístup
- Ujistěte se, že uživatel má přiřazenu roli ve `user_roles` tabulce
- Zkontrolujte vazbu na `user_farnosti` tabulku
- Pro superadmina musí být role='superadmin'

### Smartform API nefunguje
- Ověřte `SMARTFORM_API_KEY` v .env.local
- Zkontrolujte limit API volání ve vašem plánu
- Otestujte API přímo: `curl "https://api.smartform.cz/v1/search?query=praha"`

## 📞 Podpora

Pro technickou podporu kontaktujte vývojáře nebo otevřete issue v repozitáři.

---

**Verze**: 1.0.0  
**Datum**: 2026-05-14  
**Autor**: Váš AI asistent pro Farní Agendu
