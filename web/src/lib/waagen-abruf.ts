import { mitSchema, prisma } from "@/lib/prisma";
import { kontoSchemas } from "@/lib/velutina";
import { wetterHolen } from "@/lib/wetter";
import { MESSWERTE_TAGE, tagInBerlin, waagenEinstellungLaden } from "@/lib/waagen";
import {
  WolfSitzungAbgelaufen,
  wolfHatDaten,
  wolfAnmelden,
  wolfDatenHolen,
  wolfMessAdresse,
  wolfReihenLesen,
  type WolfPunkt,
  type WolfSitzung,
} from "@/lib/wolf-waagen";

// Holt die Messwerte aller Waagen von Wolf. Läuft über den Zeitplan
// (instrumentation.ts), je Konto stündlich, von November bis Februar einmal am
// Tag. Bei jedem Abruf wird der abgefragte Zeitraum ersetzt: Die jüngste Stunde
// und der laufende Tag ändern sich noch, und nichts wird doppelt angelegt.

const STUNDE_MS = 60 * 60 * 1000;
const TAG_MS = 24 * STUNDE_MS;
// Der Zeitplan prüft stündlich, das darf nicht knapp am Abstand scheitern.
const SPIELRAUM_MS = 5 * 60 * 1000;
// So viele Stunden je Abruf neu holen, auch wenn einer ausgefallen ist.
const NACHLADEN_TAGE = 2;
const TAGE_JE_ANFRAGE = 14;
const ANFRAGE_PAUSE_MS = 250;

// Auf `globalThis`, weil Next.js den Code für Zeitplan und Seiten getrennt
// bündelt. Die Sitzungen bleiben nur im Speicher, nie in der Datenbank.
const gemeinsam = globalThis as unknown as {
  waagenAbgleich?: Promise<void> | null;
  wolfSitzungen?: Map<string, WolfSitzung>;
};
const sitzungen = (gemeinsam.wolfSitzungen ??= new Map<string, WolfSitzung>());

function abrufAbstandMs(jetzt: Date): number {
  const monat = Number(tagInBerlin(jetzt).slice(5, 7));
  return (monat >= 11 || monat <= 2 ? TAG_MS : STUNDE_MS) - SPIELRAUM_MS;
}

async function mitSitzung<T>(benutzer: string, passwort: string, ablauf: (sitzung: WolfSitzung) => Promise<T>): Promise<T> {
  let sitzung = sitzungen.get(benutzer);
  if (sitzung) {
    try {
      return await ablauf(sitzung);
    } catch (fehler) {
      if (!(fehler instanceof WolfSitzungAbgelaufen)) throw fehler;
      sitzungen.delete(benutzer);
    }
  }
  sitzung = await wolfAnmelden(benutzer, passwort);
  sitzungen.set(benutzer, sitzung);
  return ablauf(sitzung);
}

function tagDatum(tag: string): Date {
  return new Date(`${tag}T00:00:00Z`);
}

async function messwerteSpeichern(waageId: string, punkte: WolfPunkt[], von: Date, jetzt: Date) {
  const grenze = new Date(jetzt.getTime() - MESSWERTE_TAGE * TAG_MS);
  const neue = punkte.filter((p) => p.zeitpunkt >= von);
  await prisma.$transaction(async (tx) => {
    await tx.waagenMesswert.deleteMany({ where: { waageId, OR: [{ zeitpunkt: { gte: von } }, { zeitpunkt: { lt: grenze } }] } });
    await tx.waagenMesswert.createMany({
      data: neue.map((p) => ({
        waageId,
        zeitpunkt: p.zeitpunkt,
        gewichtKg: p.gewichtKg,
        ertragKg: p.ertragKg,
        temperaturC: p.temperaturC,
        feuchteProzent: p.feuchteProzent,
        regenMm: p.regenMm,
        windKmh: p.windKmh,
      })),
    });
  });
}

async function tageswerteSpeichern(waageId: string, zeilen: { tag: Date; p: WolfPunkt }[], abTag: string) {
  await prisma.$transaction(async (tx) => {
    await tx.waagenTageswert.deleteMany({ where: { waageId, tag: { gte: tagDatum(abTag) } } });
    await tx.waagenTageswert.createMany({
      data: zeilen.map(({ tag, p }) => ({
        waageId,
        tag,
        temperaturMittelC: p.temperaturC,
        temperaturMinC: p.temperaturMinC,
        temperaturMaxC: p.temperaturMaxC,
        gewichtKg: p.gewichtKg,
        ertragKg: p.ertragKg,
        regenMm: p.regenMm,
      })),
    });
  });
}

