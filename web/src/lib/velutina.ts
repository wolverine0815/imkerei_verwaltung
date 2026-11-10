import { BASIS_SCHEMA, basisPrisma } from "@/lib/datenbank";
import { lubwLage } from "@/lib/bundeslaender";
import { mitSchema, prisma } from "@/lib/prisma";
import { testerSchema } from "@/lib/konto";
import { mailFehlerKurz, mailKonfigLaden, mailSenden } from "@/lib/mail";
import {
  AKUT_STANDARD_M,
  VELUTINA_ART_LABEL,
  WARN_STANDARD_M,
  abstandAnzeige,
  meldungenImBereich,
  saisonBeginn,
  velutinaDatum,
  type StandPunkt,
  type VelutinaArt,
  type VelutinaPunkt,
} from "@/lib/velutina-daten";

// Fundmeldungen der Asiatischen Hornisse in Baden-Württemberg. Die LUBW
// zeigt sie auf ihrer Fundortkarte; dahinter liegt ein öffentlicher
// Kartendienst (ArcGIS-Server, Ebene "WFS Artenfunde"), den wir direkt
// abfragen. Er liefert jede geprüfte Meldung der Meldeplattform mit
// Funddatum, Freigabedatum, Nest/Einzeltier und Koordinaten.
//
// Abgerufen wird regelmäßig auf dem Server (siehe instrumentation.ts) und
// zusätzlich beim Öffnen der Velutina-Seite, wenn der letzte Abruf länger
// her ist. Die Meldungen sind für alle Konten gleich und liegen deshalb nur
// einmal im Schema "public".

const DIENST_URL =
  process.env.VELUTINA_QUELLE_URL ??
  "https://rips-gdi.lubw.baden-wuerttemberg.de/arcgis/rest/services/wfs/WFS_Artenfunde/MapServer/0/query";

// Mehr gibt der Dienst je Anfrage nicht heraus (maxRecordCount).
const SEITENGROESSE = 2000;
// Notbremse, falls der Dienst nie "fertig" meldet.
const MAX_SEITEN = 50;

export const ABRUF_ABSTAND_MS = 6 * 60 * 60 * 1000;

// Was beim allerersten Abruf schon im Dienst stand, ist Altbestand: es
// erscheint auf der Karte, löst aber weder Warnung noch Mail aus. Diese
// Meldungen bekommen als ersten Abrufzeitpunkt dieses feste Datum, gewarnt
// wird nur bei allem, was danach neu hinzukommt.
export const ALTBESTAND = new Date("2000-01-01T00:00:00Z");

type DienstAntwort = {
  features?: {
    attributes: Record<string, unknown>;
    geometry?: { points?: number[][]; x?: number; y?: number };
  }[];
  exceededTransferLimit?: boolean;
  error?: { message?: string };
};

type NeueMeldung = {
  id: string;
  art: VelutinaArt;
  datum: Date;
  eingestelltAm: Date | null;
  meldungsNr: string | null;
  breitengrad: number;
  laengengrad: number;
  unschaerfeM: number | null;
};

function artAusZaehlgroesse(wert: unknown): VelutinaArt {
  return typeof wert === "string" && wert.toLowerCase().startsWith("nest") ? "NEST" : "EINZELTIER";
}

function alsDatum(wert: unknown): Date | null {
  return typeof wert === "number" ? new Date(wert) : null;
}

// "Meldeplattform Asiatische Hornissenfunde 2026-08-3064" -> "2026-08-3064"
function meldungsNrAus(fundortName: unknown): string | null {
  if (typeof fundortName !== "string") return null;
  const treffer = fundortName.match(/(\d{4}-\d{2}-\d+)\s*$/);
  return treffer ? treffer[1] : null;
}

