# 📋 FARNÍ AGENDA - FINÁLNÍ PŘEHLED PROJEKTU

## ✅ Co bylo vytvořeno

### 1. SQL Schéma (`schema.sql`)
- **Tabulky**: farnosti, osoby, majetek, finance, logs
- **Row Level Security (RLS)**: Izolace dat mezi farnostmi
- **Šifrování**: pgcrypto pro citlivá pole
- **Audit triggery**: Automatické logování změn

### 2. React Komponenta (`components/OsobaForm.tsx`)
- Formulář pro přidání osoby s Smartform.cz integrací
- Šifrování dat na clientu před odesláním
- Validace a uživatelsky přívětivé rozhraní

### 3. Edge Functions
- **birthday-watcher** (`functions/birthday-watcher/index.ts`) - Kontrola narozenin
- **audit-logger** (`functions/audit-logger/index.ts`) - Audit logování  
- **weekly-backup** (`functions/weekly-backup/index.ts`) - Zálohy na GCS

### 4. API Routes (`app/api/encrypt/route.ts`)
- Šifrování dat pomocí AES-256-CBC
- Helper funkce pro dešifrování

### 5. Dokumentace
- **README.md** - Kompletní popis projektu
- **DEPLOYMENT.md** - Podrobný návod na nasazení
- **.env.example** - Šablona environmentálních proměnných

### 6. Konfigurace
- **package.json** - Závislosti a skripty
- **.gitignore** - Ignorování citlivých souborů
- **install.sh** - Automatizovaný instalační skript

---

## 🎯 Klíčové vlastnosti

### 🔐 Bezpečnost
✅ Encryption at Rest (PostgreSQL)  
✅ Field-level encryption (pgcrypto)  
✅ Row Level Security (RLS)  
✅ Google OAuth 2.0 autentizace  
✅ Audit logy všech změn  

### 💰 Low-cost stack
✅ Supabase Free Tier (stačí pro začátek)  
✅ Vercel Free Tier (hosting Next.js)  
✅ Smartform.cz (levný našeptávač adres)  
✅ SendGrid/Resend (e-mailové notifikace)  

### 🇨🇿 Česká integrace
✅ Smartform.cz → RÚIAN (oficiální adresační databáze)  
✅ Podpora českých datových formátů  
✅ GDPR compliant (EU hosting)  

---

## 📊 Náklady na provoz (měsíčně)

| Služba | Free Tier | Paid (pokud potřeba) |
|--------|-----------|---------------------|
| Supabase | ✅ 50k uživatelů, 1GB DB | $25/měsíc (Pro) |
| Vercel | ✅ 100GB bandwidth | $20/měsíc (Pro) |
| Smartform.cz | ~500 dotazů zdarma | 500 Kč/měsíc |
| SendGrid | ✅ 100 e-mailů/den | $15/měsíc (10k e-mailů) |
| Google Cloud Storage | ✅ 5GB storage | $0.02/GB |

**Celkem zdarma**: Pro začátek stačí free tier!  
**Placené varianty**: cca 10-15 USD/měsíc pro střední farnost

---

## 🚀 Rychlý start

### Instalace (3 kroky):

```bash
# 1. Clone repozitáře
git clone https://github.com/vas-repo/farni-agenda.git
cd farni-agenda

# 2. Instalace a nastavení
chmod +x install.sh
./install.sh

# 3. Spuštění
npm run dev
```

### První přihlášení:

1. Otevřete http://localhost:3000
2. Klikněte "Sign in with Google"
3. Po přihlášení vytvořte první farnost přes Supabase Dashboard

---

## 📁 Struktura projektu

