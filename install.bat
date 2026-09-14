@echo off
REM ============================================================================
REM FARNÍ AGENDA — INSTAALČNÍ SKRIPT PRO WINDOWS
REM ============================================================================
REM Tento skript nainstaluje všechny potřebné závislosti a připraví aplikaci
REM pro spuštění. Před instalací ujistěte se, že máte Node.js 18+ nainstalovaný.
REM ============================================================================

echo.
echo ====================================================
echo   FARNÍ AGENDA — INSTALACE
echo   Informační systém pro Starokatolickou církev
echo ====================================================
echo.

REM Kontrola Node.js verze
echo [1/5] Kontrola Node.js...
node --version >nul 2>&1
if %errorlevel% neq 0 (
    echo   ❌ Node.js není nainstalovaný!
    echo.
    echo Stáhněte si Node.js z: https://nodejs.org/
    echo Vyberte LTS verzi (verze 18 nebo vyšší).
    echo Po instalaci spusťte tento skript znovu.
    pause
    exit /b 1
)

for /f "tokens=2" %%i in ('node -v') do set NODE_VERSION=%%i
set NODE_VERSION=!NODE_VERSION:~1!
echo   ✅ Node.js !NODE_VERSION!

REM Kontrola npm
echo.
echo [2/5] Kontrola npm...
npm --version >nul 2>&1
if %errorlevel% neq 0 (
    echo   ❌ npm není k dispozici!
    pause
    exit /b 1
)

for /f "tokens=3" %%i in ('npm -v') do set NPM_VERSION=%%i
echo   ✅ npm !NPM_VERSION!

REM Instalace dependencies
echo.
echo [3/5] Instalace závislostí...
if exist node_modules (
    echo   ℹ️  node_modules již existuje — přeskakuji instalaci.
    echo      Pro čistou instalaci smažte složku node_modules a spusťte skript znovu.
) else (
    npm install --production
    if %errorlevel% neq 0 (
        echo   ❌ Instalace selhala!
        echo.
        echo Zkontrolujte připojení k internetu a zkuste to znovu.
        pause
        exit /b 1
    )
    echo   ✅ Závislosti nainstalovány
)

REM Kontrola .env souboru
echo.
echo [4/5] Konfigurace (.env)...
if not exist .env (
    if exist .env.example (
        copy /y .env.example .env >nul
        echo   ✅ Vytvořen .env ze šablony .env.example
        echo   ⚠️  NEVYMEŇTE hodnoty v .env!
        echo      Upravte jej ručně podle vašeho prostředí.
    ) else (
        echo   ℹ️  .env soubor vytvořit manuálně:
        echo      copy .env.example .env
        echo      a upravte hodnoty v .env
    )
) else (
    echo   ✅ .env již existuje — přeskakuji.
)

REM Build aplikace
echo.
echo [5/5] Sestavení aplikace...
if not exist node_modules\next (
    npm run build
    if %errorlevel% neq 0 (
        echo   ❌ Build selhal!
        pause
        exit /b 1
    )
)

echo.
echo ====================================================
echo   ✅ INSTALACE DOKONČENA!
echo ====================================================
echo.
echo Aplikaci spustíte pomocí:
echo   start.bat
echo.
echo Nebo ručně:
echo   npm run dev
echo.
echo Aplikace bude běžet na http://localhost:3000
echo.
pause
