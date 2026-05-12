@echo off
echo ================================================
echo       INICIANDO SERVIDOR QDRANT (LOCAL)
echo ================================================
echo.
echo Qdrant estara disponible en: http://localhost:6333
echo Directorio de almacenamiento: C:\AIV2\qdrant\storage
echo.
echo Presiona Ctrl+C para detener el servicio.
echo.
cd /d C:\AIV2\qdrant
qdrant.exe
