import { prisma } from "@/lib/prisma";
import { entschluesseln } from "@/lib/geheim";
import { gtsBerechnen, gtsTageMischen, type GtsErgebnis } from "@/lib/gts";

// Bienenstockwaagen: Lesen für Seiten und Speichern der abgerufenen Werte. Ein
// Volk hat höchstens eine Waage (Waage.volkId). Einzelmessungen bleiben 14 Tage,
// je Tag bleibt dauerhaft eine Zeile für die Grünlandtemperatursumme.

export const MESSWERTE_TAGE = 14;
// Mehr Punkte zeigt ein Diagramm auf dieser Breite ohnehin nicht.
const MAX_DIAGRAMM_PUNKTE = 400;

export const WAAGEN_HERSTELLER_LABEL = { WOLF: "Wolf" } as const;

export function tagInBerlin(zeit: Date): string {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Berlin" }).format(zeit);
}

export async function waagenEinstellungLaden() {
  const zeile = await prisma.waagenEinstellung.findUnique({ where: { id: "standard" } });
  if (!zeile) return null;
  const passwort = zeile.passwortVerschluesselt ? entschluesseln(zeile.passwortVerschluesselt) : null;
  return { ...zeile, passwort, passwortLesbar: !zeile.passwortVerschluesselt || passwort !== null };
}

// Für das Formular "Volk bearbeiten". Leere Auswahl löst die Waage vom Volk, eine
// Waage von einem anderen Volk wechselt hierher.
export async function volkWaageSetzen(volkId: string, waageId: string) {
  await prisma.waage.updateMany({ where: { volkId, id: { not: waageId } }, data: { volkId: null } });
  if (waageId) await prisma.waage.update({ where: { id: waageId }, data: { volkId } });
}

export type StandGts = GtsErgebnis & {
  // Null, wenn am Stand keine Waage steht: dann nur Wetterdienst.
  waageName: string | null;
  waageId: string | null;
  tageWaage: number;
  tageWetter: number;
  jahr: number;
};

// Für das Formular "Stand bearbeiten": nur eine Waage, die dort steht; leer = automatisch.
export async function standWetterWaagePruefen(bienenstandId: string, waageId: string): Promise<string | null> {
  if (!waageId) return null;
  const waage = await prisma.waage.findFirst({ where: { id: waageId, volk: { bienenstandId } }, select: { id: true } });
  return waage?.id ?? null;
}

// Die Waage, deren Wetterdaten für den Stand zählen: die gewählte, solange sie
// noch dort steht, sonst die zuerst angelegte.
export async function wetterWaageLaden(bienenstandId: string) {
  const [stand, waagen] = await Promise.all([
    prisma.bienenstand.findUnique({ where: { id: bienenstandId }, select: { wetterWaageId: true } }),
    prisma.waage.findMany({
      where: { volk: { bienenstandId } },
      orderBy: { createdAt: "asc" },
      include: { volk: { select: { name: true } } },
    }),
  ]);
  return { gewaehlt: waagen.find((w) => w.id === stand?.wetterWaageId) ?? waagen[0] ?? null, waagen };
}

// Aus den eigenen Tageswerten der Waage, fehlende Tage vom Wetterdienst.
async function gtsLaden(
  bienenstandId: string,
  waage: { id: string; kennung: string; name: string | null } | null,
  jetzt: Date,
): Promise<StandGts> {
  const heute = tagInBerlin(jetzt);
  const jahr = Number(heute.slice(0, 4));
  const ab = new Date(Date.UTC(jahr, 0, 1));
  const [eigene, wetter] = await Promise.all([
    waage
      ? prisma.waagenTageswert.findMany({ where: { waageId: waage.id, tag: { gte: ab } }, select: { tag: true, temperaturMittelC: true } })
      : [],
    prisma.standWettertag.findMany({ where: { bienenstandId, tag: { gte: ab } }, select: { tag: true, mittelC: true } }),
  ]);
  const { tage, tageWaage, tageWetter } = gtsTageMischen(
    eigene.map((z) => ({ tag: z.tag.toISOString().slice(0, 10), mittelC: z.temperaturMittelC })),
    wetter.map((z) => ({ tag: z.tag.toISOString().slice(0, 10), mittelC: z.mittelC })),
    heute,
  );
  return {
    ...gtsBerechnen(tage, jahr, heute),
    waageName: waage ? waage.name || waage.kennung : null,
    waageId: waage?.id ?? null,
    tageWaage,
    tageWetter,
    jahr,
  };
}

