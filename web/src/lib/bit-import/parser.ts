// Liest die PDF-Stockkarte, die BeeInTouch je Volk erzeugt, in Daten ein.
//
// Reiner Rechencode ohne pdf.js: er bekommt die Textstücke der PDF (PdfItem,
// siehe pdf-lesen.ts) in der Reihenfolge, in der sie in der Datei stehen.
// Die PDF stammt aus mPDF und schreibt jede Tabellenzeile Zelle für Zelle
// hintereinander. Darauf baut das Einlesen auf:
//  - Durchschau: eine Zeile endet mit ihrem Durchschaudatum.
//  - Honigernte, Fütterung, Kontrollen, Behandlungen: eine Zeile beginnt mit
//    ihrem Datum.
// Welche Zelle in welche Spalte gehört, ergibt sich aus der Lage der
// Spaltenüberschriften (nicht aus der Zahl der Zellen, denn leere Zellen
// stehen gar nicht in der Datei).

import type {
  BitBehandlung,
  BitDurchschau,
  BitFuetterung,
  BitHonigernte,
  BitStockkarte,
  BitVarroakontrolle,
  PdfItem,
} from "./typen";

// --- Kleine Helfer ----------------------------------------------------------

/// "13.08.2026" -> "2026-08-13"; null, wenn es kein gültiges Datum ist.
export function datumAusText(text: string): string | null {
  const treffer = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(text.trim());
  if (!treffer) return null;
  const tag = Number(treffer[1]);
  const monat = Number(treffer[2]);
  const jahr = Number(treffer[3]);
  if (jahr < 1990 || jahr > 2100 || monat < 1 || monat > 12 || tag < 1 || tag > 31) return null;
  if (new Date(Date.UTC(jahr, monat - 1, tag)).getUTCMonth() !== monat - 1) return null;
  return `${treffer[3]}-${treffer[2]}-${treffer[1]}`;
}

/// "5,00" -> 5, "-1" -> -1, "-" und alles andere -> null.
export function zahlAusText(text: string): number | null {
  const sauber = text.trim().replace("\u2212", "-");
  if (!/^-?\d+(?:,\d+)?$/.test(sauber)) return null;
  return Number(sauber.replace(",", "."));
}

/// "5,00 Liter" -> { zahl: 5, einheit: "Liter" }; "50 ml" -> { 50, "ml" }.
export function mengeAusText(text: string): { zahl: number | null; einheit: string } {
  const treffer = /^(-?\d{1,3}(?:\.\d{3})*(?:,\d+)?|-?\d+(?:[.,]\d+)?)\s*(.*)$/.exec(text.trim());
  if (!treffer) return { zahl: null, einheit: text.trim() };
  const roh = treffer[1].includes(",") ? treffer[1].replace(/\./g, "").replace(",", ".") : treffer[1];
  const zahl = Number(roh);
  return { zahl: Number.isFinite(zahl) ? zahl : null, einheit: treffer[2].trim() };
}

function jaNein(text: string | undefined): boolean | null {
  const t = (text ?? "").trim().toLowerCase();
  if (t === "ja") return true;
  if (t === "nein") return false;
  return null;
}

// --- Textstücke zu Zellen und Spalten ---------------------------------------

type Zelle = { text: string; x0: number; x1: number; mitte: number };
type Spalte = { x0: number; x1: number; mitte: number; label: string };

function grundlinie(item: PdfItem): number {
  return item.seitenHoehe - item.y;
}