// Tageswerte ab wann? Einmal je Jahr alles ab dem 1. Januar (die GTS braucht
// jeden Tag), danach ab dem letzten vorhandenen Tag, damit auch Ausfälle
// nachkommen.
async function tageAbTag(waage: { id: string; tageGeladenJahr: number | null }, jetzt: Date): Promise<string> {
  const heute = tagInBerlin(jetzt);
  const jahr = heute.slice(0, 4);
  const jahresbeginn = `${jahr}-01-01`;
  if (waage.tageGeladenJahr !== Number(jahr)) return jahresbeginn;
  const letzter = await prisma.waagenTageswert.findFirst({
    where: { waageId: waage.id, tag: { gte: tagDatum(jahresbeginn) } },
    orderBy: { tag: "desc" },
    select: { tag: true },
  });
  const basis = letzter?.tag ?? tagDatum(heute);
  const ab = new Date(basis.getTime() - NACHLADEN_TAGE * TAG_MS).toISOString().slice(0, 10);
  return ab < jahresbeginn ? jahresbeginn : ab;
}

// Wolf liefert je Anfrage nur einen begrenzten Zeitraum, deshalb in Abschnitten.
// Die Reihen stehen dabei nach dem Tag: Wolf hängt Nachbartage an, und ein Tag
// aus einem späteren Abschnitt ersetzt einen früheren.
async function tageHolen(sitzung: WolfSitzung, kennung: string, abTag: string, jetzt: Date) {
  const nachTag = new Map<string, { tag: Date; p: WolfPunkt }>();
  for (let von = tagDatum(abTag).getTime(); von < jetzt.getTime(); von += TAGE_JE_ANFRAGE * TAG_MS) {
    const bis = new Date(Math.min(von + TAGE_JE_ANFRAGE * TAG_MS, jetzt.getTime()));
    // Mitternacht in Berlin; eine Stunde Unterschied im Sommer füllt Wolf vorn auf.
    const antwort = await wolfDatenHolen(sitzung, wolfMessAdresse(kennung, "day", new Date(von - 2 * STUNDE_MS), bis));
    if (wolfHatDaten(antwort)) {
      const start = tagDatum(tagInBerlin(new Date((antwort as { pointStart: number }).pointStart))).getTime();
      for (const p of wolfReihenLesen(antwort)) {
        const tag = new Date(start + p.index * TAG_MS);
        if (tag >= tagDatum(abTag)) nachTag.set(tag.toISOString(), { tag, p });
      }
    }
    if (bis.getTime() < jetzt.getTime()) await new Promise((fertig) => setTimeout(fertig, ANFRAGE_PAUSE_MS));
  }
  // Ganz ohne Daten stimmt etwas nicht: Vorhandenes bleibt dann stehen.
  if (nachTag.size === 0) throw new Error("Wolf hat keine Tageswerte geliefert.");
  return [...nachTag.values()];
}

async function waageAbrufen(
  sitzung: WolfSitzung,
  waage: { id: string; kennung: string; tageGeladenJahr: number | null },
  jetzt: Date,
) {
  // Zeilen von vor der Spalte ertragKg zählen nicht, die 14 Tage kommen dann neu.
  const hatMesswerte = await prisma.waagenMesswert.findFirst({
    where: { waageId: waage.id, ertragKg: { not: null } },
    select: { waageId: true },
  });
  const vonStunden = new Date(jetzt.getTime() - (hatMesswerte ? NACHLADEN_TAGE : MESSWERTE_TAGE) * TAG_MS);
  const stunden = wolfReihenLesen(await wolfDatenHolen(sitzung, wolfMessAdresse(waage.kennung, "hour", vonStunden, jetzt)));
  await messwerteSpeichern(waage.id, stunden, vonStunden, jetzt);

  const abTag = await tageAbTag(waage, jetzt);
  const tage = await tageHolen(sitzung, waage.kennung, abTag, jetzt);
  await tageswerteSpeichern(waage.id, tage, abTag);
  const jahr = Number(tagInBerlin(jetzt).slice(0, 4));
  if (waage.tageGeladenJahr !== jahr) {
    await prisma.waage.update({ where: { id: waage.id }, data: { tageGeladenJahr: jahr } });
  }
}

