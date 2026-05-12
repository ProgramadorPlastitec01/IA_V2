@echo off
setlocal
cd /d "%~dp0"
title Asistente RRHH IA - Arranque Total

echo ===================================================
echo   ARRANQUE AUTOMATIZADO - ASISTENTE RRHH IA
echo ===================================================
echo.

:: 1. Verificar/Iniciar Ollama
echo [1/4] Verificando Ollama...
powershell -Command "try { Invoke-WebRequest -Uri http://localhost:11434/api/tags -UseBasicParsing | Out-Null; echo '   ✅ Ollama ya esta corriendo.' } catch { echo '   ⚠️ Ollama no responde. Iniciando...'; start 'Ollama Serve' /B ollama serve }"
timeout /t 5 /nobreak >nul

:: 2. Verificar/Iniciar Qdrant
echo [2/4] Verificando Qdrant...
powershell -Command "try { Invoke-WebRequest -Uri http://localhost:6333/collections -UseBasicParsing | Out-Null; echo '   ✅ Qdrant ya esta corriendo.' } catch { echo '   ⚠️ Qdrant no responde. Iniciando...'; start 'Qdrant DB' /B C:\AIV2\start_qdrant.bat }"
timeout /t 5 /nobreak >nul

:: 3. Iniciar Backend (Node.js)
echo [3/4] Iniciando Backend...
:: Verificamos si ya esta el servicio o si iniciamos por consola
sc query "Asistente RRHH IA - Backend" >nul 2>&1
if %ERRORLEVEL% EQU 0 (
    echo    ✅ Servicio de Windows detectado. Iniciandolo...
    net start "Asistente RRHH IA - Backend" >nul 2>&1
) else (
    echo    🚀 Iniciando backend por consola...
    start "Backend - Node.js" cmd /k "node server.js"
)
timeout /t 5 /nobreak >nul

:: 4. Iniciar Frontend
echo [4/4] Iniciando Frontend...
start "Frontend - Vite" /B npm run dev

echo.
echo ===================================================
echo   SISTEMA EN PROCESO DE ARRANQUE
echo   Backend  : http://localhost:3000
echo   Frontend : http://localhost:5180
echo ===================================================
echo.
echo No cierres las ventanas de servicios si se abrieron por consola.
echo.
pause
