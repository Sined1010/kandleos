@echo off
rem KandleOS aus dem Quellcode starten (Entwicklung). Fuer die normale Nutzung: build-installer.cmd.
rem Laeuft unabhaengig von der PowerShell-Skriptsperre.
cd /d "%~dp0.."

if not exist node_modules (
  echo Installiere Abhaengigkeiten - einmalig, dauert etwas ...
  call npm.cmd ci || goto fail
)
rem npm 11+ ueberspringt Install-Skripte, daher das Electron-Programm ausdruecklich laden.
if not exist node_modules\electron\dist\electron.exe (
  node node_modules\electron\install.js || goto fail
)

rem Immer neu bauen, damit nie ein veralteter Stand startet (dauert ~2 s).
call node_modules\.bin\electron-vite.cmd build >nul || goto fail

start "" node_modules\electron\dist\electron.exe .
exit /b 0

:fail
echo.
echo KandleOS konnte nicht gestartet werden. Ist Node.js installiert?
pause
exit /b 1
