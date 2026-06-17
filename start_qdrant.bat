@echo off
echo ================================================
echo       INICIANDO SERVIDOR QDRANT (LOCAL)
echo ================================================
echo.
echo Qdrant estara disponible en: http://localhost:6333
echo Directorio de almacenamiento: C:\AIV2\storage
echo.
echo Presiona Ctrl+C para detener el servicio.
echo.
REM FIX 2026-06-16: el cwd debe ser C:\AIV2 (raiz), NO C:\AIV2\qdrant.
REM Qdrant lee ./storage relativo al cwd; con cwd=qdrak\ cargaba un storage
REM fantasma vacio (768d) en vez del real (C:\AIV2\storage, 1024d, 269 pts).
REM %~dp0 = carpeta de este .bat (C:\AIV2\). Robusto a la ruta de instalacion.
cd /d "%~dp0"
qdrant\qdrant.exe