function meldungAusFeature(feature: NonNullable<DienstAntwort["features"]>[number]): NeueMeldung | null {
  const a = feature.attributes;
  const punkt = feature.geometry?.points?.[0] ?? (feature.geometry?.x != null ? [feature.geometry.x, feature.geometry.y!] : null);
  const datum = alsDatum(a.DATUM);
  if (!punkt || !datum || typeof punkt[0] !== "number" || typeof punkt[1] !== "number") return null;
  const art = artAusZaehlgroesse(a.ZAEHLGROESSE);
  const fundort = a.FUNDORT_NR ?? a.OBJECTID;
  return {
    id: `${fundort}-${datum.toISOString().slice(0, 10)}-${art}`,
    art,
    datum,
    eingestelltAm: alsDatum(a.EINSTELLDATUM),
    meldungsNr: meldungsNrAus(a.FUNDORT_NAME),
    laengengrad: punkt[0],
    breitengrad: punkt[1],
    unschaerfeM: typeof a.UNSCHAERFE === "number" ? a.UNSCHAERFE : null,
  };
}

async function seiteLaden(offset: number): Promise<DienstAntwort> {
  const parameter = new URLSearchParams({
    where: "ARTNAME_D='Asiatische Hornisse'",
    outFields: "OBJECTID,FUNDORT_NR,FUNDORT_NAME,DATUM,EINSTELLDATUM,ZAEHLGROESSE,UNSCHAERFE",
    // Der Dienst rechnet die Koordinaten selbst in Längen-/Breitengrad um
    // (intern UTM, EPSG:25832).
    outSR: "4326",
    orderByFields: "OBJECTID",
    resultOffset: String(offset),
    resultRecordCount: String(SEITENGROESSE),
    f: "json",
  });
  const antwort = await fetch(`${DIENST_URL}?${parameter}`, {
    signal: AbortSignal.timeout(60_000),
    cache: "no-store",
  });
  if (!antwort.ok) throw new Error(`LUBW-Dienst antwortet mit ${antwort.status}`);
  const daten = (await antwort.json()) as DienstAntwort;
  if (daten.error) throw new Error(`LUBW-Dienst meldet: ${daten.error.message ?? "Fehler"}`);
  return daten;
}

async function alleMeldungenLaden(): Promise<NeueMeldung[]> {
  const meldungen = new Map<string, NeueMeldung>();
  for (let seite = 0; seite < MAX_SEITEN; seite++) {
    const daten = await seiteLaden(seite * SEITENGROESSE);
    const features = daten.features ?? [];
    for (const feature of features) {
      const meldung = meldungAusFeature(feature);
      if (meldung) meldungen.set(meldung.id, meldung);
    }
    if (!daten.exceededTransferLimit || features.length === 0) break;
  }
  return [...meldungen.values()];
}

function stueckeln<T>(liste: T[], groesse: number): T[][] {
  const stuecke: T[][] = [];
  for (let i = 0; i < liste.length; i += groesse) stuecke.push(liste.slice(i, i + groesse));
  return stuecke;
}

// Holt alle Meldungen neu und gleicht die Tabelle ab: neue kommen dazu,
// verschwundene fliegen raus, vorhandene bleiben mit ihrem ersten
// Abrufzeitpunkt (der entscheidet über "neu").
async function meldungenAbgleichen(): Promise<{ jetzt: Date; anzahl: number }> {
  const jetzt = new Date();
  const geladen = await alleMeldungenLaden();

  const vorher = await basisPrisma.velutinaMeldung.count();
  // Liefert der Dienst plötzlich viel weniger als bisher (Wartung, halbe
  // Antwort), lieber nichts löschen als die Karte leerzuräumen.
  if (geladen.length === 0 || geladen.length < vorher * 0.5) {
    throw new Error(`LUBW-Dienst lieferte nur ${geladen.length} Meldungen (bisher ${vorher}), nichts geändert`);
  }

  for (const stueck of stueckeln(geladen, 1000)) {
    await basisPrisma.velutinaMeldung.createMany({
      data: stueck.map((meldung) => ({
        ...meldung,
        erstmalsAbgerufenAm: vorher === 0 ? ALTBESTAND : jetzt,
        zuletztGesehenAm: jetzt,
      })),
      skipDuplicates: true,
    });
    await basisPrisma.velutinaMeldung.updateMany({
      where: { id: { in: stueck.map((meldung) => meldung.id) } },
      data: { zuletztGesehenAm: jetzt },
    });
  }
  await basisPrisma.velutinaMeldung.deleteMany({ where: { zuletztGesehenAm: { lt: jetzt } } });

  return { jetzt, anzahl: geladen.length };
}

