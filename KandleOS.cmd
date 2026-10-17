@echo off
rem KandleOS per Doppelklick starten (unabhaengig von der PowerShell-Skriptsperre).
cd /d "%~dp0"

if not exist node_modules (
  echo Installiere Abhaengigkeiten - einmalig, dauert etwas ...
  call npm.cmd install || goto fail
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
