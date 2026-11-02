#!/usr/bin/env bash
# Richtet die Imkereiverwaltung auf einem Uberspace 7 ein, ohne Docker.
# Der Quellcode kommt aus einem Repository, das auf dem Uberspace selbst liegt
# (nicht von GitHub).
#
# Voraussetzungen:
#   - Ein Bare-Repository auf dem Uberspace, in das du das komplette Projekt
#     gepusht hast, standardmäßig ~/imkerei_verwaltung
#     (anderer Ort: IMKEREI_REPO=/pfad/zum/repo setzen).
#   - PostgreSQL läuft auf dem Uberspace (https://lab.uberspace.de/guide_postgresql/),
#     mit leerer Datenbank und einem Benutzer, dem sie gehört.
#
# Aufruf als normaler Uberspace-Benutzer (nicht root), z.B. aus einer Kopie des
# Repositorys oder direkt aus dem Arbeitsordner:
#
#   bash uberspace_setup.sh
#
# Was passiert:
#   1. Node.js 22 wird eingestellt (dieselbe Version wie im Dockerfile).
#   2. Der Quellcode wird aus dem Repository nach ~/imkerei_verwaltung_app/quelle ausgecheckt
#      (neuester Release-Tag v1.2.3, sonst der Zweig main).
#   3. ~/imkerei_verwaltung_app/.env entsteht mit Datenbank-Adresse, Zufallswerten und Port.
#   4. Die App wird gebaut (npm ci, prisma generate, npm run build).
#   5. Start-Skript und supervisord-Dienst werden angelegt, die App startet.
#
# Mehrfach aufrufen schadet nicht: eine vorhandene .env bleibt, wie sie ist.

set -euo pipefail

# Das Skript arbeitet auf einer Kopie von sich selbst. Sonst würde das
# Auschecken weiter unten die Datei austauschen, während bash sie noch liest.
if [ -z "${IMKEREI_KOPIE:-}" ]; then
  kopie=$(mktemp)
  cp "$0" "$kopie"
  IMKEREI_KOPIE=1 exec bash "$kopie" "$@"
fi
trap 'rm -f "$0"' EXIT

BASIS="$HOME/imkerei_verwaltung_app"
QUELLE="$BASIS/quelle"
REPO="${IMKEREI_REPO:-$HOME/imkerei_verwaltung}"
ZWEIG="${IMKEREI_ZWEIG:-pt/beeintouch_import}"

hinweis() { printf '\n\033[1;32m==> %s\033[0m\n' "$*"; }
warnung() { printf '\n\033[1;33mAchtung: %s\033[0m\n' "$*"; }
abbruch() { printf '\n\033[1;31mFehler: %s\033[0m\n' "$*" >&2; exit 1; }

zufall() { tr -dc 'a-f0-9' </dev/urandom | head -c "$1" || true; }

# --- Voraussetzungen --------------------------------------------------------

[ "$(id -u)" -ne 0 ] || abbruch "Bitte als normaler Uberspace-Benutzer starten, nicht als root."
command -v uberspace >/dev/null || abbruch "Dieses Skript ist für Uberspace gedacht."
command -v git >/dev/null || abbruch "git fehlt."
command -v supervisorctl >/dev/null || abbruch "supervisorctl fehlt."
[ -d "$REPO" ] || abbruch "Das Repository $REPO gibt es nicht. Erst anlegen (git init --bare) und das Projekt dorthin pushen, oder IMKEREI_REPO setzen."

# --- Node.js ----------------------------------------------------------------

hinweis "Stelle Node.js 22 ein ..."
uberspace tools version use node 22
export PATH="$HOME/bin:$PATH"
node --version

mkdir -p "$BASIS/dateien" "$BASIS/sicherungen" "$HOME/etc/services.d"
chmod 700 "$BASIS/sicherungen"

# --- Quellcode --------------------------------------------------------------