/// Fasst aufeinanderfolgende Textstücke zu Zellen zusammen: Wörter einer Zeile
/// (kleiner Abstand) und Folgezeilen darunter, die unter dem Text der Zelle
/// stehen (mehrzeilige Bemerkungen).
function zellenBilden(items: PdfItem[]): Zelle[] {
  const zellen: Zelle[] = [];
  let aktuell: { teile: string[]; x0: number; x1: number; seite: number; basis: number; ende: number } | null = null;

  const abschliessen = () => {
    if (!aktuell) return;
    const text = aktuell.teile.join(" ").replace(/\s+/g, " ").trim();
    if (text) zellen.push({ text, x0: aktuell.x0, x1: aktuell.x1, mitte: (aktuell.x0 + aktuell.x1) / 2 });
    aktuell = null;
  };

  for (const item of items) {
    const x0 = item.x;
    const x1 = item.x + item.w;
    const basis = grundlinie(item);
    let weiter = false;
    if (aktuell && aktuell.seite === item.seite) {
      if (Math.abs(basis - aktuell.basis) < 1.2) {
        const luecke = x0 - aktuell.ende;
        weiter = luecke >= -2 && luecke <= 6;
      } else {
        const abstand = basis - aktuell.basis;
        const ueberlappt = x1 > aktuell.x0 - 3 && x0 < aktuell.x1 + 3;
        weiter = abstand > 0 && abstand < 3 * Math.max(item.h, 6) && ueberlappt;
      }
    }
    if (weiter && aktuell) {
      aktuell.teile.push(item.str);
      aktuell.x0 = Math.min(aktuell.x0, x0);
      aktuell.x1 = Math.max(aktuell.x1, x1);
      aktuell.basis = basis;
      aktuell.ende = x1;
    } else {
      abschliessen();
      aktuell = { teile: [item.str], x0, x1, seite: item.seite, basis, ende: x1 };
    }
  }
  abschliessen();
  return zellen;
}

/// Spalten aus den Überschriften: Texte, die sich waagerecht überlappen
/// (mehrzeilige Überschrift), gehören zur selben Spalte.
function spaltenBilden(kopf: PdfItem[]): Spalte[] {
  const gruppen: { x0: number; x1: number; teile: { text: string; reihenfolge: number }[] }[] = [];
  const sortiert = kopf.map((item, reihenfolge) => ({ item, reihenfolge })).sort((a, b) => a.item.x - b.item.x);
  for (const { item, reihenfolge } of sortiert) {
    const x0 = item.x;
    const x1 = item.x + item.w;
    const gruppe = gruppen.find((g) => x0 <= g.x1 + 3 && x1 >= g.x0 - 3);
    if (gruppe) {
      gruppe.x0 = Math.min(gruppe.x0, x0);
      gruppe.x1 = Math.max(gruppe.x1, x1);
      gruppe.teile.push({ text: item.str.trim(), reihenfolge });
    } else {
      gruppen.push({ x0, x1, teile: [{ text: item.str.trim(), reihenfolge }] });
    }
  }
  return gruppen
    .map((g) => ({
      x0: g.x0,
      x1: g.x1,
      mitte: (g.x0 + g.x1) / 2,
      label: g.teile
        .sort((a, b) => a.reihenfolge - b.reihenfolge)
        .map((t) => t.text)
        .join(" "),
    }))
    .sort((a, b) => a.x0 - b.x0);
}

function naechsteSpalte(spalten: Spalte[], zelle: Zelle): number {
  let beste = -1;
  let abstand = Infinity;
  spalten.forEach((spalte, index) => {
    const d = Math.abs(spalte.mitte - zelle.mitte);
    if (d < abstand) {
      abstand = d;
      beste = index;
    }
  });
  return beste;
}

// --- Abschnitte -------------------------------------------------------------

const UEBERSCHRIFTEN = ["Durchschau", "Honigernte", "Fütterung", "Varroakontrollen", "Varroabehandlungen"] as const;
type Abschnitt = "kopf" | (typeof UEBERSCHRIFTEN)[number];

/// Teilt die Textstücke an den Abschnitts-Überschriften. Eine Überschrift ist
/// größer geschrieben als das, was direkt danach kommt - so wird die
/// Spaltenüberschrift "Fütterung" in der Fütterungs-Tabelle nicht für den
/// Anfang eines neuen Abschnitts gehalten.
function abschnitteTeilen(items: PdfItem[]): Record<Abschnitt, PdfItem[]> {
  const ergebnis: Record<Abschnitt, PdfItem[]> = {
    kopf: [],
    Durchschau: [],
    Honigernte: [],
    Fütterung: [],
    Varroakontrollen: [],
    Varroabehandlungen: [],
  };
  const gesehen = new Set<string>();
  let aktuell: Abschnitt = "kopf";
  items.forEach((item, index) => {
    const text = item.str.trim();
    const kandidat = UEBERSCHRIFTEN.find((name) => name === text);
    const naechster = items[index + 1];
    if (kandidat && !gesehen.has(kandidat) && naechster && item.h > naechster.h + 0.4) {
      gesehen.add(kandidat);
      aktuell = kandidat;
      return;
    }
    ergebnis[aktuell].push(item);
  });
  return ergebnis;
}

