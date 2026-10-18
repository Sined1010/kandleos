#!/usr/bin/env bash
# KandleOS für den aktuellen Benutzer installieren (ohne root), aus dem Linux-Archiv:
#   tar xzf KandleOS-<version>-x64.tar.gz
#   bash KandleOS-<version>-x64/install.sh
# Entfernen:  bash ~/.local/share/kandleos-app/install.sh --uninstall
# Die Daten (Watchlist, Zeichnungen, Einstellungen) in ~/.config/kandleos bleiben immer erhalten.
set -euo pipefail
SRC="$(cd "$(dirname "$(readlink -f "${BASH_SOURCE[0]}")")" && pwd)"
DEST="${XDG_DATA_HOME:-$HOME/.local/share}/kandleos-app"
APPS="${XDG_DATA_HOME:-$HOME/.local/share}/applications"
DESKTOP_DIR="$(xdg-user-dir DESKTOP 2>/dev/null || echo "$HOME/Desktop")"
# kandleos.desktop matches the app's desktopName, so the running window gets the launcher icon.
ENTRY=kandleos.desktop

if [ "${1:-}" = "--uninstall" ]; then
  rm -rf "$DEST" "$APPS/$ENTRY" "$DESKTOP_DIR/$ENTRY"
  echo "KandleOS entfernt. Deine Daten in ~/.config/kandleos sind erhalten geblieben."
  exit 0
fi

if [ "$SRC" != "$DEST" ]; then
  echo "Installiere nach $DEST …"
  rm -rf "$DEST"
  mkdir -p "$DEST"
  cp -a "$SRC/." "$DEST/"
fi
# The archive is built on Windows, which cannot store Unix execute permissions.
chmod 755 "$DEST/kandleos" "$DEST/chrome_crashpad_handler" "$DEST/install.sh"

# Many distros only run Electron with a root-owned setuid sandbox helper; otherwise fall back to --no-sandbox.
FLAG=""
HELPER="$DEST/chrome-sandbox"
if [ "$(stat -c '%u %a' "$HELPER")" != "0 4755" ]; then
  answer=n
  if [ -t 0 ] && command -v sudo >/dev/null; then
    read -rp "Electron-Sandbox einrichten (empfohlen, fragt nach dem sudo-Passwort)? [J/n] " answer || true
    answer="${answer:-j}"
  fi
  if [[ "$answer" =~ ^[JjYy] ]] && sudo chown root:root "$HELPER" && sudo chmod 4755 "$HELPER"; then
    echo "Sandbox eingerichtet."
  else
    FLAG=" --no-sandbox"
    echo "Hinweis: KandleOS startet ohne Sandbox. Nachholen mit: bash $DEST/install.sh"
  fi
fi

mkdir -p "$APPS"
cat >"$APPS/$ENTRY" <<EOF
[Desktop Entry]
Type=Application
Name=KandleOS
Comment=Technische Chartanalyse
Exec="$DEST/kandleos"$FLAG
Icon=$DEST/icon.png
Terminal=false
Categories=Office;Finance;
StartupWMClass=kandleos
EOF
chmod 755 "$APPS/$ENTRY"
if command -v update-desktop-database >/dev/null; then update-desktop-database "$APPS" || true; fi

if [ -d "$DESKTOP_DIR" ]; then
  cp "$APPS/$ENTRY" "$DESKTOP_DIR/$ENTRY"
  # GNOME only launches desktop icons marked as trusted.
  if command -v gio >/dev/null; then gio set "$DESKTOP_DIR/$ENTRY" metadata::trusted true 2>/dev/null || true; fi
fi

echo "Fertig: KandleOS ist im Anwendungsmenü und auf dem Desktop."