export type VelutinaEinstellungWerte = {
  akutRadiusM: number;
  warnRadiusM: number;
  gesehenBis: Date | null;
  mailAn: boolean;
  mailGeprueftBis: Date | null;
};

// Einstellungen des angemeldeten Kontos (bzw. des per mitSchema gewählten).
export async function velutinaEinstellungLaden(): Promise<VelutinaEinstellungWerte> {
  const eintrag = await prisma.velutinaEinstellung.findUnique({ where: { id: "standard" } });
  return {
    akutRadiusM: eintrag?.akutRadiusM ?? AKUT_STANDARD_M,
    warnRadiusM: eintrag?.warnRadiusM ?? WARN_STANDARD_M,
    gesehenBis: eintrag?.gesehenBis ?? null,
    mailAn: eintrag?.mailAn ?? true,
    mailGeprueftBis: eintrag?.mailGeprueftBis ?? null,
  };
}

export async function standPunkteLaden(): Promise<StandPunkt[]> {
  const staende = await prisma.bienenstand.findMany({
    where: { archiviert: false, breitengrad: { not: null }, laengengrad: { not: null } },
    select: { id: true, name: true, breitengrad: true, laengengrad: true, standtyp: true },
    orderBy: { name: "asc" },
  });
  return staende.map((stand) => ({
    id: stand.id,
    name: stand.name,
    lat: stand.breitengrad!,
    lng: stand.laengengrad!,
    wanderstand: stand.standtyp === "WANDER",
  }));
}

export async function meldungenLaden(ab: Date | null, bis: Date | null, gesehenBis: Date | null): Promise<VelutinaPunkt[]> {
  const zeilen = await basisPrisma.velutinaMeldung.findMany({
    where: { datum: { ...(ab ? { gte: ab } : {}), ...(bis ? { lt: bis } : {}) } },
    orderBy: { datum: "desc" },
  });
  return zeilen.map((zeile) => ({
    id: zeile.id,
    art: zeile.art as VelutinaArt,
    datum: zeile.datum,
    meldungsNr: zeile.meldungsNr,
    lat: zeile.breitengrad,
    lng: zeile.laengengrad,
    neu: zeile.erstmalsAbgerufenAm > (gesehenBis ?? ALTBESTAND),
  }));
}

// Meldungen der laufenden Saison im Akut-/Warnbereich der eigenen Stände.
export async function saisonLage() {
  const [einstellung, staende] = await Promise.all([velutinaEinstellungLaden(), standPunkteLaden()]);
  if (staende.length === 0) return { einstellung, staende, imBereich: [] };
  const meldungen = await meldungenLaden(saisonBeginn(), null, einstellung.gesehenBis);
  return {
    einstellung,
    staende,
    imBereich: meldungenImBereich(meldungen, staende, einstellung.akutRadiusM, einstellung.warnRadiusM),
  };
}

// Meldungen der laufenden Saison im Akut-/Warnbereich eines einzelnen Stands
// (für den Velutina-Status auf der Stand-Seite, auch bei archivierten).
export async function standLage(stand: StandPunkt) {
  const einstellung = await velutinaEinstellungLaden();
  const [meldungen, abruf] = await Promise.all([
    meldungenLaden(saisonBeginn(), null, einstellung.gesehenBis),
    abrufStandLaden(),
  ]);
  return {
    einstellung,
    letzterAbruf: abruf?.letzterErfolg ?? null,
    imBereich: meldungenImBereich(meldungen, [stand], einstellung.akutRadiusM, einstellung.warnRadiusM),
  };
}

// Für Abzeichen im Menü und Hinweis auf der Startseite: nur, was noch nicht
// als gesehen abgehakt ist.
export async function neueVelutinaWarnungen() {
  try {
    const { imBereich } = await saisonLage();
    return imBereich.filter((meldung) => meldung.neu);
  } catch {
    // Eine fehlende Tabelle o.ä. darf nie die ganze App lahmlegen.
    return [];
  }
}

function kartenLink(lat: number, lng: number): string {
  return `https://www.openstreetmap.org/?mlat=${lat.toFixed(5)}&mlon=${lng.toFixed(5)}#map=15/${lat.toFixed(5)}/${lng.toFixed(5)}`;
}

