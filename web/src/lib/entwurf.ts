// Entwurf eines Stockkarten-Eintrags auf dem Gerät (localStorage) - damit
// eine am Stand erfasste Durchsicht bei Funkloch, Serverfehler oder einem
// Neuladen der Seite (iOS lädt Tabs im Hintergrund gern neu) nicht verloren
// geht. Gespeichert werden nur die Textwerte des Formulars; Fotos passen
// nicht in localStorage und müssen nach dem Wiederherstellen neu gewählt
// werden.
//
// Schlüssel: "entwurf:eintrag:<volkId>" für den Eintrag auf der Volk-Seite,
// "entwurf:sammel:<standId>" für den Sammel-Eintrag auf der Stand-Seite.
// Jeder Zugriff steckt in try/catch: im privaten Modus oder bei vollem
// Speicher wirft localStorage, das darf das Formular nie mitreißen.

import type { StockkartenEintragDefaults } from "@/components/stockkarten-eintrag-felder";

/// Ereignis (detail = Schlüssel), wenn ein Entwurf von außen abgelegt wurde -
/// z.B. aus der Warteschlange zurück ins Formular geholt.
export const ENTWURF_ABGELEGT = "entwurf-abgelegt";

export type Entwurf = {
  /// Zeitpunkt der letzten Sicherung (ISO), für den Hinweis "vom 17.10., 15:12".
  gespeichertAm: string;
  /// Alle Textfelder des Formulars in der Reihenfolge von FormData.
  felder: [string, string][];
};

/// Werte aus einem Entwurf, mit denen das Formular neu aufgebaut wird -
/// die Stockkarten-Felder plus das, was nur am Rand des Formulars steht.
export type EntwurfWerte = {
  werte: StockkartenEintragDefaults;
  /// Für das Datumsfeld, so wie es eingegeben war (datetime-local).
  datum: string | null;
  massnahmenText: string | null;
  fuettererAuf: boolean;
  /// Beim Sammel-Eintrag: die damals gewählten Völker.
  volkIds: string[];
};

/// Textfelder eines Formulars (ohne Dateien) - zum Sichern und zum
/// Vergleichen, ob schon etwas eingegeben wurde.
export function formularFelder(formData: FormData): [string, string][] {
  const felder: [string, string][] = [];
  for (const [name, wert] of formData.entries()) {
    if (typeof wert === "string") felder.push([name, wert]);
  }
  return felder;
}

export function entwurfLesen(schluessel: string): Entwurf | null {
  try {
    const roh = localStorage.getItem(schluessel);
    if (!roh) return null;
    const entwurf = JSON.parse(roh) as Entwurf;
    return Array.isArray(entwurf.felder) && typeof entwurf.gespeichertAm === "string" ? entwurf : null;
  } catch {
    return null;
  }
}

export function entwurfSchreiben(schluessel: string, felder: [string, string][]): boolean {
  try {
    const entwurf: Entwurf = { gespeichertAm: new Date().toISOString(), felder };
    localStorage.setItem(schluessel, JSON.stringify(entwurf));
    return true;
  } catch {
    return false;
  }
}

export function entwurfLoeschen(schluessel: string) {
  try {
    localStorage.removeItem(schluessel);
  } catch {
    // Nichts zu tun - ohne localStorage gibt es auch keinen Entwurf.
  }
}

/// "17.10., 15:12" - für den Hinweis oben im Formular.
export function entwurfZeitpunkt(entwurf: Entwurf): string {
  const datum = new Date(entwurf.gespeichertAm);
  const tag = datum.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit" });
  const zeit = datum.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });
  return `${tag}, ${zeit}`;
}

const JA_NEIN_FELDER = [
  "koeniginGesehen",
  "stifteGesehen",
  "larvenGesehen",
  "verdeckelteBrutGesehen",
  "weiselzellenGesehen",
  "drohnenbruetig",
  "drohnenbrutGeschnitten",
  "bienenAngeflogen",
  "abgeschwaermt",
  "honigGeerntet",
] as const;

