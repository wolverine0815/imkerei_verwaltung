#!/usr/bin/env bash
# Starter für das Update auf dem Uberspace. Liegt dort als ~/bin/imkerei-update.
# Holt uberspace_update.sh direkt aus dem Repository und führt es aus. So läuft
# immer die Fassung aus dem gewünschten Stand, ohne Kopie von Hand.
#
#   imkerei-update                  Zweig, der gerade ausgecheckt ist
#   imkerei-update pt/mein_zweig    genau dieser Zweig oder Tag
#   imkerei-update --bauen          ohne next.tar.gz, baut auf dem Server
#
# Einmalig von Hand anlegen, danach hält das Update die Datei aktuell:
#
#   git --git-dir="$HOME/git/imkerei_verwaltung" show ZWEIG:installation/uberspace_starter.sh > ~/bin/imkerei-update
#   chmod 755 ~/bin/imkerei-update

set -euo pipefail

export PATH="$HOME/bin:$PATH"
BASIS="$HOME/imkerei_verwaltung_app"
QUELLE="$BASIS/quelle"
REPO="${IMKEREI_REPO:-$HOME/git/imkerei_verwaltung}"

abbruch() { printf '\n\033[1;31mFehler: %s\033[0m\n' "$*" >&2; exit 1; }

ZIEL=""
BAUEN=nein
for arg in "$@"; do
  case "$arg" in
    --bauen) BAUEN=ja ;;
    -*) abbruch "Unbekannte Angabe: $arg" ;;
    *) ZIEL="$arg" ;;
  esac
done

[ -d "$REPO" ] || abbruch "Das Repository $REPO gibt es nicht."

# Der Zweig wird immer ausdrücklich übergeben. Sonst nähme uberspace_update.sh
# den neuesten Release-Tag, und der enthält die Änderungen im Zweig nicht.
if [ -z "$ZIEL" ]; then
  ZIEL=$(git -C "$QUELLE" symbolic-ref -q --short HEAD || true)
  [ -n "$ZIEL" ] || abbruch "In $QUELLE ist kein Zweig ausgecheckt. Bitte Zweig oder Tag angeben."
fi

# Ohne next.tar.gz baut das Update auf dem Server. Das scheitert meist am
# Speicherlimit, und die App ist dann schon gestoppt.
if [ ! -f "$BASIS/next.tar.gz" ] && [ "$BAUEN" != "ja" ]; then
  abbruch "$BASIS/next.tar.gz fehlt. Erst hochladen oder mit --bauen auf dem Server bauen."
fi

kopie=$(mktemp)
if ! git --git-dir="$REPO" show "$ZIEL:installation/uberspace_update.sh" > "$kopie" 2>/dev/null; then
  rm -f "$kopie"
  abbruch "In $ZIEL fehlt installation/uberspace_update.sh (oder den Stand gibt es nicht)."
fi

# IMKEREI_KOPIE: Das Update läuft schon auf einer Kopie und löscht sie am Ende.
IMKEREI_KOPIE=1 exec bash "$kopie" "$ZIEL"