const MAX_MAIL_ZEILEN = 30;

// Schickt dem gerade gewählten Konto eine Mail mit den Meldungen, die seit
// der letzten Prüfung neu hinzugekommen sind und in einem seiner Bereiche
// liegen. Ohne eingerichteten Mailversand passiert nichts.
async function mailBenachrichtigung(abrufZeit: Date): Promise<void> {
  // Bereich "Velutina" ausgeschaltet (Einstellungen -> Bereiche): keine Mail.
  // Die Prüfmarke rückt trotzdem vor, damit beim Wiedereinschalten nicht alles
  // Aufgelaufene auf einmal gemeldet wird.
  // Ebenso außerhalb Baden-Württembergs: dort gibt es keine LUBW-Meldungen.
  const bereichswahl = await prisma.bereichswahl.findUnique({ where: { id: "standard" } });
  if (bereichswahl?.abgeschaltet.includes("velutina") || (await lubwLage()) === "anderes") {
    await prisma.velutinaEinstellung.upsert({
      where: { id: "standard" },
      create: { id: "standard", mailGeprueftBis: abrufZeit },
      update: { mailGeprueftBis: abrufZeit },
    });
    return;
  }

  const einstellung = await velutinaEinstellungLaden();
  const konfig = await mailKonfigLaden();
  const mailMoeglich = einstellung.mailAn && konfig?.getestetAm && konfig.passwortLesbar;

  if (mailMoeglich) {
    const staende = await standPunkteLaden();
    const zeilen = await basisPrisma.velutinaMeldung.findMany({
      where: {
        datum: { gte: saisonBeginn() },
        erstmalsAbgerufenAm: { gt: einstellung.mailGeprueftBis ?? ALTBESTAND },
      },
    });
    const neue = meldungenImBereich(
      zeilen.map((zeile) => ({
        id: zeile.id,
        art: zeile.art as VelutinaArt,
        datum: zeile.datum,
        meldungsNr: zeile.meldungsNr,
        lat: zeile.breitengrad,
        lng: zeile.laengengrad,
        neu: true,
      })),
      staende,
      einstellung.akutRadiusM,
      einstellung.warnRadiusM,
    );

    if (neue.length > 0) {
      const akut = neue.filter((meldung) => meldung.bereich === "akut");
      const warnung = neue.filter((meldung) => meldung.bereich === "warnung");
      const zeile = (meldung: (typeof neue)[number]) =>
        `- ${VELUTINA_ART_LABEL[meldung.art]}, Fund vom ${velutinaDatum(meldung.datum)}, ${abstandAnzeige(meldung.abstandM)} von Stand ${meldung.standName}` +
        `${meldung.meldungsNr ? ` (Meldung ${meldung.meldungsNr})` : ""}\n  ${kartenLink(meldung.lat, meldung.lng)}`;
      const abschnitt = (titel: string, liste: typeof neue) =>
        liste.length === 0
          ? ""
          : `${titel}:\n${liste.slice(0, MAX_MAIL_ZEILEN).map(zeile).join("\n")}` +
            (liste.length > MAX_MAIL_ZEILEN ? `\n... und ${liste.length - MAX_MAIL_ZEILEN} weitere` : "") +
            "\n\n";

      const betrieb = await prisma.betrieb.findUnique({ where: { id: "standard" }, select: { email: true } });
      const empfaenger = betrieb?.email?.trim() || konfig.absender;
      const nester = neue.filter((meldung) => meldung.art === "NEST").length;
      const betreff =
        `Asiatische Hornisse: ${neue.length} neue ${neue.length === 1 ? "Meldung" : "Meldungen"} nahe deinen Ständen` +
        (akut.length > 0 ? ` (${akut.length} im Akutbereich)` : "");
      const text =
        `Neue geprüfte Fundmeldungen der Asiatischen Hornisse in der Nähe deiner Bienenstände` +
        (nester > 0 ? `, darunter ${nester} ${nester === 1 ? "Nest" : "Nester"}` : "") +
        `.\n\n` +
        abschnitt(`Akutbereich (bis ${abstandAnzeige(einstellung.akutRadiusM)})`, akut) +
        abschnitt(`Warnbereich (bis ${abstandAnzeige(einstellung.warnRadiusM)})`, warnung) +
        `Alle Meldungen auf der Karte: Menüpunkt „Velutina“ in der Imkereiverwaltung.\n` +
        `Quelle: LUBW, Meldeplattform Asiatische Hornisse. Die LUBW gibt Meldungen erst nach Prüfung frei, das kann einige Wochen dauern.\n`;

      try {
        await mailSenden(konfig, { an: [empfaenger], absenderName: "Imkereiverwaltung", betreff, text });
      } catch (fehler) {
        // Beim nächsten Abruf erneut versuchen - die Prüfmarke bleibt stehen.
        console.error(`Velutina-Mail nicht gesendet: ${mailFehlerKurz(fehler)}`);
        return;
      }
    }
  }

  await prisma.velutinaEinstellung.upsert({
    where: { id: "standard" },
    create: { id: "standard", mailGeprueftBis: abrufZeit },
    update: { mailGeprueftBis: abrufZeit },
  });
}