const ZAHL_FELDER = [
  "volksstaerke",
  "bebrueteteWaben",
  "leerwaben",
  "mittelwaende",
  "brutwaben",
  "futterwaben",
  "baurahmenDrohnenrahmen",
  "varroaAnzahl",
  "varroaGemuellTage",
  "varroaBienenprobeGramm",
  "volksstaerkeEinschaetzung",
  "futtermengeEinschaetzung",
  "sanftmut",
  "schwarmtrieb",
  "wabensitz",
  "gesamteindruck",
  "legeleistung",
  "honigertragKg",
  "fuetterungMenge",
  "gewichtKg",
] as const;

const TEXT_FELDER = [
  "varroaZaehlweise",
  "biotechnischeMassnahmen",
  "honigart",
  "fuetterungArt",
  "wiegemethode",
  "notizen",
] as const;

function zahl(roh: string | undefined): number | null {
  if (roh === undefined || roh.trim() === "") return null;
  const wert = Number(roh.replace(",", "."));
  return Number.isFinite(wert) ? wert : null;
}

function jsonListe<T>(roh: string | undefined): T[] {
  if (!roh) return [];
  try {
    const wert = JSON.parse(roh);
    return Array.isArray(wert) ? (wert as T[]) : [];
  } catch {
    return [];
  }
}

/// Entwurf zurück in Vorgabewerte für die Stockkarten-Felder übersetzen -
/// dieselben Werte, mit denen auch ein gespeicherter Eintrag beim Bearbeiten
/// vorbelegt wird. Ein Gewicht als Summe ("13+17") wird dabei nicht
/// ausgerechnet und bleibt leer, wenn es keine Zahl ist.
export function entwurfAlsWerte(entwurf: Entwurf): EntwurfWerte {
  const felder = new Map<string, string>();
  for (const [name, wert] of entwurf.felder) if (!felder.has(name)) felder.set(name, wert);

  const werte: StockkartenEintragDefaults = {};
  for (const name of JA_NEIN_FELDER) werte[name] = felder.get(name) === "ja" ? true : null;
  for (const name of ZAHL_FELDER) werte[name] = zahl(felder.get(name));
  for (const name of TEXT_FELDER) werte[name] = felder.get(name) || null;

  const datum = felder.get("datum") || null;
  if (datum) werte.datum = new Date(datum);

  // Honig: Zeilen der Ernte, abgehakte Aufsätze, Korrektur und neu
  // aufgesetzte Honigräume stehen als JSON in versteckten Feldern.
  werte.honigernteAnteile = jsonListe<{ istZarge: boolean; groesseId: string; anzahl: number }>(
    felder.get("honigAnteile")
  ).map((zeile) => ({
    istZarge: zeile.istZarge,
    zargeId: zeile.istZarge ? zeile.groesseId : null,
    wabenmassId: zeile.istZarge ? null : zeile.groesseId,
    anzahl: zeile.anzahl,
  }));
  werte.geernteteAufsatzIds = jsonListe<string>(felder.get("honigGeernteteAufsaetze"));
  werte.honigKorrekturProzent = zahl(felder.get("honigKorrekturProzent"));
  werte.aufgesetzteHonigraeume = jsonListe<{ zargeId: string; anzahl: number; wabenbeschaffenheit: string }>(
    felder.get("honigraumAufgesetzt")
  ).flatMap((zeile) =>
    Array.from({ length: Math.max(1, zeile.anzahl) }, () => ({
      zargeId: zeile.zargeId,
      wabenbeschaffenheit: zeile.wabenbeschaffenheit,
    }))
  );

  return {
    werte,
    datum,
    massnahmenText: felder.get("massnahmenText") ?? null,
    fuettererAuf: felder.get("fuettererAuf") === "ja",
    volkIds: entwurf.felder.filter(([name]) => name === "volkIds").map(([, wert]) => wert),
  };
}