hinweis "Hole den Quellcode aus $REPO ..."
if [ ! -d "$QUELLE/.git" ]; then
  # Zeigt HEAD des Repositorys auf einen Zweig, den es nicht gibt (z.B. master
  # statt main), meldet git nur eine Warnung. Ausgecheckt wird unten ohnehin.
  git clone --quiet "$REPO" "$QUELLE"
fi
cd "$QUELLE"
git remote set-url origin "$REPO"
git fetch --tags --force --prune --quiet
TAG=$(git tag -l 'v[0-9]*.[0-9]*.[0-9]*' --sort=-v:refname | head -n1 || true)
if [ -n "$TAG" ]; then
  git checkout -q -f "$TAG"
  echo "Version: $TAG"
else
  git rev-parse --verify -q "origin/$ZWEIG" >/dev/null \
    || abbruch "Im Repository gibt es weder einen Release-Tag noch den Zweig $ZWEIG. Wurde das Projekt gepusht (git push uberspace $ZWEIG)?"
  git checkout -q -f -B "$ZWEIG" "origin/$ZWEIG"
  echo "Kein Release-Tag gefunden, nehme den Zweig $ZWEIG."
fi
[ -f "$QUELLE/web/package.json" ] || abbruch "In $QUELLE fehlt web/package.json. Wurde das komplette Projekt gepusht?"

# --- Einstellungen (.env) ---------------------------------------------------

if [ ! -f "$BASIS/.env" ]; then
  hinweis "Lege ~/imkerei_verwaltung_app/.env an ..."
  echo "Angaben zur PostgreSQL-Datenbank (Passwort bitte nur Buchstaben und Ziffern):"
  read -r -p "  Port [your_port]: " DB_PORT
  DB_PORT="${DB_PORT:-5432}"
  read -r -p "  Datenbankname [your_db]: " DB_NAME
  DB_NAME="${DB_NAME:-imkerei_db}"
  read -r -p "  Benutzer [your_user]: " DB_USER
  DB_USER="${DB_USER:-imker}"
  read -r -s -p "  Passwort: " DB_PASS
  echo
  [ -n "$DB_PASS" ] || abbruch "Ohne Datenbank-Passwort geht es nicht."

  # Freien Port für die App suchen (Uberspace-Server teilen sich "localhost").
  APP_PORT=$(shuf -i 20000-40000 -n 1)
  while ss -ltn 2>/dev/null | grep -q ":$APP_PORT "; do
    APP_PORT=$(shuf -i 20000-40000 -n 1)
  done

  umask 077
  cat > "$BASIS/.env" <<ENV
# Angelegt von uberspace_setup.sh am $(date +%Y-%m-%d). Nicht weitergeben.
PORT="$APP_PORT"
DATABASE_URL="postgresql://$DB_USER:$DB_PASS@127.0.0.1:$DB_PORT/$DB_NAME?schema=public"
ANMELDUNG_GEHEIMNIS="$(zufall 64)"
EINRICHTUNG_CODE="$(zufall 4)-$(zufall 4)"
UPLOAD_DIR="$BASIS/dateien"
TZ="Europe/Berlin"
ENV
  umask 022
fi
chmod 600 "$BASIS/.env"

set -a
# shellcheck disable=SC1091
. "$BASIS/.env"
set +a

# --- Datenbank erreichbar? --------------------------------------------------

if command -v psql >/dev/null; then
  hinweis "Prüfe die Datenbankverbindung ..."
  psql "${DATABASE_URL%%\?*}" -c 'select 1' >/dev/null \
    || abbruch "Die Datenbank ist mit diesen Angaben nicht erreichbar. Läuft PostgreSQL (supervisorctl status)? Stimmen Port, Benutzer und Passwort in $BASIS/.env?"
else
  warnung "psql nicht gefunden, die Datenbankverbindung wird nicht vorab geprüft."
fi

# --- Bauen ------------------------------------------------------------------

