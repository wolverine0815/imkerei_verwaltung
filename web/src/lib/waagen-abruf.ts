import { mitSchema, prisma } from "@/lib/prisma";
import { kontoSchemas } from "@/lib/velutina";
import { MESSWERTE_TAGE, tagInBerlin, waagenEinstellungLaden } from "@/lib/waagen";
import {
  WolfSitzungAbgelaufen,
  spur,
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
        temperaturC: p.temperaturC,
        feuchteProzent: p.feuchteProzent,
        regenMm: p.regenMm,
        windKmh: p.windKmh,
      })),
    });
  });
}

async function tageswerteSpeichern(waageId: string, punkte: WolfPunkt[], reihenStart: string, abTag: string) {
  const start = tagDatum(reihenStart).getTime();
  const zeilen = punkte
    .map((p) => ({ tag: new Date(start + p.index * TAG_MS), p }))
    .filter(({ tag }) => tag >= tagDatum(abTag));
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

// Tageswerte ab wann? Nach dem Einschalten und zum Jahreswechsel ab dem
// 1. Januar (die GTS braucht jeden Tag), sonst die letzten Tage.
async function tageAbTag(waageId: string, jetzt: Date): Promise<string> {
  const jahresbeginn = `${tagInBerlin(jetzt).slice(0, 4)}-01-01`;
  const letzter = await prisma.waagenTageswert.findFirst({
    where: { waageId, tag: { gte: tagDatum(jahresbeginn) } },
    orderBy: { tag: "desc" },
    select: { tag: true },
  });
  if (!letzter) return jahresbeginn;
  const ab = new Date(letzter.tag.getTime() - NACHLADEN_TAGE * TAG_MS).toISOString().slice(0, 10);
  return ab < jahresbeginn ? jahresbeginn : ab;
}

async function waageAbrufen(sitzung: WolfSitzung, waage: { id: string; kennung: string }, jetzt: Date) {
  const hatMesswerte = await prisma.waagenMesswert.findFirst({ where: { waageId: waage.id }, select: { waageId: true } });
  const vonStunden = new Date(jetzt.getTime() - (hatMesswerte ? NACHLADEN_TAGE : MESSWERTE_TAGE) * TAG_MS);
  const stunden = wolfReihenLesen(await wolfDatenHolen(sitzung, wolfMessAdresse(waage.kennung, "hour", vonStunden, jetzt)));
  spur(`Messwerte speichern (${stunden.length})`);
  await messwerteSpeichern(waage.id, stunden, vonStunden, jetzt);

  spur("Tageswerte vorbereiten");
  const abTag = await tageAbTag(waage.id, jetzt);
  // Mitternacht in Berlin; eine Stunde Unterschied im Sommer füllt Wolf vorn auf.
  const vonTagen = new Date(tagDatum(abTag).getTime() - 2 * STUNDE_MS);
  const antwort = await wolfDatenHolen(sitzung, wolfMessAdresse(waage.kennung, "day", vonTagen, jetzt));
  const tage = wolfReihenLesen(antwort);
  spur(`Tageswerte speichern (${tage.length})`);
  await tageswerteSpeichern(waage.id, tage, tagInBerlin(new Date((antwort as { pointStart: number }).pointStart)), abTag);
}

export type AbrufErgebnis = { ok: boolean; meldung: string };

// Für das angemeldete oder per mitSchema gewählte Konto.
export async function waagenAbrufen(): Promise<AbrufErgebnis> {
  spur("Start");
  const einstellung = await waagenEinstellungLaden();
  spur("Einstellung geladen");
  if (!einstellung?.aktiv) return { ok: false, meldung: "Der Bereich Waagen ist ausgeschaltet." };
  const benutzer = einstellung.benutzer;
  const passwort = einstellung.passwort;
  if (!benutzer || !passwort) {
    const meldung = "Die Wolf-Zugangsdaten fehlen oder sind nicht lesbar.";
    await prisma.waagenEinstellung.update({ where: { id: "standard" }, data: { fehler: meldung } });
    return { ok: false, meldung };
  }

  const jetzt = new Date();
  await prisma.waagenEinstellung.update({ where: { id: "standard" }, data: { letzterVersuch: jetzt } });
  spur("Versuch vermerkt");
  const waagen = await prisma.waage.findMany({ select: { id: true, kennung: true } });
  spur(`${waagen.length} Waagen`);

  const fehler: string[] = [];
  for (const waage of waagen) {
    try {
      await mitSitzung(benutzer, passwort, (sitzung) => waageAbrufen(sitzung, waage, jetzt));
    } catch (grund) {
      fehler.push(`${waage.kennung}: ${grund instanceof Error ? grund.message : "unbekannter Fehler"}`);
    }
  }

  spur(`Waagen fertig, ${fehler.length} Fehler`);
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
