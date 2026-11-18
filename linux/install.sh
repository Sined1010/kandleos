#!/usr/bin/env bash
# KandleOS für den aktuellen Benutzer installieren (ohne root), aus dem Linux-Archiv:
#   tar xzf KandleOS-<version>-x64.tar.gz
#   bash KandleOS-<version>-x64/install.sh
# Aktualisieren:  bash ~/.local/share/kandleos-app/install.sh --update  (oder im App-Menü „KandleOS aktualisieren“)
# Entfernen:  bash ~/.local/share/kandleos-app/install.sh --uninstall
# Die Daten (Watchlist, Zeichnungen, Einstellungen) in ~/.config/kandleos bleiben immer erhalten.
set -euo pipefail
SRC="$(cd "$(dirname "$(readlink -f "${BASH_SOURCE[0]}")")" && pwd)"
DEST="${XDG_DATA_HOME:-$HOME/.local/share}/kandleos-app"
APPS="${XDG_DATA_HOME:-$HOME/.local/share}/applications"
DESKTOP_DIR="$(xdg-user-dir DESKTOP 2>/dev/null || echo "$HOME/Desktop")"
# kandleos.desktop matches the app's desktopName, so the running window gets the launcher icon.
ENTRY=kandleos.desktop
UPDATE_ENTRY=kandleos-update.desktop
RELEASE=https://github.com/Sined1010/kandleos/releases/latest/download

if [ "${1:-}" = "--uninstall" ]; then
  rm -rf "$DEST" "$APPS/$ENTRY" "$APPS/$UPDATE_ENTRY" "$DESKTOP_DIR/$ENTRY"
  echo "KandleOS entfernt. Deine Daten in ~/.config/kandleos sind erhalten geblieben."
  exit 0
fi

if [ "${1:-}" = "--update" ]; then
  # The menu entry runs this in a terminal window that closes at the end; --pause keeps the result readable.
  PAUSE="${2:-}"
  TMP="$(mktemp -d)"
  trap 'rm -rf "$TMP"; if [ "$PAUSE" = --pause ]; then read -rp "Enter drücken zum Schließen …" _ || true; fi' EXIT
  if pgrep -f "^$DEST/kandleos( |$)" >/dev/null; then
    echo "Bitte KandleOS zuerst schließen und dann noch einmal aktualisieren." >&2
    exit 1
  fi
  echo "Suche die neueste Version auf GitHub …"
  curl -fsSL --proto '=https' "$RELEASE/SHA256SUMS.txt" -o "$TMP/SHA256SUMS.txt"
  # Only a well-formed release file name is used in the download URL and as a path.
  LINE="$(grep -E '^[0-9a-f]{64}  KandleOS-[0-9]+\.[0-9]+\.[0-9]+-x64\.tar\.gz$' "$TMP/SHA256SUMS.txt" | head -n 1)" || true
  if [ -z "$LINE" ]; then
    echo "Im neuesten Release gibt es keine Linux-Version (tar.gz)." >&2
    exit 1
  fi
  NAME="${LINE##*  }"
  LATEST="${NAME#KandleOS-}"
  LATEST="${LATEST%-x64.tar.gz}"
  # The app's own package.json in app.asar; if it cannot be read, update anyway.
  INSTALLED="$(grep -a -m1 -A2 '^  "productName": "KandleOS",$' "$DEST/resources/app.asar" 2>/dev/null |
    grep -m1 -oE '[0-9]+\.[0-9]+\.[0-9]+')" || true
  if [ -n "$INSTALLED" ] && [ "$(printf '%s\n' "$LATEST" "$INSTALLED" | sort -V | tail -n 1)" = "$INSTALLED" ]; then
    echo "KandleOS $INSTALLED ist aktuell (neueste Version auf GitHub: $LATEST)."
    exit 0
  fi
  echo "Lade $NAME …"
  curl -fL --proto '=https' --progress-bar "$RELEASE/$NAME" -o "$TMP/$NAME"
  if ! (cd "$TMP" && echo "$LINE" | sha256sum -c --quiet); then
    echo "Die Prüfsumme stimmt nicht. Update abgebrochen, an deiner Installation hat sich nichts geändert." >&2
    exit 1
  fi
  tar xzf "$TMP/$NAME" -C "$TMP"
  bash "$TMP/${NAME%.tar.gz}/install.sh"
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
    echo "WARNUNG: KandleOS startet ohne Sandbox. Eine Lücke im Chromium-Teil (etwa über Kursdaten oder KI-Berichte)"
    echo "         hätte dann vollen Zugriff auf deine Dateien. Nachholen mit: bash $DEST/install.sh"
  fi
fi

mkdir -p "$APPS"
cat >"$APPS/$ENTRY" <<EOF
[Desktop Entry]
Type=Application
Name=KandleOS
Comment=Technische Chartanalyse
Exec="$DEST/kandleos"$FLAG
Icon=$DEST/icon.svg
Terminal=false
Categories=Office;Finance;
StartupWMClass=kandleos
EOF
cat >"$APPS/$UPDATE_ENTRY" <<EOF
[Desktop Entry]
Type=Application
Name=KandleOS aktualisieren
Comment=Neueste Version von GitHub laden und installieren
Exec=bash "$DEST/install.sh" --update --pause
Icon=$DEST/icon.svg
Terminal=true
Categories=Office;Finance;
EOF
chmod 755 "$APPS/$ENTRY" "$APPS/$UPDATE_ENTRY"
if command -v update-desktop-database >/dev/null; then update-desktop-database "$APPS" || true; fi

if [ -d "$DESKTOP_DIR" ]; then
  cp "$APPS/$ENTRY" "$DESKTOP_DIR/$ENTRY"
  # GNOME only launches desktop icons marked as trusted.
  if command -v gio >/dev/null; then gio set "$DESKTOP_DIR/$ENTRY" metadata::trusted true 2>/dev/null || true; fi
fi

echo "Fertig: KandleOS ist im Anwendungsmenü und auf dem Desktop."
