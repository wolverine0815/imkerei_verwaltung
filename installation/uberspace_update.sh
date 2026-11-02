#!/usr/bin/env bash
# Aktualisiert die Imkereiverwaltung auf dem Uberspace (ohne Docker).
# Der neue Stand kommt aus dem Repository auf dem Uberspace (standardmäßig
# ~/repos/Imkerei_Verwaltung.git, anderer Ort: IMKEREI_REPO setzen). Vorher
# also die neuen Änderungen dorthin pushen (und bei Releases die Tags: --tags).
#
#   bash update.sh              neuester Release-Tag, sonst Zweig main
#   bash update.sh v1.4.0       genau diese Version (oder ein anderer Tag/Zweig)
#
# Was passiert:
#   1. Sicherung der Datenbank und der hochgeladenen Dateien in ~/imkerei/sicherungen
#   2. Der neue Stand wird aus dem Repository geholt.
#   3. App wird gestoppt, neu gebaut und wieder gestartet. Offene
#      Datenbank-Migrationen laufen beim Start automatisch.
#
# Hinweis: Es läuft immer die Fassung dieses Skripts, die gerade ausgecheckt
# ist. Ein neueres Skript im neuen Stand kommt also erst beim nächsten Update
# zum Zug.

set -euo pipefail

# Das Skript arbeitet auf einer Kopie von sich selbst. Sonst würde das
# Auschecken weiter unten die Datei austauschen, während bash sie noch liest.
if [ -z "${IMKEREI_KOPIE:-}" ]; then
  kopie=$(mktemp)
  cp "$0" "$kopie"
  IMKEREI_KOPIE=1 exec bash "$kopie" "$@"
fi
trap 'rm -f "$0"' EXIT

export PATH="$HOME/bin:$PATH"
BASIS="$HOME/imkerei_verwaltung_app"
QUELLE="$BASIS/quelle"
REPO="${IMKEREI_REPO:-$HOME/imkerei_verwaltung}"
ZWEIG="${IMKEREI_ZWEIG:-pt/beeintouch_import}"

hinweis() { printf '\n\033[1;32m==> %s\033[0m\n' "$*"; }
abbruch() { printf '\n\033[1;31mFehler: %s\033[0m\n' "$*" >&2; exit 1; }

[ -f "$BASIS/.env" ] || abbruch "Keine $BASIS/.env gefunden. Erst einrichten.sh ausführen."
[ -d "$QUELLE/.git" ] || abbruch "Kein Quellcode in $QUELLE gefunden. Erst einrichten.sh ausführen."
[ -d "$REPO" ] || abbruch "Das Repository $REPO gibt es nicht."

set -a
# shellcheck disable=SC1091
. "$BASIS/.env"
set +a

STAND=$(date +%Y%m%d-%H%M%S)
cd "$QUELLE"
VORHER=$(git describe --tags --always)

# --- Neuen Stand finden (noch ohne etwas zu verändern) ----------------------

git remote set-url origin "$REPO"
git fetch --tags --force --prune --quiet

ZIEL="${1:-}"
if [ -z "$ZIEL" ]; then
  ZIEL=$(git tag -l 'v[0-9]*.[0-9]*.[0-9]*' --sort=-v:refname | head -n1 || true)
fi
if [ -z "$ZIEL" ]; then
  ZIEL="$ZWEIG"
fi

# Ein Zweig wird von origin geholt, ein Tag oder Commit direkt.
if git rev-parse --verify -q "origin/$ZIEL" >/dev/null; then
  ZIEL_REF="origin/$ZIEL"
  ALS_ZWEIG=ja
elif git rev-parse --verify -q "$ZIEL^{commit}" >/dev/null; then
  ZIEL_REF="$ZIEL"
  ALS_ZWEIG=nein
else
  abbruch "$ZIEL gibt es im Repository nicht (weder als Zweig noch als Tag)."
fi

if [ "$(git rev-parse HEAD)" = "$(git rev-parse "$ZIEL_REF^{commit}")" ] && [ -z "${1:-}" ]; then
  echo "Schon auf dem neuesten Stand ($VORHER). Es ist nichts zu tun."
  exit 0
fi

# --- Sicherung --------------------------------------------------------------

hinweis "Sichere die Datenbank und die Dateien ..."
mkdir -p "$BASIS/sicherungen"
pg_dump --format=custom --file "$BASIS/sicherungen/datenbank-$STAND.dump" "${DATABASE_URL%%\?*}" \
  || abbruch "Die Datenbank-Sicherung ist fehlgeschlagen. Es wurde nichts verändert."
tar -czf "$BASIS/sicherungen/dateien-$STAND.tar.gz" -C "$BASIS" dateien
echo "$VORHER" > "$BASIS/sicherungen/version-$STAND.txt"

# Nur die letzten 10 Sicherungen jeder Art behalten.
for muster in 'datenbank-*.dump' 'dateien-*.tar.gz' 'version-*.txt'; do
  # shellcheck disable=SC2012
  ls -1t "$BASIS/sicherungen"/$muster 2>/dev/null | tail -n +11 | xargs -r rm --
done

# --- Neuen Stand auschecken -------------------------------------------------

hinweis "Hole den neuen Stand ($ZIEL) ..."
if [ "$ALS_ZWEIG" = "ja" ]; then
  git checkout -q -f -B "$ZIEL" "$ZIEL_REF"
else
  git checkout -q -f "$ZIEL_REF"
fi
NACHHER=$(git describe --tags --always)
echo "Update: $VORHER -> $NACHHER"

# --- Bauen und neu starten --------------------------------------------------

hinweis "Stoppe die App und baue neu ..."
supervisorctl stop imkerei_verwaltung_app || true
cd "$QUELLE/web"
npm ci
npx prisma generate

# Zwei Wege zur fertigen App:
#  a) Liegt ~/imkerei_verwaltung_app/next.tar.gz da (auf dem eigenen Rechner gebaut und
#     hochgeladen, mit dem Ordner .next darin), wird dieser Stand verwendet.
#  b) Sonst wird hier gebaut. Das braucht viel Arbeitsspeicher, und weil der
#     Server eine zu alte glibc für die native Next.js-Compiler-Datei (SWC)
#     hat, geht es nur mit Webpack und der langsameren WASM-Fassung.
if [ -f "$BASIS/next.tar.gz" ]; then
  hinweis "Verwende den auf dem eigenen Rechner gebauten Stand (next.tar.gz) ..."
  rm -rf .next
  tar -xzf "$BASIS/next.tar.gz" -C "$QUELLE/web"
  [ -d "$QUELLE/web/.next" ] || abbruch "In next.tar.gz fehlt der Ordner .next."
  mv -f "$BASIS/next.tar.gz" "$BASIS/next.tar.gz.verwendet"
else
  npx next build --webpack
fi

hinweis "Starte die App ..."
supervisorctl start imkerei

cat <<FERTIG

  Fertig. Jetzt läuft Version $NACHHER.

  Falls etwas nicht stimmt: supervisorctl tail -f imkerei

  Zurück zur alten Version (Daten aus der Sicherung bei Bedarf einspielen):
    bash update.sh $VORHER

FERTIG