hinweis "Baue die App. Das dauert beim ersten Mal einige Minuten ..."
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
  # Turbopack nennt manche Pakete im Build um (z.B. pg-587764f78a6c7a9c) und
  # legt dafür Links in .next/node_modules an. Windows-tar nimmt sie nicht
  # mit, also hier neu anlegen.
  hinweis "Lege die Paket-Links in .next/node_modules an ..."
  { grep -rhoE "[\"'](@[a-z0-9._-]+/)?[a-z0-9._-]+-[0-9a-f]{16}" .next/server --include=*.js || true; } \
    | tr -d "\"'" | sort -u | while read -r n; do
      base="${n%-????????????????}"
      if [ -d "node_modules/$base" ]; then
        mkdir -p ".next/node_modules/$(dirname "$n")"
        ln -sfn "$PWD/node_modules/$base" ".next/node_modules/$n"
      fi
    done
  mv -f "$BASIS/next.tar.gz" "$BASIS/next.tar.gz.verwendet"
else
  npx next build --webpack
fi

# --- Start-Skript und Dienst ------------------------------------------------

hinweis "Richte Start-Skript und Dienst ein ..."
cat > "$BASIS/start.sh" <<'START'
#!/usr/bin/env bash
# Wird von supervisord gestartet (siehe ~/etc/services.d/imkerei_verwaltung_app.ini).
set -euo pipefail
export PATH="$HOME/bin:$PATH"
BASIS="$HOME/imkerei_verwaltung_app"

set -a
. "$BASIS/.env"
set +a
export NODE_ENV=production

cd "$BASIS/quelle/web"
mkdir -p "$UPLOAD_DIR"

echo "Wende offene Datenbank-Migrationen an ..."
./node_modules/.bin/prisma migrate deploy

echo "Wende Migrationen auf die Testzugänge an ..."
node scripts/tester-schemas-migrieren.mjs || echo "Testzugänge konnten nicht migriert werden - App startet trotzdem."

echo "Starte Next.js auf Port $PORT ..."
exec ./node_modules/.bin/next start -H 0.0.0.0 -p "$PORT"
START
chmod 755 "$BASIS/start.sh"

# Starter für spätere Updates. Ältere Stände haben ihn noch nicht.
if [ -f "$QUELLE/installation/uberspace_starter.sh" ]; then
  mkdir -p "$HOME/bin"
  install -m 755 "$QUELLE/installation/uberspace_starter.sh" "$HOME/bin/imkerei-update"
fi

cat > "$HOME/etc/services.d/imkerei_verwaltung_app.ini" <<INI
[program:imkerei_verwaltung_app]
command=$BASIS/start.sh
autostart=yes
autorestart=yes
startsecs=30
INI

supervisorctl reread
supervisorctl update

hinweis "Warte, bis die App antwortet ..."
bereit=nein
for _ in $(seq 1 40); do
  if curl -fsS "http://127.0.0.1:$PORT/api/gesund" >/dev/null 2>&1; then
    bereit=ja
    break
  fi
  sleep 3
done
if [ "$bereit" != "ja" ]; then
  warnung "Die App antwortet noch nicht. Protokoll ansehen mit: supervisorctl tail -f imkerei_verwaltung_app"
fi

cat <<FERTIG

  Die App läuft auf dem Uberspace unter Port $PORT.

  Noch zu tun (siehe Anleitung):
    1. Domain eintragen:   uberspace web domain add DEINE-ADRESSE
    2. Web-Backend setzen: uberspace web backend set DEINE-ADRESSE --http --port $PORT

  Wichtig: Immer die Adresse der App angeben, nicht nur "/". Sonst würde die
  App auch deine anderen Domains (z.B. die Jekyll-Seite) übernehmen.

  Danach im Browser https://DEINE-ADRESSE öffnen.

  Einrichtungscode für den ersten Start:

      $EINRICHTUNG_CODE

  Er steht auch in $BASIS/.env. Bewahre diese Datei gut auf.

FERTIG