// --- Kopf: Stocknummer, Stand, Königin --------------------------------------

const KOPF_FELDER: { schluessel: string; muster: RegExp }[] = [
  { schluessel: "stock", muster: /Stocknummer\s*:/ },
  { schluessel: "volkart", muster: /Volkart\s*:/ },
  { schluessel: "farbe", muster: /Königinnenfarbe\s*:/ },
  { schluessel: "zeichen", muster: /Kö-Zeichen\s*:/ },
  { schluessel: "zucht", muster: /Zuchtbuchnummer\s*:/ },
  { schluessel: "zugesetzt", muster: /Königin\s+zugesetzt\s+am\s*:/ },
];

function kopfLesen(items: PdfItem[]) {
  const text = items.map((item) => item.str.trim()).join(" ").replace(/\s+/g, " ");
  const funde = KOPF_FELDER.map((feld) => {
    const treffer = feld.muster.exec(text);
    return treffer ? { schluessel: feld.schluessel, start: treffer.index, ende: treffer.index + treffer[0].length } : null;
  })
    .filter((fund): fund is { schluessel: string; start: number; ende: number } => fund !== null)
    .sort((a, b) => a.start - b.start);
  const werte: Record<string, string> = {};
  funde.forEach((fund, index) => {
    const bis = index + 1 < funde.length ? funde[index + 1].start : text.length;
    werte[fund.schluessel] = text.slice(fund.ende, bis).trim();
  });

  let stocknummer = werte.stock ?? "";
  let stand = "";
  const mitStand = /^(.*?)\s*\(\s*Stand\s*:\s*(.*)\)\s*$/.exec(stocknummer);
  if (mitStand) {
    stocknummer = mitStand[1].trim();
    stand = mitStand[2].trim();
  }
  return {
    stocknummer,
    stand,
    volkart: werte.volkart ?? "",
    koeniginFarbe: werte.farbe ?? "",
    koeniginZeichen: werte.zeichen ?? "",
    zuchtbuchnummer: werte.zucht ?? "",
    koeniginZugesetzt: datumAusText(werte.zugesetzt ?? "") ?? "",
  };
}

// --- Durchschau --------------------------------------------------------------

const KOPFWOERTER = new Set([
  "Königin",
  "gesehen",
  "ausgeb.",
  "Waben",
  "Futterwaben",
  "Brutwaben",
  "Mittelwände",
  "Schwarmstimmung",
  "Sanftmut",
  "Wabensitz",
  "Volksstärke",
  "Brut",
  "Wirrbau",
  "Totale",
  "Brutentnahme",
  "Bemerkung",
  "Durchschaudatum",
]);

function durchschauSchluessel(label: string): string | null {
  const l = label.trim().toLowerCase();
  if (l.startsWith("königin")) return "gesehen";
  if (l.startsWith("ausgeb")) return "ausgeb";
  if (l.startsWith("futterwaben")) return "futter";
  if (l.startsWith("brutwaben")) return "brutwaben";
  if (l.startsWith("mittelwände")) return "mittel";
  if (l.startsWith("schwarm")) return "schwarm";
  if (l.startsWith("sanftmut")) return "sanftmut";
  if (l.startsWith("wabensitz")) return "wabensitz";
  if (l.startsWith("volksstärke")) return "volk";
  if (l === "brut") return "brut";
  if (l.startsWith("wirrbau")) return "wirrbau";
  if (l.startsWith("totale")) return "tbe";
  if (l.startsWith("bemerkung")) return "bemerkung";
  if (l.startsWith("durchschaudatum") || l === "datum") return "datum";
  return null;
}

