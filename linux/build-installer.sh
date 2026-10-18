#!/usr/bin/env bash
# Baut die Linux-Installer: release/KandleOS-<version>-x86_64.AppImage und KandleOS-<version>-amd64.deb
# Aufruf auf einem Linux-Rechner im Terminal:  bash linux/build-installer.sh
set -euo pipefail
cd "$(dirname "$(dirname "$(readlink -f "${BASH_SOURCE[0]}")")")"

command -v npm >/dev/null || { echo "Node.js/npm fehlt – bitte Node.js 22 oder neuer installieren." >&2; exit 1; }

# node_modules from Windows/macOS carries the wrong build binaries, so reinstall.
if [ ! -x node_modules/electron/dist/electron ]; then
  echo "Installiere Abhängigkeiten (einmalig, dauert etwas) …"
  rm -rf node_modules
  npm ci
  # npm 11+ skips install scripts by default, so fetch the Electron binary explicitly.
  node node_modules/electron/install.js
fi

npm run dist:linux
echo
echo "Fertig. Installieren mit:"
echo "  sudo apt install ./release/KandleOS-*.deb      (Ubuntu/Debian)"
echo "oder ohne Installation starten:"
echo "  chmod +x release/KandleOS-*.AppImage && ./release/KandleOS-*.AppImage"