// Tagesmittel vom Wetterdienst für alle Stände mit Koordinaten, ab dem 1. Januar.
// Wetterdaten ändern sich nachträglich kaum, je Tag reicht ein Abruf.
async function wetterAbrufen(jetzt: Date): Promise<string[]> {
  const heute = tagInBerlin(jetzt);
  const jahresbeginn = `${heute.slice(0, 4)}-01-01`;
  const gestern = new Date(tagDatum(heute).getTime() - TAG_MS).toISOString().slice(0, 10);
  if (gestern < jahresbeginn) return [];

  const staende = await prisma.bienenstand.findMany({
    where: { archiviert: false, breitengrad: { not: null }, laengengrad: { not: null } },
    select: { id: true, name: true, breitengrad: true, laengengrad: true },
  });
  const fehler: string[] = [];
  for (const stand of staende) {
    try {
      const letzter = await prisma.standWettertag.findFirst({
        where: { bienenstandId: stand.id, tag: { gte: tagDatum(jahresbeginn) } },
        orderBy: { tag: "desc" },
        select: { tag: true },
      });
      const ab = letzter ? new Date(letzter.tag.getTime() + TAG_MS).toISOString().slice(0, 10) : jahresbeginn;
      if (ab > gestern) continue;
      const tage = await wetterHolen(stand.breitengrad!, stand.laengengrad!, ab, gestern);
      await prisma.standWettertag.createMany({
        data: tage.map((t) => ({ bienenstandId: stand.id, tag: tagDatum(t.tag), mittelC: t.mittelC })),
        skipDuplicates: true,
      });
    } catch (grund) {
      fehler.push(`Wetter ${stand.name}: ${grund instanceof Error ? grund.message : "unbekannter Fehler"}`);
    }
  }
  return fehler;
}

export type AbrufErgebnis = { ok: boolean; meldung: string };

// Für das angemeldete oder per mitSchema gewählte Konto.
export async function waagenAbrufen(): Promise<AbrufErgebnis> {
  const einstellung = await waagenEinstellungLaden();
  if (!einstellung?.aktiv) return { ok: false, meldung: "Der Bereich Waagen ist ausgeschaltet." };
  const benutzer = einstellung.benutzer;
  const passwort = einstellung.passwort;
  const jetzt = new Date();
  // Unabhängig von Wolf: auch Stände ohne Waage bekommen so ihre GTS.
  const fehler = await wetterAbrufen(jetzt);

  if (!benutzer || !passwort) {
    const meldung = "Die Wolf-Zugangsdaten fehlen oder sind nicht lesbar.";
    await prisma.waagenEinstellung.update({ where: { id: "standard" }, data: { fehler: meldung } });
    return { ok: false, meldung };
  }

  await prisma.waagenEinstellung.update({ where: { id: "standard" }, data: { letzterVersuch: jetzt } });
  const waagen = await prisma.waage.findMany({ select: { id: true, kennung: true, tageGeladenJahr: true } });

  for (const waage of waagen) {
    try {
      await mitSitzung(benutzer, passwort, (sitzung) => waageAbrufen(sitzung, waage, jetzt));
    } catch (grund) {
      fehler.push(`${waage.kennung}: ${grund instanceof Error ? grund.message : "unbekannter Fehler"}`);
    }
  }

  const meldung = fehler.join(" · ").slice(0, 500) || null;
  await prisma.waagenEinstellung.update({
    where: { id: "standard" },
    data: { fehler: meldung, ...(meldung ? {} : { letzterErfolg: new Date() }) },
  });
  if (meldung) {
    console.error(`Waagen-Abruf: ${meldung}`);
    return { ok: false, meldung };
  }
  return { ok: true, meldung: `${waagen.length} ${waagen.length === 1 ? "Waage" : "Waagen"} abgerufen.` };
}

async function kontoPruefen(jetzt: Date) {
  const stand = await prisma.waagenEinstellung.findUnique({
    where: { id: "standard" },
    select: { aktiv: true, letzterVersuch: true },
  });
  if (!stand?.aktiv) return;
  if (stand.letzterVersuch && jetzt.getTime() - stand.letzterVersuch.getTime() < abrufAbstandMs(jetzt)) return;
  await waagenAbrufen();
}

async function abgleichDurchfuehren() {
  const jetzt = new Date();
  for (const schema of await kontoSchemas()) {
    try {
      await mitSchema(schema, () => kontoPruefen(jetzt));
    } catch (fehler) {
      console.error(`Waagen-Abruf für ${schema} fehlgeschlagen:`, fehler);
    }
  }
}

// Läuft nie doppelt gleichzeitig.
export function waagenAbgleich(): Promise<void> {
  if (!gemeinsam.waagenAbgleich) {
    gemeinsam.waagenAbgleich = abgleichDurchfuehren().finally(() => {
      gemeinsam.waagenAbgleich = null;
    });
  }
  return gemeinsam.waagenAbgleich;
}