function durchschauLesen(items: PdfItem[], warnungen: string[]): BitDurchschau[] {
  let anzahlKopf = 0;
  while (anzahlKopf < items.length && KOPFWOERTER.has(items[anzahlKopf].str.trim())) anzahlKopf++;
  if (anzahlKopf === 0) {
    if (items.length > 0) warnungen.push("Die Spaltenüberschriften der Durchschau wurden nicht erkannt.");
    return [];
  }
  const spalten = spaltenBilden(items.slice(0, anzahlKopf));
  const schluessel = spalten.map((spalte) => durchschauSchluessel(spalte.label));
  if (!schluessel.includes("datum")) {
    warnungen.push("In der Durchschau fehlt die Spalte mit dem Datum.");
    return [];
  }

  const zellen = zellenBilden(items.slice(anzahlKopf));
  const zeilen: BitDurchschau[] = [];
  let werte: Record<string, string> = {};

  for (const zelle of zellen) {
    const index = naechsteSpalte(spalten, zelle);
    const name = index >= 0 ? schluessel[index] : null;
    if (!name) continue;
    if (name === "datum") {
      const datum = datumAusText(zelle.text);
      if (!datum) continue;
      zeilen.push({
        datum,
        koeniginGesehen: jaNein(werte.gesehen),
        ausgebauteWaben: zahlAusText(werte.ausgeb ?? ""),
        futterwaben: zahlAusText(werte.futter ?? ""),
        brutwaben: zahlAusText(werte.brutwaben ?? ""),
        mittelwaende: zahlAusText(werte.mittel ?? ""),
        schwarmstimmung: zahlAusText(werte.schwarm ?? ""),
        sanftmut: zahlAusText(werte.sanftmut ?? ""),
        wabensitz: zahlAusText(werte.wabensitz ?? ""),
        volksstaerke: zahlAusText(werte.volk ?? ""),
        brut: zahlAusText(werte.brut ?? ""),
        wirrbau: zahlAusText(werte.wirrbau ?? ""),
        totaleBrutentnahme: jaNein(werte.tbe),
        bemerkung: (werte.bemerkung ?? "").trim(),
      });
      werte = {};
      continue;
    }
    werte[name] = werte[name] ? `${werte[name]} ${zelle.text}` : zelle.text;
  }
  // Was nach der letzten Datumszelle übrig ist (die Summenzeile am Ende der
  // Tabelle), gehört zu keinem Durchschau-Eintrag.
  return zeilen;
}

// --- Die übrigen Tabellen ------------------------------------------------------

/// Liest eine Tabelle, deren Zeilen mit einem Datum beginnen. Gibt die
/// Spalten (mit ihrer Überschrift) und je Zeile den Text je Spalte zurück.
function tabelleLesen(items: PdfItem[]): { spalten: Spalte[]; zeilen: string[][] } {
  const erstesDatum = items.findIndex((item) => datumAusText(item.str) !== null);
  if (erstesDatum < 0) return { spalten: [], zeilen: [] };
  const spalten = spaltenBilden(items.slice(0, erstesDatum));
  if (spalten.length === 0) return { spalten: [], zeilen: [] };

  const zeilen: string[][] = [];
  let zeile: string[] | null = null;
  for (const zelle of zellenBilden(items.slice(erstesDatum))) {
    if (/^(Summe|Durchschnitt)\b/i.test(zelle.text)) break;
    const index = naechsteSpalte(spalten, zelle);
    if (index === 0 && datumAusText(zelle.text)) {
      zeile = spalten.map(() => "");
      zeile[0] = zelle.text;
      zeilen.push(zeile);
      continue;
    }
    if (zeile && index >= 0) zeile[index] = zeile[index] ? `${zeile[index]} ${zelle.text}` : zelle.text;
  }
  return { spalten, zeilen };
}

function spaltenIndex(spalten: Spalte[], muster: RegExp): number {
  return spalten.findIndex((spalte) => muster.test(spalte.label));
}

function zelleText(zeile: string[], index: number): string {
  return index >= 0 ? (zeile[index] ?? "").trim() : "";
}

function honigernteLesen(items: PdfItem[]): BitHonigernte[] {
  const { spalten, zeilen } = tabelleLesen(items);
  const wasser = spaltenIndex(spalten, /wasser/i);
  const sorte = spaltenIndex(spalten, /sorte/i);
  const menge = spaltenIndex(spalten, /menge/i);
  return zeilen.map((zeile) => ({
    datum: datumAusText(zeile[0]) ?? "",
    wassergehalt: mengeAusText(zelleText(zeile, wasser)).zahl,
    sorte: zelleText(zeile, sorte),
    mengeKg: mengeAusText(zelleText(zeile, menge)).zahl,
  }));
}

