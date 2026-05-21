# FARNÍ AGENDA - DEPLOYMENT GUIDE (Final)
# ========================================
# Kompletní návod pro nasazení aplikace na produkci
# ========================================

## KROK 1: Aplikace schema.sql na Supabase ✅ HOTOVO?

### Možnost A: přes SQL Editor (doporučeno)
1. Otevři https://app.supabase.com → vyber svůj projekt
2. Levý menu → SQL Editor
3. Klikni "New query"
4. Zkopíruj obsah `/home/ai/farni-agenda/schema.sql` a vlož do editoru
5. Klikni "Run" (⌘+Enter)

### Možnost B: přes Supabase CLI (pokud nainstaluješ)
```bash
npm install -g supabase
supabase link --project-ref <tvuj-project-id>
supabase db push
```

**Ověření:** Spusť v SQL Editoru:
```sql
SELECT table_name FROM information_schema.tables 
WHERE table_schema = 'public' ORDER BY table_name;
```
Měl bys vidět: `farnosti`, `osoby`, `majetek`, `finance`, `uzivatele`, `krestni_zapisky`

---

## KROK 2: Nastavení environment proměnných ✅ HOTOVO? (soubor vytvořen)

Soubor `.env.local` je připravený na `/home/ai/farni-agenda/.env.local`.

### Získání hodnot z Supabase Dashboardu
1. Jdi do https://app.supabase.com/project/<tvuj-projekt>/settings/api
2. Zkopíruj:
   - `URL` → NEXT_PUBLIC_SUPABASE_URL
   - `anon public` key → NEXT_PUBLIC_SUPABASE_ANON_KEY  
   - `service_role` key → SUPABASE_SERVICE_ROLE_KEY

### Získání Google OAuth credentials
1. Jdi do https://console.cloud.google.com/apis/credentials
2. Vyber projekt → "Create Credentials" → OAuth 2.0 Client ID
3. Nastav Authorized redirect URIs:
   - `http://localhost:3000/api/auth/callback` (pro dev)
   - `https://tvuj-domain.vercel.app/api/auth/callback` (pro produkci)
4. Zkopíruj Client ID a Client Secret

### Vygenerování ENCRYPTION_KEY
```bash
openssl rand -hex 32
```
Vlož výsledek do `.env.local` jako `ENCRYPTION_KEY`.

---

## KROK 3: Deployment na Vercel 🚀

### Možnost A: přes Vercel Dashboard (nejrychlejší)

1. Jdi na https://vercel.com/new
2. Importuj repozitář z GitHubu/GitLab/Bitbucket
   - Nebo uploadni zip složky `farni-agenda`
3. Nastavení projektu:
   ```
   Framework Preset → Other
   Root Directory → ./ (root)
   Build Command → npm run build
   Output Directory → .next
   ```
4. **Environment Variables** (přesně jako v `.env.local`):
   | Název proměnné | Hodnota | Zdroj |
   |---|---|---|
   | NEXT_PUBLIC_SUPABASE_URL | https://xxx.supabase.co | Supabase Dashboard |
   | NEXT_PUBLIC_SUPABASE_ANON_KEY | anon key | Supabase Dashboard |
   | SUPABASE_SERVICE_ROLE_KEY | service_role key | Supabase Dashboard |
   | GOOGLE_CLIENT_ID | z Google Cloud Console | OAuth Credentials |
   | GOOGLE_CLIENT_SECRET | z Google Cloud Console | OAuth Credentials |
   | ENCRYPTION_KEY | openssl rand -hex 32 | Terminal |
   | PBKDF2_ITERATIONS | 100000 | Fixní hodnota |
   | PBKDF2_SALT | farni-agenda-salt | Fixní hodnota |

5. Klikni "Deploy" → počkej ~2 minuty → hotovo! 🎉

### Možnost B: přes Vercel CLI (pokud nainstaluješ)
```bash
npm install -g vercel  # nebo npx vercel
cd /home/ai/farni-agenda
vercel login
vercel link --name farni-agenda
vercel deploy --prod
```

---

## KROK 4: Ověření deploymentu ✅

Po nasazení proveď tyto testy:

### 1. Homepage načítá
```
https://tvuj-projekt.vercel.app
```
Měl bys vidět dashboard s statistikami a navigací.

### 2. Login stránka funguje
```
https://tvuj-projekt.vercel.app/login
```
Měl bys vidět tlačítko "Přihlásit se přes Google".

### 3. API routes odpovídají
```bash
curl -I https://tvuj-projekt.vercel.app/api/encrypt
# Očekávaný response: HTTP/2 405 (Method Not Allowed = route existuje)
```

### 4. Supabase připojení funguje
V konzoli prohlížeče (F12) by nemělo být chybové hlášení o failed API call na Supabase.

---

## KROK 5: Post-deployment konfigurace

### Nastav redirect URL v Google Cloud Console
Přidej produkční URL do Authorized JavaScript origins a redirect URIs.

### Ověř edge functions
```bash
# Pokud máš nainstalované supabase CLI:
cd /home/ai/farni-agenda/functions
supabase functions deploy birthday-watcher
supabase functions deploy certificates-generator
supabase functions deploy weekly-backup
supabase functions deploy monthly-statistics
supabase functions deploy audit-logger
```

### Nastav Google Cloud Storage bucket pro backup
1. Jdi na https://console.cloud.google.com/storage
2. Vytvoř nový bucket (např. `farni-agenda-backups`)
3. Nastav IAM permission pro service account:
   - Storage Object Admin na bucket
4. Zkopíruj service account key do `.env.local` jako `GCP_SERVICE_ACCOUNT_KEY_BASE64`

---

## KROK 6: Monitoring a maintenance

### Pravidelné úkoly
- [ ] Měsíčně zkontrolovat edge function logs
- [ ] Ověřit weekly-backup funkčnost
- [ ] Aktualizovat schema při nových požadavcích
- [ ] Monitorovat využití Supabase (DB storage, API calls)

### Důležité URL
- Supabase Dashboard: https://app.supabase.com/
- Vercel Dashboard: https://vercel.com/dashboard
- Google Cloud Console: https://console.cloud.google.com/
- Vercel Environment Variables: https://vercel.com/<username>/<project>/settings/environment-variables

---

## Troubleshooting

### Problem: "Cannot find module '@/lib/supabase/client'"
**Řešení:** Uprav `tsconfig.json`:
```json
{
  "compilerOptions": {
    "paths": {
      "@/*": ["./*"]
    }
  }
}
```

### Problem: Edge functions fail with "Module not found"
**Řešení:** Všechny importy v edge functions musí být relativní (`../shared/gcp-auth.ts`), ne z `lib/`.

### Problem: CORS errors on Supabase
**Řešení:** V Supabase Dashboard → Authentication → URL Configuration přidej produkční URL.

### Problem: OAuth redirect mismatch
**Řeší:** Ověř v Google Cloud Console, že redirect URI přesně odpovídá: `https://tvuj-projekt.vercel.app/api/auth/callback`
