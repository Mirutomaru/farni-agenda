#!/bin/bash
# FARNÍ AGENDA - INSTALAČNÍ SKRIPT
# Automatická instalace a konfigurace projektu

set -e  # Exit on error

echo "╔════════════════════════════════════════╗"
echo "║   FARNÍ AGENDA - Instalační skript    ║"
echo "╚════════════════════════════════════════╝"
echo ""

# Barevné proměnné pro výstup
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Funkce pro tisk zpráv
print_info() {
    echo -e "${GREEN}ℹ️  $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

print_error() {
    echo -e "${RED}❌ $1${NC}"
}

# Kontrola závislostí
check_dependencies() {
    print_info "Kontrola závislostí..."
    
    # Node.js
    if ! command -v node &> /dev/null; then
        print_error "Node.js není nainstalován. Instalujte Node.js 18+"
        exit 1
    fi
    
    echo "✓ Node.js verze: $(node --version)"
    
    # npm nebo yarn
    if command -v npm &> /dev/null; then
        echo "✓ npm verze: $(npm --version)"
    elif command -v yarn &> /dev/null; then
        echo "✓ yarn nainstalován"
    else
        print_error "Není nainstalováno ani npm, ani yarn"
        exit 1
    fi
    
    # Supabase CLI (volitelné)
    if command -v supabase &> /dev/null; then
        echo "✓ Supabase CLI nainstalován"
    else
        print_warning "Supabase CLI není nainstalováno. Instalace je volitelná."
        echo "  Instalace: https://supabase.com/docs/guides/cli"
    fi
    
    # PostgreSQL client (volitelné)
    if command -v psql &> /dev/null; then
        echo "✓ PostgreSQL client nainstalován"
    else
        print_warning "PostgreSQL client není nainstalován. Pro lokální testování."
    fi
    
    echo ""
}

# Instalace závislostí
install_dependencies() {
    print_info "Instalace npm balíčků..."
    
    if [ -f "package.json" ]; then
        npm install
        echo "✓ Závislosti nainstalovány"
    else
        print_error "package.json nebyl nalezen!"
        exit 1
    fi
    
    echo ""
}

# Vytvoření .env.local souboru
setup_environment() {
    print_info "Nastavování environmentálních proměnných..."
    
    if [ -f ".env.example" ]; then
        if [ ! -f ".env.local" ]; then
            cp .env.example .env.local
            echo "✓ .env.local vytvořen z .env.example"
            print_warning "NEZAPOMEŇTE vyplnit proměnné v .env.local!"
        else
            echo "✓ .env.local již existuje"
        fi
    else
        print_error ".env.example nebyl nalezen!"
        exit 1
    fi
    
    echo ""
}

# Generování šifrovacího klíče
generate_encryption_key() {
    print_info "Generování šifrovacího klíče..."
    
    if command -v openssl &> /dev/null; then
        KEY=$(openssl rand -hex 32)
        echo "✓ Vygenerován bezpečný klíč:"
        echo ""
        echo "${YELLOW}$KEY${NC}"
        echo ""
        print_warning "Uložte si tento klíč na bezpečné místo!"
        echo "Přidejte ho do .env.local jako ENCRYPTION_KEY="
    else
        print_warning "OpenSSL není nainstalováno. Klíč vygenerujte ručně."
        echo "  Příkaz: openssl rand -hex 32"
    fi
    
    echo ""
}

# Nastavení Supabase (volitelné)
setup_supabase() {
    print_info "Nastavování Supabase..."
    
    if command -v supabase &> /dev/null; then
        read -p "Chcete se přihlásit k Supabase? (y/n): " -n 1 -r
        echo
        
        if [[ $REPLY =~ ^[Yy]$ ]]; then
            supabase login
            
            print_info "Vytvoření nového projektu nebo připojení k existujícímu..."
            read -p "Zadejte URL vašeho Supabase projektu: " SUPABASE_URL
            read -p "Zadejte anon key: " ANON_KEY
            read -p "Zadejte service role key: " SERVICE_ROLE_KEY
            
            # Aktualizace .env.local
            if [ -f ".env.local" ]; then
                sed -i "s|https://vas-projekt.supabase.co|$SUPABASE_URL|" .env.local
                sed -i "s|vas-anon-key-zde|$ANON_KEY|" .env.local
                sed -i "s|vas-service-role-key-zde|$SERVICE_ROLE_KEY|" .env.local
                
                echo "✓ Supabase konfigurace aktualizována"
            fi
            
            # Aplikování schématu
            read -p "Chcete aplikovat SQL schéma do databáze? (y/n): " -n 1 -r
            echo
            
            if [[ $REPLY =~ ^[Yy]$ ]]; then
                print_info "Aplikování schema.sql..."
                
                # Získání hostu z URL
                DB_HOST=$(echo $SUPABASE_URL | sed 's|https://||' | sed 's|/.*||')
                
                psql -h "$DB_HOST" -U postgres -f schema.sql
                
                echo "✓ Schéma aplikováno"
            fi
        else
            print_warning "Supabase nastavení přeskočeno."
            echo ""
            echo "Pro ruční nastavení:"
            echo "  1. Přihlaste se na https://supabase.com/"
            echo "  2. Vytvořte nový projekt"
            echo "  3. Zkopírujte URL a klíče do .env.local"
            echo "  4. Aplikujte schema.sql ručně přes SQL Editor"
        fi
    else
        print_warning "Supabase CLI není nainstalováno."
        echo ""
        echo "Pro nastavení Supabase:"
        echo "  1. Navštivte https://supabase.com/"
        echo "  2. Vytvořte nový projekt"
        echo "  3. Zkopírujte URL a klíče do .env.local"
        echo "  4. Aplikujte schema.sql přes SQL Editor v Supabase Dashboardu"
    fi
    
    echo ""
}

# Deploy Edge Functions (volitelné)
deploy_functions() {
    print_info "Deploy Edge Functions..."
    
    if command -v supabase &> /dev/null; then
        read -p "Chcete deploynout Edge Functions? (y/n): " -n 1 -r
        echo
        
        if [[ $REPLY =~ ^[Yy]$ ]]; then
            print_info "Deploy funkcí..."
            
            supabase functions deploy birthday-watcher
            supabase functions deploy audit-logger
            supabase functions deploy weekly-backup
            
            echo "✓ Edge Functions nasazeny"
        else
            print_warning "Deploy funkcí přeskočen."
        fi
    else
        print_warning "Supabase CLI není nainstalováno. Deploynete později:"
        echo "  supabase functions deploy birthday-watcher"
        echo "  supabase functions deploy audit-logger"
        echo "  supabase functions deploy weekly-backup"
    fi
    
    echo ""
}

# Nastavení cron jobs (volitelné)
setup_cron() {
    print_info "Nastavování cron jobs..."
    
    read -p "Chcete nastavit automatické spouštění? (y/n): " -n 1 -r
    echo
    
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        print_info "Cron jobs budou nastaveny v Supabase Dashboardu:"
        echo ""
        echo "1. Jděte na https://supabase.com/dashboard"
        echo "2. Vyberte váš projekt"
        echo "3. Jděte do Settings -> Database -> SQL Editor"
        echo "4. Spusťte následující příkazy:"
        echo ""
        echo "-- Birthday Watcher - denně v 8:00 UTC"
        echo "SELECT cron.schedule('birthday-watcher', '0 8 * * *',"
        echo "  'SELECT pg_notify(\'supabase/functions/birthday-watcher\', null);');"
        echo ""
        echo "-- Weekly Backup - každou neděli v 2:00 UTC"
        echo "SELECT cron.schedule('weekly-backup', '0 2 * * 0',"
        echo "  'SELECT pg_notify(\'supabase/functions/weekly-backup\', null);');"
    else
        print_warning "Cron jobs nastaveny ručně později."
    fi
    
    echo ""
}

# Spuštění vývojového serveru
start_dev() {
    print_info "Spuštění vývojového serveru..."
    
    npm run dev &
    
    echo ""
    echo -e "${GREEN}✓ Vývojový server běží na http://localhost:3000${NC}"
    echo "  Stiskněte Ctrl+C pro zastavení"
}

# Hlavní funkce
main() {
    check_dependencies
    install_dependencies
    setup_environment
    generate_encryption_key
    
    # Otázka zda pokračovat s Supabase nastavením
    read -p "Chcete pokračovat v automatizovaném nastavení? (y/n): " -n 1 -r
    echo
    
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        setup_supabase
        deploy_functions
        setup_cron
        
        # Otázka na spuštění serveru
        read -p "Chcete nyní spustit vývojový server? (y/n): " -n 1 -r
        echo
        
        if [[ $REPLY =~ ^[Yy]$ ]]; then
            start_dev
        else
            print_info "Instalace dokončena!"
            echo ""
            echo "Další kroky:"
            echo "  1. Otevřete .env.local a vyplňte všechny proměnné"
            echo "  2. Nastavte Google OAuth v Supabase Dashboardu"
            echo "  3. Zaregistrujte se na Smartform.cz pro API key"
            echo "  4. Nastavte e-mailové API (SendGrid nebo Resend)"
            echo "  5. Spusťte: npm run dev"
        fi
    else
        print_info "Instalace dokončena!"
        echo ""
        echo "Pro ruční nastavení postupujte podle README.md"
    fi
    
    echo ""
    echo -e "${GREEN}═══════════════════════════════════════════${NC}"
    echo -e "${GREEN}   FARNÍ AGENDA - Instalace úspěšná! 🎉${NC}"
    echo -e "${GREEN}═══════════════════════════════════════════${NC}"
    echo ""
}

# Spuštění hlavní funkce
main "$@"