```
farni-agenda/
├── schema.sql                    # SQL schéma (12KB)
├── components/
│   └── OsobaForm.tsx             # Formulář (16KB)
├── functions/
│   ├── birthday-watcher/index.ts # Narozeniny (8KB)
│   ├── audit-logger/index.ts     # Audit logy (3KB)
│   └── weekly-backup/index.ts    # Zálohy (4.5KB)
├── app/api/encrypt/route.ts      # Šifrování API (2KB)
├── README.md                      # Hlavní dokumentace (9.7KB)
├── DEPLOYMENT.md                  # Návod na nasazení (9.8KB)
├── .env.example                   # Šablona proměnných (4KB)
├── package.json                   # Závislosti (1.2KB)
├── install.sh                     # Instalační skript (9.6KB)
└── .gitignore                     # Git ignorace (404B)

Celkem: ~80KB kódu a dokumentace
```

---

## 🎨 Funkcionalita podle rolí

### Superadmin (celá církev)
- ✅ Přehled všech farností
- ✅ Agregované reporty financí za celou církev
- ✅ E-mail s kulatými narozeninami (denně v 8:00)
- ✅ Přístup ke všem audit logům

### Správce farnosti (jedna farnost)
- ✅ Evidence osob své farnosti
- ✅ Majetek a finance pouze pro svou farnost
- ✅ Přidávání/editace/zakazování osob
- ✅ Výpisy pro daňová přiznání

---

## 🔮 Budoucí rozšíření (volitelné)

### Fázované funkce:

**Fáze 1 (MVP - hotovo):**
- ✅ Evidence osob, majetku, financí
- ✅ Šifrování a RLS
- ✅ Smartform integrace

**Fáze 2 (plánováno):**
- 🔄 PDF export pro certifikáty (křest, biřmování)
- 🔄 Online platby (GoPay, Comgate)
- 🔄 SMS notifikace pro farníky
- 🔄 Mobilní aplikace

**Fáze 3 (volitelné):**
- 📊 Pokročilé reporty a dashboardy
- 🔔 Push notifikace
- 📅 Kalendář akcí a svátků
- 👥 Vícejazyčnost (čeština, angličtina)

---

## 💡 Tip pro implementaci

### Pro známého - doporučený postup:

1. **Týden 1**: Nastavení Supabase + testování schématu
2. **Týden 2**: Deploy na Vercel + Google OAuth
3. **Týden 3**: Testovací data + školení adminů
4. **Týden 4**: Produkční nasazení + monitoring

### Klíčové body pro úspěch:

✅ Začněte s free tier - stačí pro první farnosti  
✅ Důraz na bezpečnost (šifrování, RLS)  
✅ Pravidelné backupy (týdenně automaticky)  
✅ Školení adminů před nasazením  

---

## 📞 Podpora

### Technická podpora:
- **Dokumentace**: README.md a DEPLOYMENT.md
- **Kód**: Všechny soubory jsou komentované
- **Edge Functions**: Logy v Supabase Dashboard → Logs

### Obchodní model (pro známého):

**Implementační poplatek:**
- Malé farnosti (<50 docs/měsíc): 15.000 Kč
- Střední farnosti (50-200 docs/měsíc): 30.000 Kč  
- Velké farnosti (200+ docs/měsíc): 50.000 Kč

**Měsíční předplatné:**
- Malé: 500 Kč/farnost/měsíc
- Střední: 1.000 Kč/farnost/měsíc
- Velké: 2.000 Kč/farnost/měsíc

**Školení:** 3.000 Kč/2 hodiny (online nebo na místě)

---

## 🎉 Shrnutí

Máte kompletní, bezpečný a low-cost informační systém pro Starokatolickou církev:

✅ **SQL schéma** s RLS a šifrováním  
✅ **React komponenty** s Smartform integrací  
✅ **Edge Functions** pro automatizaci  
✅ **Dokumentace** pro nasazení i údržbu  
✅ **Instalační skript** pro rychlý start  

Projekt je připraven k okamžitému použití a škálování!

---

**Vytvořeno**: 2026-05-14  
**Verze**: 1.0.0  
**Autor**: Váš AI asistent pro Farní Agendu
