#!/usr/bin/env bash
# KandleOS unter Linux starten.
# Erster Start im Terminal:  bash kandleos.sh
# Danach liegt hier KandleOS.desktop – diese Datei auf den Desktop ziehen
# (GNOME: Rechtsklick auf das Symbol -> "Start erlauben").
set -euo pipefail
DIR="$(cd "$(dirname "$(readlink -f "${BASH_SOURCE[0]}")")" && pwd)"
cd "$DIR"

# Vom Desktop gestartet gibt es kein Terminal: Ausgaben ins Log, Fehler als Benachrichtigung.
LOG="${XDG_CACHE_HOME:-$HOME/.cache}/kandleos.log"
if [ ! -t 1 ]; then
  mkdir -p "$(dirname "$LOG")"
  exec >"$LOG" 2>&1
fi
fail() {
  echo "Fehler: $1" >&2
  if command -v notify-send >/dev/null; then notify-send -i dialog-error KandleOS "$1 (Details: $LOG)"; fi
  exit 1
}

command -v node >/dev/null || fail "Node.js fehlt – bitte Node.js 22 oder neuer installieren."
command -v npm >/dev/null || fail "npm fehlt – bitte zusammen mit Node.js installieren."

# node_modules from Windows/macOS carries the wrong Electron and build binaries, so reinstall.
if [ ! -x node_modules/electron/dist/electron ]; then
  echo "Installiere Abhängigkeiten (einmalig, dauert etwas) …"
  rm -rf node_modules
  npm ci || fail "Installation der Abhängigkeiten fehlgeschlagen."
fi

# Absolute paths; rewritten on every start so the shortcut follows a moved folder.
cat >KandleOS.desktop <<EOF
[Desktop Entry]
Type=Application
Name=KandleOS
Comment=Technische Chartanalyse
Exec=bash "$DIR/kandleos.sh"
Path=$DIR
Icon=$DIR/resources/icon.svg
Terminal=false
Categories=Office;Finance;
StartupWMClass=kandleos
EOF
chmod +x KandleOS.desktop

# Always rebuild (~2 s) so a stale build never starts.
node_modules/.bin/electron-vite build >/dev/null || fail "Build fehlgeschlagen."

# Many distros only run Electron from node_modules with a root-owned setuid sandbox helper.
SANDBOX=()
HELPER=node_modules/electron/dist/chrome-sandbox
if [ "$(stat -c '%u %a' "$HELPER" 2>/dev/null)" != "0 4755" ]; then
  echo "Hinweis: Electron-Sandbox nicht eingerichtet, starte mit --no-sandbox. Einmalig einrichten mit:"
  echo "  sudo chown root:root '$DIR/$HELPER' && sudo chmod 4755 '$DIR/$HELPER'"
  SANDBOX=(--no-sandbox)
fi

exec node_modules/electron/dist/electron . ${SANDBOX[@]+"${SANDBOX[@]}"}