export async function kontoSchemas(): Promise<string[]> {
  const tester = await basisPrisma.testzugang.findMany({
    where: { eingerichtetAm: { not: null } },
    select: { id: true },
  });
  return [BASIS_SCHEMA, ...tester.map((zugang) => testerSchema(zugang.id))];
}

// Auf `globalThis`, weil Next.js den Code für Zeitplan (instrumentation.ts)
// und Seiten getrennt bündelt - eine Modulvariable gäbe es dann zweimal.
const globalFuerAbgleich = globalThis as unknown as { velutinaAbgleich?: Promise<void> | null };

// Ein vollständiger Durchgang: Meldungen holen, dann jedes Konto prüfen und
// ggf. benachrichtigen. Läuft nie doppelt gleichzeitig.
export function velutinaAbgleich(): Promise<void> {
  if (!globalFuerAbgleich.velutinaAbgleich) {
    globalFuerAbgleich.velutinaAbgleich = abgleichDurchfuehren().finally(() => {
      globalFuerAbgleich.velutinaAbgleich = null;
    });
  }
  return globalFuerAbgleich.velutinaAbgleich;
}

async function abgleichDurchfuehren(): Promise<void> {
  const versuch = new Date();
  await basisPrisma.velutinaAbruf.upsert({
    where: { id: "standard" },
    create: { id: "standard", letzterVersuch: versuch },
    update: { letzterVersuch: versuch },
  });

  let ergebnis: { jetzt: Date; anzahl: number };
  try {
    ergebnis = await meldungenAbgleichen();
  } catch (fehler) {
    const meldung = fehler instanceof Error ? fehler.message : String(fehler);
    console.error(`Velutina-Abruf fehlgeschlagen: ${meldung}`);
    await basisPrisma.velutinaAbruf.update({
      where: { id: "standard" },
      data: { fehler: meldung.slice(0, 500) },
    });
    return;
  }

  await basisPrisma.velutinaAbruf.update({
    where: { id: "standard" },
    data: { letzterErfolg: ergebnis.jetzt, fehler: null, anzahl: ergebnis.anzahl },
  });

  for (const schema of await kontoSchemas()) {
    try {
      await mitSchema(schema, () => mailBenachrichtigung(ergebnis.jetzt));
    } catch (fehler) {
      console.error(`Velutina-Benachrichtigung für ${schema} fehlgeschlagen:`, fehler);
    }
  }
}

export async function abrufStandLaden() {
  return basisPrisma.velutinaAbruf.findUnique({ where: { id: "standard" } });
}

// Ist der letzte Versuch länger her als der Abrufabstand?
export async function abgleichFaellig(): Promise<boolean> {
  const stand = await abrufStandLaden();
  return !stand?.letzterVersuch || Date.now() - stand.letzterVersuch.getTime() > ABRUF_ABSTAND_MS;
}

export async function neuesteFreigabe(): Promise<Date | null> {
  const neueste = await basisPrisma.velutinaMeldung.findFirst({
    where: { eingestelltAm: { not: null } },
    orderBy: { eingestelltAm: "desc" },
    select: { eingestelltAm: true },
  });
  return neueste?.eingestelltAm ?? null;
}
