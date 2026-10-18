@echo off
rem Baut den Windows-Installer: release\KandleOS-Setup-<version>.exe
cd /d "%~dp0.."

if not exist node_modules (
  echo Installiere Abhaengigkeiten - einmalig, dauert etwas ...
  call npm.cmd ci || goto fail
)

call npm.cmd run dist:win || goto fail
rem Linux-Archiv mit install.sh (AppImage/.deb lassen sich nur unter Linux bauen)
call node_modules\.bin\electron-builder.cmd --linux tar.gz || goto fail
echo.
echo Fertig: Windows-Installer und Linux-Archiv liegen in %cd%\release
start "" "%cd%\release"
exit /b 0

:fail
echo.
echo Installer konnte nicht gebaut werden. Ist Node.js installiert?
pause
exit /b 1
