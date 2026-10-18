@echo off
rem Baut den Windows-Installer: release\KandleOS-Setup-<version>.exe
cd /d "%~dp0.."

if not exist node_modules (
  echo Installiere Abhaengigkeiten - einmalig, dauert etwas ...
  call npm.cmd ci || goto fail
)

call npm.cmd run dist:win || goto fail
echo.
echo Fertig: Installer liegt in %cd%\release
start "" "%cd%\release"
exit /b 0

:fail
echo.
echo Installer konnte nicht gebaut werden. Ist Node.js installiert?
pause
exit /b 1
