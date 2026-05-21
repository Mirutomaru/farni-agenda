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

## 📁 Struktura projektu

```
farni-agenda/
├── schema.sql              # SQL schéma a RLS politiky
├── components/
│   └── OsobaForm.tsx       # Formulář s Smartform integrací
├── functions/
│   ├── birthday-watcher/   # Kontrola narozenin
│   ├── audit-logger/       # Audit logování
│   └── weekly-backup/      # Týdenní zálohy
├── api/
│   └── encrypt.ts          # Šifrování dat
├── lib/
│   └── supabase/
│       └── client.ts       # Supabase klient
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

### Audit logy
Každá změna v databázi vytváří záznam v tabulce `logs`:
- Kdo provedl akci (user_id)
- Jakou akci (CREATE/UPDATE/DELETE)
- Na jaké tabulce a objektu
- Data před a po změně

## 🚀 Edge Functions

### 1. Birthday Watcher (`/functions/birthday-watcher`)
**Spouštění**: Cron každodenně v 8:00 UTC

**Funkce**:
- Kontroluje osoby s kulatými narozeninami (násobek 5 let)
- Dešifruje emaily pro notifikaci
- Odešle e-mail Superadminům přes SendGrid/Resend
- Vytvoří audit záznam

**API Response**:
```json
{
  "message": "Birthday Watcher úspěšně dokončen",
  "count": 3,
  "people": [
    {"jmeno": "Jan Novák", "vek": 50},
    {"jmeno": "Marie Svobodová", "vek": 60}
  ],
  "emailsSent": 2,
  "emailsFailed": 0
}
```

### 2. Audit Logger (`/functions/audit-logger`)
**Spouštění**: Voláno z frontendu při každé změně

**Funkce**:
- Vytváří audit záznam v `logs` tabulce
- Odesílá notifikaci Superadminům
- Ukládá IP adresu a user agent

### 3. Weekly Backup (`/functions/weekly-backup`)
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
Audit logy všech změn.

| Pole | Typ | Popis |
|------|-----|-------|
| user_id | UUID | Kdo provedl akci |
| akce | TEXT | CREATE/UPDATE/DELETE |
| tabulka | TEXT | Název tabulky |
| data_před | JSONB | Data před změnou |
| data_po | JSONB | Data po změně |

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

```bash
# Přihlášení do Supabase CLI
supabase login

# Vytvoření nového projektu
supabase init

# Aplikování schématu
psql -h db.your-project.supabase.co -U postgres -c "CREATE EXTENSION pgcrypto;"
psql -h db.your-project.supabase.co -U postgres -f schema.sql
```

### 2. Nastavení Edge Functions

```bash
# Přihlášení
supabase login

# Deploy funkcí
supabase functions deploy birthday-watcher
supabase functions deploy audit-logger
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

### OsobaForm.tsx
Komplexní formulář pro přidání osoby s:
- **Smartform.cz integrace** - našeptávač adres z RÚIAN
- **Šifrování na clientu** - před odesláním do Supabase
- **Validace dat** - povinná pole, formáty
- **Církevní role** - multi-select checkboxy
- **Data svátostí** - křest, biřmování, svatba

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
