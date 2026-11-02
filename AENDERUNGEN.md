# Änderungen

Was sich von Version zu Version ändert, in einfachen Worten. Daraus entsteht
beim Freigeben einer Version die Änderungsliste auf GitHub, und die App zeigt
sie unter "Was ist neu?" an (siehe `.github/workflows/release.yml`).

So sieht ein Abschnitt aus:

- Überschrift `## 1.4.0`, danach die Punkte als Liste.
- Ist es ein Sicherheitsupdate, steht das in der Überschrift:
  `## 1.4.1 (Sicherheitsupdate)`. Die App zeigt es dann rot an und bietet
  kein "Überspringen" an.
- Bei einer neuen Hauptversion (`## 2.0.0`) steht hier, was vorher zu tun ist.

Neue Abschnitte kommen oben hin.

## 1.1.0

- Neu unter Einstellungen: **Import aus BeeInTouch**. Du lädst die Stockkarten als PDF hoch (eine je Volk), siehst vorab, was angelegt wird, und die App übernimmt Durchschauen, Fütterungen, Behandlungen, Honigernten, Varroakontrollen und auf Wunsch die Königin. Die Einträge lassen sich einem Helfer zuschreiben. Derselbe Import lässt sich gefahrlos wiederholen, nichts wird doppelt angelegt.

## 1.0.1

- Testzugänge und Styleguide sind Werkzeuge für die Entwicklung. Sie erscheinen bei selbst installierten Instanzen nicht mehr in den Einstellungen.
- Nach `sudo imkerei-update --zurueck` zeigt die App jetzt "Von Hand zurückgegangen" statt "Update hat nicht geklappt". Das gilt für Server, die ab dieser Version installiert werden.

## 1.0.0

- Erste öffentliche Version.
- Bienenstände, Völker und Stockkarten mit Fotos, Bewertung und Verlauf.
- Königinnen, Zucht und Belegstellen.
- Behandlungen mit Nachweis, Maßnahmen, Kalender.
- Lager für Material und Honig.
- Helfer-Zugänge mit Lese- oder Schreibrecht.
- Speichern ohne Netz am Stand.
- Installation per Skript, Updates per Knopf.
