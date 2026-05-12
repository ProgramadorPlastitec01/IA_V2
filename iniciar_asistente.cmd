@echo off
setlocal enabledelayedexpansion
cd /d "%~dp0"
title Asistente RRHH IA - Control de Servicios (v2.0)

:: --- CONFIGURACIÓN ---
set PS=powershell -ExecutionPolicy Bypass -File utils\startup_helper.ps1

:menu
cls
echo ===================================================
echo    ASISTENTE RRHH IA - PANEL DE CONTROL (DevOps)
echo ===================================================
echo.
echo  1. [Lanzamiento] AUTO-START COMPLETO (E2E)
echo  2. [Mantenimiento] Detener todos los servicios
echo  3. [Diagnostico] Check de Salud y Puertos
echo  4. [Limpieza] Reconstruir Base Vectorial
echo  5. Salir
echo.
echo ===================================================
set /p opt="Selecciona una opcion (1-5): "

if "%opt%"=="1" (
    echo Iniciando secuencia automatizada...
    %PS% full-auto
    goto menu
)

if "%opt%"=="2" (
    echo Deteniendo servicios...
    %PS% stop-all
    pause
    goto menu
)

if "%opt%"=="3" (
    %PS% diagnose
    goto menu
)

if "%opt%"=="4" (
    echo PRECAUCION: Esta accion borrara los vectores en Qdrant.
    set /p confirm="Estas seguro? (s/n): "
    if "!confirm!"=="s" (
        node services/rebuild_rag.js
        pause
    )
    goto menu
)

if "%opt%"=="5" goto end

goto menu

:end
echo Cerrando...
exit /b 0
