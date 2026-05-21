# FARNÍ AGENDA - NÁVOD PRO NASAZENÍ

Tento návod vám pomůže nastavit a nasadit Farní Agendu do produkce.

## 📋 Před zahájením

### Co budete potřebovat:

1. **GitHub účet** (pro repozitář kódu)
2. **Supabase účet** (https://supabase.com/) - zdarma pro začátek
3. **Vercel účet** (https://vercel.com/) - zdarma pro hosting
4. **Google Cloud Console** (pro OAuth 2.0)
5. **Smartform.cz účet** (pro našeptávač adres)
6. **E-mailové API** (SendGrid nebo Resend)

---

## 🚀 Krok 1: Supabase Nastavení

### 1.1 Vytvoření projektu

1. Jděte na https://supabase.com/ a přihlaste se
2. Klikněte "New Project"
3. Vyplňte:
   - **Name**: Farní Agenda
   - **Database Password**: vygenerujte bezpečné heslo (uložte si ho!)
   - **Region**: Europe (pro GDPR compliance)
   - **Pricing Plan**: Free

### 1.2 Aplikování schématu

1. V Supabase Dashboard klikněte na "SQL Editor"
2. Klikněte "New Query"
3. Zkopírujte obsah `schema.sql` a vložte do editoru
4. Klikněte "Run" (nebo Ctrl+Enter)

**Ověření úspěchu:**
```sql
-- Zkontrolujte, zda jsou tabulky vytvořeny
SELECT table_name FROM information_schema.tables 
WHERE table_schema = 'public' ORDER BY table_name;
```

Měli byste vidět: `farnosti`, `finance`, `logs`, `majetek`, `osoby`

### 1.3 Nastavení pgcrypto rozšíření

Pokud se schéma nespustilo, spusťte ručně:
```sql
CREATE EXTENSION IF NOT EXISTS pgcrypto;
```

---

## 🔐 Krok 2: Google OAuth 2.0 Nastavení

### 2.1 Google Cloud Console

1. Jděte na https://console.cloud.google.com/
2. Vytvořte nový projekt (nebo vyberte existující)
3. Přejděte do **APIs & Services** → **OAuth consent screen**
   - User Type: **External**
   - App name: "Farní Agenda"
   - Support email: váš e-mail
   - Developer contact: váš e-mail
   - Klikněte "Save and Continue"
   - Scopes: Přidejte `email` a `profile`
   - Klikněte "Save and Continue"
   - Test users: Přidejte svůj Google účet pro testování
   - Klikněte "Save and Continue"

### 2.2 Vytvoření OAuth Credentials

1. Přejděte do **APIs & Services** → **Credentials**
2. Klikněte "Create Credentials" → "OAuth client ID"
3. Application type: **Web application**
4. Name: "Farní Agenda Web Client"
5. Authorized redirect URIs:
   ```
   https://vas-projekt.supabase.co/auth/v1/callback
   ```
6. Klikněte "Create"

### 2.3 Zkopírování klíčů

Zkopírujte **Client ID** a **Client Secret** do `.env.local`:
```bash
GOOGLE_CLIENT_ID=vas-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=vas-client-secret-zde
```

---

## 🏢 Krok 3: Supabase Auth Konfigurace

### 3.1 Povolit Google OAuth v Supabase

1. V Supabase Dashboard → **Authentication** → **Providers**
2. Najděte **Google** a klikněte na ikonu nastavení
3. Zapněte **Enable Google sign-in**
4. Vložte Client ID a Client Secret z kroku 2
5. Klikněte "Save"

### 3.2 Nastavení emailových šablon (volitelné)

1. **Authentication** → **Email Templates**
2. Upravte šablony pro:
   - Welcome email
   - Magic link
   - Password recovery

---

## 📧 Krok 4: E-mailové API Nastavení

### Volba 1: SendGrid

1. Zaregistrujte se na https://sendgrid.com/
2. Získejte API key (Settings → API Keys → Create API Key)
3. Přidejte do `.env.local`:
   ```bash
   SENDGRID_API_KEY=your-sendgrid-api-key
   RESEND_API_KEY=
   ```

### Volba 2: Resend

1. Zaregistrujte se na https://resend.com/
2. Získejte API key (Dashboard → API Keys)
3. Přidejte do `.env.local`:
   ```bash
   SENDGRID_API_KEY=
   RESEND_API_KEY=your-resend-api-key
   ```

---

## 🏠 Krok 5: Smartform.cz Nastavení

1. Jděte na https://smartform.cz/
2. Založte účet (potřebujete firmu/IČO)
3. Získejte API key z dashboardu
4. Přidejte do `.env.local`:
   ```bash
   SMARTFORM_API_KEY=vas-smartform-api-key-zde
   ```

---

## ☁️ Krok 6: Google Cloud Storage (pro backupy)

### 6.1 Vytvoření projektu a Service Account

1. Jděte na https://console.cloud.google.com/
2. Vytvořte nový projekt
3. **IAM & Admin** → **Service Accounts** → "Create Service Account"
   - Name: `farni-agenda-backup`
   - Role: **Storage Admin**
4. Klikněte "Done"

### 6.2 Vytvoření klíče

1. Klikněte na vytvořený Service Account
2. **Keys** tab → "Add key" → "Create new key"
3. Type: **JSON**
4. Klikněte "Create" - stáhne se soubor `.json`

### 6.3 Vytvoření bucketu

```bash
# Nainstalujte gsutil (součást Google Cloud SDK)
gcloud auth activate-service-account --key-file=vas-kluc.json
gsutil mb -p vas-project-id gs://farni-agenda-backups
```

### 6.4 Nastavení v .env.local

Zkopírujte celý obsah JSON souboru do `GCP_SERVICE_ACCOUNT_KEY`:
```bash
GCP_SERVICE_ACCOUNT_KEY='{"type":"service_account",...}'
GCS_BUCKET_NAME=farni-agenda-backups
```

---

## 📦 Krok 7: Lokální Instalace a Testování

### 7.1 Instalace závislostí

```bash
# Přepnutí do projektu
cd farni-agenda

# Instalace npm balíčků
npm install

# Vytvoření .env.local
cp .env.example .env.local

# Editace .env.local - vyplňte všechny proměnné
nano .env.local
```

### 7.2 Spuštění vývojového serveru

```bash
npm run dev
```

Otevřete http://localhost:3000 a ověřte, že se zobrazí přihlašovací stránka.

---

## 🚀 Krok 8: Deploy na Vercel

### 8.1 Připojení repozitáře

1. Jděte na https://vercel.com/
2. Klikněte "Add New..." → "Project"
3. Importujte váš GitHub repozitář (nebo pushněte kód)

### 8.2 Konfigurace projektu

Vercel by měl automaticky detekovat Next.js projekt. Pokud ne:

**Framework Preset**: Next.js  
**Build Command**: `npm run build`  
**Output Directory**: `.next`

### 8.3 Environment Variables

Přejděte do **Settings** → **Environment Variables** a přidejte všechny proměnné z `.env.local`:

| Název | Hodnota |
|-------|---------|
| `NEXT_PUBLIC_SUPABASE_URL` | https://vas-projekt.supabase.co |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | vas-anon-key |
| `GOOGLE_CLIENT_ID` | ... |
| `SMARTFORM_API_KEY` | ... |
| `SENDGRID_API_KEY` nebo `RESEND_API_KEY` | ... |

**Důležité:** Nezapomeňte přidat i `ENCRYPTION_KEY`!

### 8.4 Deploy

Klikněte "Deploy" a počkejte na dokončení (cca 2-3 minuty).

---

## ⚙️ Krok 9: Edge Functions Deploy

### 9.1 Instalace Supabase CLI

```bash
# macOS
brew install supabase/tap/supabase

# Linux
curl -fsSL https://supabase.com/install/linux.sh | sh

# Nebo npm
npm install -g supabase
```

### 9.2 Přihlášení

```bash
supabase login
```

Otevře se browser pro autentizaci.

### 9.3 Linkování projektu

```bash
cd farni-agenda
supabase link --project-ref vas-project-ref
```

Project ref najdete v Supabase Dashboard → Settings → API

### 9.4 Deploy funkcí

```bash
# Birthday Watcher
supabase functions deploy birthday-watcher

# Audit Logger
supabase functions deploy audit-logger

# Weekly Backup
supabase functions deploy weekly-backup
```

---

## 🕒 Krok 10: Cron Jobs Nastavení

### 10.1 Přes Supabase Dashboard (doporučeno)

1. Jděte na **Database** → **Replication** → **Cron**
2. Klikněte "Add Schedule"
3. Vložte SQL příkazy z `schema.sql`:

```sql
-- Birthday Watcher - denně v 8:00 UTC
SELECT cron.schedule('birthday-watcher', '0 8 * * *', 
  'SELECT pg_notify(\'supabase/functions/birthday-watcher\', null);');

-- Weekly Backup - každou neděli v 2:00 UTC  
SELECT cron.schedule('weekly-backup', '0 2 * * 0',
  'SELECT pg_notify(\'supabase/functions/weekly-backup\', null);');
```

### 10.2 Ověření

```sql
-- Zkontrolujte aktivní cron jobs
SELECT * FROM cron.job ORDER BY jobid;
```

---

## ✅ Krok 11: Testování a Validace

### 11.1 Test přihlášení

1. Jděte na https://vas-app.vercel.app/
2. Klikněte "Sign in with Google"
3. Přihlaste se testovacím účtem

### 11.2 Test RLS politik

Přihlaste se jako:
- **Superadmin** - měl by vidět všechny farnosti
- **Farnost Admin** - měl by vidět jen svou farnost

### 11.3 Test Edge Functions

```bash
# Test Birthday Watcher
curl -X POST https://vas-project.supabase.co/functions/v1/birthday-watcher

# Test Audit Logger  
curl -X POST https://vas-project.supabase.co/functions/v1/audit-logger \
  -H "Content-Type: application/json" \
  -d '{"action":"CREATE","table":"osoby","record":{}}'

# Test Weekly Backup
curl -X POST https://vas-project.supabase.co/functions/v1/weekly-backup
```

### 11.4 Test šifrování

Vytvořte testovací osobu a ověřte, že pole `email_encrypted` obsahuje šifrovaná data (ne čitelný email).

---

## 📊 Krok 12: Monitoring a Správa

### 12.1 Supabase Dashboard

- **Analytics** - sledujte výkon databáze
- **Logs** - kontrolujte chyby Edge Functions
- **Database** - monitorujte velikost dat

### 12.2 Vercel Analytics

- Sledujte performance vašeho Next.js app
- Kontrolujte error tracking

### 12.3 E-mailové logy

- **SendGrid**: Dashboard → Mail Activity
- **Resend**: Dashboard → Logs

---

## 🔧 Časté problémy a řešení

### Problém: RLS blokuje přístup

**Řešení:**
```sql
-- Přidejte uživatele jako superadmina
INSERT INTO user_roles (user_id, role) 
VALUES ('uzivatel-uuid', 'superadmin');

-- Nebo přiřaďte k farnosti
INSERT INTO user_farnosti (user_id, farnost_id)
VALUES ('uzivatel-uuid', 'farnost-uuid');
```

### Problém: Edge Functions vrací 401

**Řešení:**
- Zkontrolujte `SUPABASE_SERVICE_ROLE_KEY` v environmentálních proměnných
- Ověřte, že jsou funkce deployovány

### Problém: Šifrování selhává

**Řešení:**
- Zkontrolujte `ENCRYPTION_KEY` - musí být alespoň 32 znaků
- Ověřte, že je klíč správně nastaven v `.env.local`

---

## 📞 Podpora a Kontakt

Pro technickou podporu:
- **GitHub Issues**: Otevřete issue v repozitáři
- **Email**: kontakt@farni-agenda.cz (příklad)

---

**Verze dokumentace:** 1.0.0  
**Datum aktualizace:** 2026-05-14
