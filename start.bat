@echo off
REM ============================================================================
REM FARNÍ AGENDA — STARTOVACÍ SKRIPT PRO WINDOWS
REM ============================================================================
REM Spustí vývojový server aplikace. Před použitím spusťte install.bat.
REM Aplikace bude běžet na http://localhost:3000
REM ============================================================================

echo.
echo ====================================================
echo   FARNÍ AGENDA — SPUŠTĚNÍ
echo   Informační systém pro Starokatolickou církev
echo ====================================================
echo.
echo Aplikace běží na: http://localhost:3000
echo.

REM Kontrola node_modules
if not exist node_modules (
    echo ❌ Chybí node_modules!
    echo Spusťte nejprve install.bat.
    pause
    exit /b 1
)

REM Kontrola .env
if not exist .env (
    if exist .env.example (
        copy /y .env.example .env >nul
        echo ℹ️ Vytvořen .env ze šablony
    ) else (
        echo ❌ Chybí .env soubor!
        pause
        exit /b 1
    )
)

REM Spuštění vývojového serveru
echo [i] Spouštím development server...
npm run dev
