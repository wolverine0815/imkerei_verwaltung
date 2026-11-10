# Imkereiverwaltung installieren

So bekommst du deine eigene Imkereiverwaltung auf einen eigenen Server. Die
App ist kostenlos, siehe [LIZENZ.md](../LIZENZ.md).

Es gibt zwei Wege:

- **Eigener Server (VPS) mit Docker:** der Standardweg, gleich hier unten.
- **Uberspace (ohne Docker):** für ein Konto bei [uberspace.de](https://uberspace.de),
  siehe [Installation auf einem Uberspace](#installation-auf-einem-uberspace-ohne-docker)
  weiter unten.

## Was du brauchst

- Einen kleinen Server (VPS) mit **Ubuntu 22.04/24.04 oder Debian 12**,
  mindestens 1 GB Arbeitsspeicher und 10 GB Festplatte. Zum Beispiel bei
  Hetzner, netcup oder IONOS, ab etwa 4 € im Monat.
- Eine **Adresse** (Domain oder Unteradresse), z.B. `imkerei.example.de`.
  Beim Domain-Anbieter einen **A-Eintrag** auf die IP-Adresse des Servers
  setzen. Ohne Adresse gibt es kein HTTPS, und ohne HTTPS klappt die
  Anmeldung nicht.
- Beim Server müssen die Ports **80 und 443** offen sein (Firewall beim
  Anbieter prüfen).

## Installieren

Am Server anmelden (z.B. `ssh root@<IP-Adresse>`) und eingeben:

```
curl -fsSL https://raw.githubusercontent.com/frawoer79/Imkerei_Verwaltung/main/installation/installieren.sh | sudo bash
```

Das Skript fragt nach der Adresse, installiert Docker, startet die App und
zeigt am Ende einen **Einrichtungscode**.

Dann im Browser `https://<deine Adresse>` öffnen. Der Einrichtungsassistent
fragt den Code ab und legt deinen Zugang an. Fertig.

## Wo liegt was

Alles liegt in `/opt/imkereiverwaltung`:

- `.env`: Adresse, Passwörter und Einrichtungscode. **Gut aufbewahren**, nie
  weitergeben.
- `docker-compose.yml` und `Caddyfile`: die Bauanleitung. Nicht ändern.
- `sicherungen/`: Sicherungen der Datenbank vor jedem Update.
- `steuerung/`: darüber bittet die App um ein Update. Nicht ändern.
- Daten und Fotos liegen in Docker-Volumes (`imkereiverwaltung_datenbank`,
  `imkereiverwaltung_dateien`). Sie bleiben bei Neustarts und Updates erhalten.

## Häufige Fragen

**App neu starten:** `cd /opt/imkereiverwaltung && docker compose restart`

**Protokoll ansehen:** `cd /opt/imkereiverwaltung && docker compose logs --tail 100 app`

**Passwort vergessen:** Deine Daten bleiben dabei erhalten.

```
cd /opt/imkereiverwaltung
docker compose exec app node scripts/hauptzugang-zuruecksetzen.mjs
docker compose restart app
```

Danach die Seite neu öffnen, der Einrichtungsassistent kommt wieder. Den
Einrichtungscode findest du in der `.env`.

**Kein HTTPS-Zertifikat:** Zeigt die Adresse wirklich auf den Server? Sind
Port 80 und 443 offen? Caddy versucht es von selbst immer wieder. Protokoll:
`docker compose logs caddy`.

## Updates

Einmal am Tag fragt die App bei GitHub nach, ob es eine neue Version gibt.
Gibt es eine, steht oben ein Hinweis (nur für deinen Zugang, nicht für
Helfer). "Was ist neu?" zeigt die Änderungen. Abschalten lässt sich das unter
Einstellungen → System. Dabei geht nur eine gewöhnliche Abfrage an GitHub,
keine Daten deiner Imkerei.

**Update einspielen:** unter Einstellungen → System auf "Update einspielen"
tippen. Oder am Server:

```
sudo imkerei-update
```

Beides macht dasselbe: Speicherplatz prüfen, neue Version laden, Datenbank
sichern, neue Version starten und prüfen, ob sie läuft. Startet sie nicht,
geht es von selbst zurück auf die alte Version mit der Sicherung von eben.
Protokoll: `/var/log/imkerei-update.log`.

**Zurück auf die Version vor dem letzten Update:**

```
sudo imkerei-update --zurueck
```

Achtung: Was seit dem Update eingetragen wurde, geht dabei verloren.

**Sicherungen** liegen in `/opt/imkereiverwaltung/sicherungen`, die letzten
5 bleiben. Fotos ändern sich durch Updates nicht und werden dort nicht
mitgesichert.

**Neue Hauptversion (z.B. 2.0):** kommt nie von selbst. Was zu tun ist, steht
dann in "Was ist neu?".

**Installation von vor dem Update-Befehl:** Gibt es `imkerei-update` bei dir
noch nicht, das Installationsskript einfach noch einmal aufrufen (siehe oben).
Deine Einstellungen und Daten bleiben dabei, wie sie sind.

## Installation auf einem Uberspace (ohne Docker)

Uberspace ist ein Webhoster, bei dem du ein eigenes Linux-Konto mit SSH
bekommst, aber kein Docker und keine Root-Rechte. Die App läuft dort trotzdem:
Node.js und PostgreSQL bringt Uberspace mit, die Skripte
`uberspace_setup.sh` (Einrichtung), `uberspace_update.sh` (Update) und
`uberspace_starter.sh` (Befehl `imkerei-update`) übernehmen den Rest.
Getestet ist das auf **Uberspace 7**.

### Das Wichtigste vorab: Gebaut wird auf deinem eigenen Rechner

Auf dem Uberspace lässt sich die App nicht sinnvoll bauen:

- **Speicher:** Ein Uberspace darf höchstens **1,5 GB Arbeitsspeicher**
  belegen. Der Build braucht mehr und wird dann ohne Meldung abgebrochen
  (im Protokoll `SIGKILL`).
- **Zu alte Systembibliothek:** Uberspace 7 hat glibc 2.17. Der schnelle
  Compiler von Next.js (SWC) braucht eine neuere, es bliebe nur eine sehr
  langsame Ausweichlösung.

Deshalb baust du auf deinem Rechner (Windows, Mac oder Linux) und lädst das
Ergebnis als `next.tar.gz` hoch. Das Update-Skript nimmt diese Datei, wenn sie
da ist. Ohne sie bricht `imkerei-update` ab, statt auf dem Server zu bauen.
Mit dieser Datei installiert der Server nur die Pakete, die die laufende App
braucht (`npm ci --omit=dev`), ohne die Werkzeuge zum Entwickeln. Fehlt dort
doch einmal etwas, holt `IMKEREI_ALLE_PAKETE=1 imkerei-update …` alle Pakete.

### Was du brauchst

- Ein **Uberspace-Konto** mit SSH-Zugang, am besten mit SSH-Schlüssel.
- Eine **Adresse** (Domain oder Unteradresse) für die App. Beim Domain-Anbieter
  zeigen die Einträge auf deinen Uberspace (die Werte nennt
  `uberspace web domain add`, siehe unten).
- Auf deinem Rechner: **git** und **Node.js 22** (mit npm). Unter Windows
  geht alles in der Git Bash.
- Den Quellcode dieses Repositorys auf deinem Rechner (`git clone`).

### Einmalig auf dem Uberspace vorbereiten

**1. PostgreSQL einrichten.** Du brauchst **PostgreSQL 15 oder neuer**.
Uberspace 7 bietet höchstens 15 an, damit ist die App dort getestet. Die
Installation mit Docker nutzt 16 (`postgres:16` in `docker-compose.yml`).
Stell die Version ein, bevor du die Datenbank anlegst, denn ein späterer
Wechsel der Hauptversion braucht eine Sicherung und ein Zurückspielen:

```
uberspace tools version list postgresql
uberspace tools version use postgresql 15
psql --version
```

Folge danach dem Uberspace-Lab
[PostgreSQL](https://lab.uberspace.de/guide_postgresql/). PostgreSQL läuft
dann als eigener Dienst auf einem eigenen Port. Lege einen Benutzer und eine
leere Datenbank an, die ihm gehört, zum Beispiel:

```
createuser imker -P
createdb -O imker imkerei_db
```

Merk dir Port, Datenbankname, Benutzer und Passwort. Das Passwort bitte **nur
aus Buchstaben und Ziffern**, es landet in einer Datenbank-Adresse.

> **Stolperstein:** Setzt die Lab-Anleitung `PGHOST` oder `PGPORT` in deiner
> `~/.bashrc`, können diese Werte die Angaben der App überschreiben, und die
> Verbindung wird abgelehnt. Die App verbindet sich über `127.0.0.1` und den
> Port aus der `.env`. Passt beides nicht zusammen, die Zeilen in der
> `.bashrc` anpassen oder entfernen.

**2. Repository für den Quellcode anlegen.** Der Quellcode kommt nicht von
GitHub, sondern aus einem Repository auf dem Uberspace selbst:

```
mkdir -p ~/git && git init --bare ~/git/imkerei_verwaltung
mkdir -p ~/imkerei_verwaltung_app
```

**3. Auf deinem Rechner das Repository als Ziel eintragen und hochladen.**
`BENUTZER` und `HOST` sind deine Uberspace-Angaben, `ZWEIG` der Zweig, der
laufen soll:

```
git remote add uberspace ssh://BENUTZER@HOST.uberspace.de/home/BENUTZER/git/imkerei_verwaltung
git push uberspace ZWEIG
```

Schick dabei keine Versions-Tags (`v1.2.3`) mit, solange der Zweig laufen
soll. Gibt es im Repository einen solchen Tag, nimmt die Einrichtung den
neuesten Tag statt des Zweigs.

**4. Auf deinem Rechner bauen und hochladen.** Im Ordner `web`:

```
npm ci
npx prisma generate
npx tsc --noEmit
npx next build
tar -czf next.tar.gz .next
scp next.tar.gz BENUTZER@HOST.uberspace.de:imkerei_verwaltung_app/
```

Bau immer aus genau dem Stand, den du hochgeladen hast. Pack nicht mit
`tar -h`: Dann kämen Programmdateien für dein Betriebssystem mit (etwa die
Bildbibliothek `sharp`), die auf dem Server nicht laufen.

**5. Einrichtung starten.** Auf dem Uberspace:

```
git --git-dir="$HOME/git/imkerei_verwaltung" show ZWEIG:installation/uberspace_setup.sh > ~/uberspace_setup.sh
IMKEREI_ZWEIG=ZWEIG bash ~/uberspace_setup.sh
```

Das Skript stellt Node.js 22 ein, holt den Quellcode nach
`~/imkerei_verwaltung_app/quelle`, fragt nach den Datenbank-Angaben aus
Schritt 1 und legt `~/imkerei_verwaltung_app/.env` an. Darin stehen ein freier
Port für die App, Zufallswerte und der **Einrichtungscode**. Danach installiert
es die Pakete, nimmt dein `next.tar.gz`, legt den Dienst unter supervisord an,
installiert den Befehl `imkerei-update` und startet die App. Am Ende zeigt es
Port und Einrichtungscode. Die Kopie `~/uberspace_setup.sh` kannst du danach
löschen.

**6. Adresse verbinden.** Auf dem Uberspace, mit dem Port aus Schritt 5:

```
uberspace web domain add DEINE-ADRESSE
uberspace web backend set DEINE-ADRESSE --http --port PORT
```

Wichtig: das Backend **immer für die Adresse der App** setzen, nie für `/`.
Sonst übernimmt die App alle Adressen deines Uberspace, etwa eine Website, die
dort schon läuft.

**7. Im Browser** `https://DEINE-ADRESSE` öffnen. Der Einrichtungsassistent
fragt den Einrichtungscode ab und legt deinen Zugang an.

### Updates auf dem Uberspace

Der Knopf *Update einspielen* unter Einstellungen → System ist für die
Docker-Installation gebaut und wirkt auf dem Uberspace nicht. Den Hinweis auf
neue Versionen kannst du dort abschalten. Ein Update geht so:

1. Auf deinem Rechner den neuen Stand hochladen: `git push uberspace ZWEIG`.
2. Daraus bauen und `next.tar.gz` hochladen wie in Schritt 4.
3. Auf dem Uberspace:

```
imkerei-update ZWEIG
```

Ohne Angabe nimmt `imkerei-update` den Zweig, der gerade läuft. Das Update
sichert zuerst Datenbank und hochgeladene Dateien, holt den neuen Stand,
installiert die Pakete, entpackt `next.tar.gz`, setzt die Paket-Links neu und
startet die App. Offene Datenbank-Änderungen laufen dabei von selbst.

`imkerei-update --bauen` baut auf dem Server, falls kein `next.tar.gz` da ist.
Das scheitert in der Regel am Speicher, und die App ist dann gestoppt. Nur im
Notfall nehmen.

**Zurück auf einen älteren Stand:** `imkerei-update ALTER-STAND`, also einen
Zweig, Tag oder Commit, dazu ein passendes `next.tar.gz`. Die Datenbank geht
dabei nicht von selbst zurück. Sicherungen liegen in
`~/imkerei_verwaltung_app/sicherungen`, die letzten 10 je Art bleiben.

### Wo liegt was auf dem Uberspace

- `~/git/imkerei_verwaltung`: das Repository, in das du hochlädst.
- `~/imkerei_verwaltung_app/quelle`: der laufende Quellcode. Nicht von Hand
  ändern, das Update überschreibt ihn.
- `~/imkerei_verwaltung_app/.env`: Datenbank-Adresse, Zufallswerte, Port und
  Einrichtungscode. **Gut aufbewahren**, nie weitergeben.
- `~/imkerei_verwaltung_app/dateien`: hochgeladene Fotos und Dokumente.
- `~/imkerei_verwaltung_app/sicherungen`: Sicherungen vor jedem Update.
- `~/imkerei_verwaltung_app/start.sh` und
  `~/etc/services.d/imkerei_verwaltung_app.ini`: Start und Dienst.
- `~/bin/imkerei-update`: der Update-Befehl. Er hält sich bei jedem Update
  selbst aktuell.

Liegt das Repository woanders, setze vor dem Befehl
`IMKEREI_REPO=/pfad/zum/repository`.

### Häufige Fragen auf dem Uberspace

**Läuft die App?** `supervisorctl status`

**Neu starten:** `supervisorctl restart imkerei_verwaltung_app`

**Protokoll ansehen:** `supervisorctl tail -4000 imkerei_verwaltung_app stderr`.
Warum der Dienst beendet wurde, steht in `~/logs/supervisord.log`, etwa mit
`grep -n 'exited: imkerei' ~/logs/supervisord.log | tail`.

**HTTP 500, im Protokoll „Cannot find package …“ mit einer Prüfnummer im
Namen:** Der Build verweist auf Pakete mit Prüfnummer im Namen. Diese Verweise
setzt das Update nach dem Entpacken neu. Hast du `next.tar.gz` von Hand
entpackt, einfach `imkerei-update` laufen lassen.

**Die App stürzt ohne Fehlermeldung ab** („terminated by SIGSEGV“ in
`~/logs/supervisord.log`): Auf Uberspace 7 bringt die Bildbibliothek `sharp`
den App-Prozess beim nächsten Abruf aus dem Internet zum Absturz. In diesem
Fork verkleinert deshalb ein eigener Prozess die Fotos
(`web/scripts/bild-verkleinern.mjs`). Kommt der Absturz trotzdem, prüfen, ob
neuer Code `sharp` wieder direkt lädt.

**Passwort vergessen:** Deine Daten bleiben dabei erhalten.

```
cd ~/imkerei_verwaltung_app/quelle/web
( set -a; . ~/imkerei_verwaltung_app/.env; set +a; node scripts/hauptzugang-zuruecksetzen.mjs )
supervisorctl restart imkerei_verwaltung_app
```

Danach kommt der Einrichtungsassistent wieder, den Code findest du in der
`.env`.

**Verbindungen nach außen:** Die App holt von sich aus Daten bei der LUBW
(Hornissen-Meldungen), bei GitHub (neue Versionen), bei Wolf (Bienenstockwaagen,
nur wenn eingeschaltet) und bei Open-Meteo (Wetterdaten für die
Grünlandtemperatursumme, nur mit eingeschalteten Waagen).