export async function standGtsLaden(bienenstandId: string, jetzt = new Date()): Promise<StandGts> {
  const { gewaehlt } = await wetterWaageLaden(bienenstandId);
  return gtsLaden(bienenstandId, gewaehlt, jetzt);
}

function gtsText(gts: StandGts) {
  return `${gts.summe.toLocaleString("de-DE", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} °C`;
}

// Für den Kopf der Stockansicht: die Waage des Volks; ohne eigene Waage die des Stands.
export async function volkGtsText(
  waage: { id: string; kennung: string; name: string | null } | null,
  bienenstandId: string,
): Promise<string | null> {
  const gts = waage ? await gtsLaden(bienenstandId, waage, new Date()) : await standGtsLaden(bienenstandId);
  return gts.letzterTag ? gtsText(gts) : null;
}

// Für die Standübersicht: nur Stände, für die es schon Tageswerte gibt.
export async function standGtsTexte(bienenstandIds: string[]): Promise<Map<string, string>> {
  const texte = new Map<string, string>();
  await Promise.all(
    bienenstandIds.map(async (id) => {
      const gts = await standGtsLaden(id);
      if (gts.letzterTag) texte.set(id, gtsText(gts));
    }),
  );
  return texte;
}

export type VerlaufZeile = {
  t: number;
  gewicht: number | null;
  aenderung: number | null;
  // Gesamtänderung des Tages, zu dem diese Zeile gehört.
  tagesAenderung: number | null;
  temperatur: number | null;
  feuchte: number | null;
  regen: number | null;
};

function ausduennen<T>(liste: T[]): T[] {
  if (liste.length <= MAX_DIAGRAMM_PUNKTE) return liste;
  const schritt = Math.ceil(liste.length / MAX_DIAGRAMM_PUNKTE);
  return liste.filter((_, i) => i % schritt === 0);
}

export async function waagenVerlaufLaden(waageId: string, jetzt = new Date()) {
  const seit = new Date(jetzt.getTime() - MESSWERTE_TAGE * 24 * 60 * 60 * 1000);
  const [messwerte, tageswerte] = await Promise.all([
    prisma.waagenMesswert.findMany({ where: { waageId, zeitpunkt: { gte: seit } }, orderBy: { zeitpunkt: "asc" } }),
    // Ein Tag mehr: der erste Tag im Zeitraum ist bei den Messwerten nur halb.
    prisma.waagenTageswert.findMany({
      where: { waageId, tag: { gte: new Date(seit.getTime() - 24 * 60 * 60 * 1000) } },
      orderBy: { tag: "desc" },
    }),
  ]);

  // Tagesänderung von Wolf, sonst (noch keine Tageszeile) die Summe der Stunden.
  const wolfTage = new Map(tageswerte.map((t) => [t.tag.toISOString().slice(0, 10), t.ertragKg]));
  const summen = new Map<string, number>();
  for (const m of messwerte) {
    if (m.ertragKg === null) continue;
    const tag = tagInBerlin(m.zeitpunkt);
    summen.set(tag, (summen.get(tag) ?? 0) + m.ertragKg);
  }
  const zeilen: VerlaufZeile[] = ausduennen(messwerte).map((m) => ({
    t: m.zeitpunkt.getTime(),
    gewicht: m.gewichtKg,
    aenderung: m.ertragKg,
    tagesAenderung: wolfTage.get(tagInBerlin(m.zeitpunkt)) ?? summen.get(tagInBerlin(m.zeitpunkt)) ?? null,
    temperatur: m.temperaturC,
    feuchte: m.feuchteProzent,
    regen: m.regenMm,
  }));
  const mitGewicht = messwerte.filter((m) => m.gewichtKg !== null);
  const letzter = mitGewicht.at(-1) ?? null;
  const vorTag = letzter
    ? mitGewicht.find((m) => m.zeitpunkt.getTime() >= letzter.zeitpunkt.getTime() - 24 * 60 * 60 * 1000)
    : null;
  return {
    zeilen,
    tageswerte,
    letzterZeitpunkt: letzter?.zeitpunkt ?? null,
    letztesGewicht: letzter?.gewichtKg ?? null,
    aenderung24h: letzter?.gewichtKg != null && vorTag?.gewichtKg != null ? letzter.gewichtKg - vorTag.gewichtKg : null,
  };
}