function fuetterungLesen(items: PdfItem[]): BitFuetterung[] {
  const { spalten, zeilen } = tabelleLesen(items);
  const art = spaltenIndex(spalten, /\bart\b/i);
  const menge = spaltenIndex(spalten, /menge/i);
  return zeilen.map((zeile) => {
    const m = mengeAusText(zelleText(zeile, menge));
    return { datum: datumAusText(zeile[0]) ?? "", art: zelleText(zeile, art), menge: m.zahl, einheit: m.einheit };
  });
}

function varroakontrollenLesen(items: PdfItem[]): BitVarroakontrolle[] {
  const { spalten, zeilen } = tabelleLesen(items);
  const milbenfall = spaltenIndex(spalten, /milbenfall/i);
  const anzahl = spaltenIndex(spalten, /anzahl\s+varroa/i);
  const tage = spaltenIndex(spalten, /kontrolltage/i);
  const proTag = spaltenIndex(spalten, /varroen/i);
  return zeilen.map((zeile) => ({
    datum: datumAusText(zeile[0]) ?? "",
    milbenfall: zelleText(zeile, milbenfall),
    anzahl: mengeAusText(zelleText(zeile, anzahl)).zahl,
    kontrolltage: mengeAusText(zelleText(zeile, tage)).zahl,
    proTag: mengeAusText(zelleText(zeile, proTag)).zahl,
  }));
}

function behandlungenLesen(items: PdfItem[]): BitBehandlung[] {
  const { spalten, zeilen } = tabelleLesen(items);
  const mittel = spaltenIndex(spalten, /mittel/i);
  const methode = spaltenIndex(spalten, /methode/i);
  const menge = spaltenIndex(spalten, /menge/i);
  const totenfall = spaltenIndex(spalten, /totenfall/i);
  return zeilen.map((zeile) => {
    const m = mengeAusText(zelleText(zeile, menge));
    return {
      datum: datumAusText(zeile[0]) ?? "",
      mittel: zelleText(zeile, mittel),
      methode: zelleText(zeile, methode),
      menge: m.zahl,
      einheit: m.einheit,
      totenfall: mengeAusText(zelleText(zeile, totenfall)).zahl,
    };
  });
}

// --- Gesamte Stockkarte --------------------------------------------------------

/// Kopf- und Fußzeile jeder Seite ("Datum: ...", "Seite n") enthalten kein
/// Tabellenwissen und würden sonst als Zeilen mitgelesen.
function seitenRaenderEntfernen(items: PdfItem[]): PdfItem[] {
  return items.filter((item) => {
    if (item.str.trim() === "") return false;
    const vonOben = grundlinie(item);
    return vonOben >= 45 && vonOben <= item.seitenHoehe - 45;
  });
}

export function stockkarteLesen(rohItems: PdfItem[], quelle: string): BitStockkarte {
  const warnungen: string[] = [];
  const items = seitenRaenderEntfernen(rohItems);
  const teile = abschnitteTeilen(items);
  const kopf = kopfLesen(teile.kopf);

  if (!kopf.stocknummer) {
    warnungen.push("Keine Stocknummer gefunden. Ist das eine Stockkarte aus BeeInTouch?");
  }
  const durchschauen = durchschauLesen(teile.Durchschau, warnungen);
  const karte: BitStockkarte = {
    quelle,
    ...kopf,
    durchschauen,
    honigernten: honigernteLesen(teile.Honigernte).filter((zeile) => zeile.datum),
    fuetterungen: fuetterungLesen(teile.Fütterung).filter((zeile) => zeile.datum),
    varroakontrollen: varroakontrollenLesen(teile.Varroakontrollen).filter((zeile) => zeile.datum),
    behandlungen: behandlungenLesen(teile.Varroabehandlungen).filter((zeile) => zeile.datum),
    warnungen,
  };
  if (
    kopf.stocknummer &&
    karte.durchschauen.length +
      karte.honigernten.length +
      karte.fuetterungen.length +
      karte.varroakontrollen.length +
      karte.behandlungen.length ===
      0
  ) {
    warnungen.push("In dieser PDF wurden keine Einträge gefunden.");
  }
  return karte;
}
