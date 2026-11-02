// Macht aus einer eingelesenen BeeInTouch-Stockkarte (parser.ts) das, was in
// der App angelegt werden soll: Stockkarten-Einträge, Behandlungen,
// biotechnische Verfahren und - auf Wunsch - die Königin.
//
// Reiner Rechencode ohne Datenbank. Die Vorschau im Browser und das
// eigentliche Anlegen auf dem Server rufen dieselbe Funktion auf, damit beide
// immer das Gleiche meinen.
//
// Zuordnung der Bewertungen: BeeInTouch bewertet von 1 (schlecht) bis 5 (sehr
// gut), die App als Note von 1,0 (beste Stufe) bis 6,0. Aus 5 wird 1,0, aus 4
// wird 2,0 usw. (Note = 6 - Wert). Die Namen der Stufen passen dazu: "5" ist
// bei der Sanftmut "sehr sanft", beim Schwarmtrieb "keiner".

import type { BitBehandlung, BitDurchschau, BitFuetterung, BitHonigernte, BitStockkarte, BitVarroakontrolle } from "./typen";

export type Optionen = {
  durchschauen: boolean;
  fuetterungen: boolean;
  honigernten: boolean;
  varroakontrollen: boolean;
  behandlungen: boolean;
  koenigin: boolean;
};

export const STANDARD_OPTIONEN: Optionen = {
  durchschauen: true,
  fuetterungen: true,
  honigernten: true,
  varroakontrollen: true,
  behandlungen: true,
  koenigin: true,
};

export type FuetterungsArt =
  | "INVERTZUCKERSIRUP"
  | "WEIZENSIRUP"
  | "ZUCKERWASSER_1_1"
  | "ZUCKERWASSER_3_2"
  | "FUTTERTEIG"
  | "EIWEISSFUTTERTEIG"
  | "SONSTIGE";

export type VarroaZaehlweise = "PUDERZUCKER" | "AUSWASCHUNG" | "GEMUELLDIAGNOSE" | "SONSTIGE";

/// Felder eines Stockkarten-Eintrags. Nur was gesetzt ist, wird gespeichert.
export type EintragFelder = {
  koeniginGesehen?: boolean;
  leerwaben?: number;
  mittelwaende?: number;
  brutwaben?: number;
  futterwaben?: number;
  volksstaerkeEinschaetzung?: number;
  sanftmut?: number;
  schwarmtrieb?: number;
  wabensitz?: number;
  legeleistung?: number;
  fuetterungArt?: FuetterungsArt;
  fuetterungMengeKg?: number;
  honigGeerntet?: boolean;
  honigart?: string;
  honigertragKg?: number;
  varroaZaehlweise?: VarroaZaehlweise;
  varroaAnzahl?: number;
  varroaGemuellTage?: number;
  notizen?: string;
};

export type EintragArt = "durchschau" | "fuetterung" | "honigernte" | "varroakontrolle";

export type EintragEntwurf = {
  /// Kennung für die Doppelt-Erkennung: derselbe Eintrag wird nie zweimal angelegt.
  sendungId: string;
  /// "JJJJ-MM-TT" und "HH:MM" (Ortszeit).
  datum: string;
  uhrzeit: string;
  art: EintragArt;
  /// Eine Zeile für die Vorschau.
  kurz: string;
  felder: EintragFelder;
};

export type BehandlungEntwurf = {
  schluessel: string;
  datum: string;
  mittel: string;
  methode: string;
  menge: number;
  einheit: string;
  /// In der PDF stand keine Menge: 0 wird eingetragen.
  mengeFehlt: boolean;
};

export type VerfahrenEntwurf = {
  schluessel: string;
  datum: string;
  bemerkung: string;
};

export type KoeniginEntwurf = {
  kennung: string;
  zuchtbuchnummer: string;
  zeichenFarbe: string;
  /// "JJJJ-MM-TT" oder leer.
  zugesetzt: string;
};

export type Plan = {
  eintraege: EintragEntwurf[];
  behandlungen: BehandlungEntwurf[];
  verfahren: VerfahrenEntwurf[];
  koenigin: KoeniginEntwurf | null;
  /// Zeilen, die nicht übernommen werden, mit Grund.
  uebersprungen: string[];
};

// --- Helfer ----------------------------------------------------------------

function hash(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(36);
}

export function datumDeutsch(iso: string): string {
  const [jahr, monat, tag] = iso.split("-");
  return `${tag}.${monat}.${jahr}`;
}

function zahlDeutsch(zahl: number): string {
  return String(Math.round(zahl * 100) / 100).replace(".", ",");
}

function kuerzen(text: string, laenge: number): string {
  const sauber = text.replace(/\s+/g, " ").trim();
  return sauber.length <= laenge ? sauber : `${sauber.slice(0, laenge - 1).trimEnd()}…`;
}

/// BeeInTouch-Wert (1 schlecht bis 5 sehr gut) als Note der App (1,0 bis 6,0).
export function noteAusBeeInTouch(wert: number | null): number | undefined {
  if (wert === null || wert < 1 || wert > 5) return undefined;
  return Math.round((6 - wert) * 2) / 2;
}

function minutenAlsUhrzeit(minuten: number): string {
  const h = Math.floor(minuten / 60);
  const m = minuten % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

const GRUNDZEIT: Record<EintragArt, number> = {
  durchschau: 12 * 60,
  varroakontrolle: 12 * 60 + 20,
  honigernte: 12 * 60 + 30,
  fuetterung: 12 * 60 + 40,
};

/// Eindeutige Kennung je Quellzeile; identische Zeilen am selben Tag bekommen
/// eine laufende Nummer dazu.
function kennungen() {
  const gesehen = new Map<string, number>();
  return (art: string, datum: string, quelle: unknown): string => {
    const basis = `bit-${art}-${datum}-${hash(JSON.stringify(quelle))}`;
    const n = gesehen.get(basis) ?? 0;
    gesehen.set(basis, n + 1);
    return n === 0 ? basis : `${basis}-${n}`;
  };
}

/// Bei Zeilen am selben Tag steht die jüngere in BeeInTouch weiter oben: so
/// bekommt die ältere die frühere Uhrzeit (Reihenfolge im Verlauf bleibt).
function minutenVersatz<T extends { datum: string }>(liste: T[]): number[] {
  return liste.map((eintrag, index) => liste.slice(index + 1).filter((andere) => andere.datum === eintrag.datum).length);
}

// --- Durchschau --------------------------------------------------------------

function entnommenText(d: BitDurchschau): string | null {
  const teile: string[] = [];
  const dazu = (wert: number | null, einzahl: string, mehrzahl: string) => {
    if (wert !== null && wert < 0) teile.push(`${-wert} ${-wert === 1 ? einzahl : mehrzahl}`);
  };
  dazu(d.ausgebauteWaben, "ausgebaute Wabe", "ausgebaute Waben");
  dazu(d.futterwaben, "Futterwabe", "Futterwaben");
  dazu(d.brutwaben, "Brutwabe", "Brutwaben");
  dazu(d.mittelwaende, "Mittelwand", "Mittelwände");
  return teile.length > 0 ? `Entnommen: ${teile.join(", ")}.` : null;
}

function durchschauEntwurf(d: BitDurchschau): { felder: EintragFelder; kurz: string } {
  const felder: EintragFelder = {};
  if (d.koeniginGesehen !== null) felder.koeniginGesehen = d.koeniginGesehen;
  if (d.ausgebauteWaben !== null && d.ausgebauteWaben > 0) felder.leerwaben = d.ausgebauteWaben;
  if (d.futterwaben !== null && d.futterwaben > 0) felder.futterwaben = d.futterwaben;
  if (d.brutwaben !== null && d.brutwaben > 0) felder.brutwaben = d.brutwaben;
  if (d.mittelwaende !== null && d.mittelwaende > 0) felder.mittelwaende = d.mittelwaende;

  const volk = noteAusBeeInTouch(d.volksstaerke);
  const sanftmut = noteAusBeeInTouch(d.sanftmut);
  const schwarm = noteAusBeeInTouch(d.schwarmstimmung);
  const sitz = noteAusBeeInTouch(d.wabensitz);
  const brut = noteAusBeeInTouch(d.brut);
  if (volk !== undefined) felder.volksstaerkeEinschaetzung = volk;
  if (sanftmut !== undefined) felder.sanftmut = sanftmut;
  if (schwarm !== undefined) felder.schwarmtrieb = schwarm;
  if (sitz !== undefined) felder.wabensitz = sitz;
  if (brut !== undefined) felder.legeleistung = brut;

  const zeilen: string[] = [];
  if (d.bemerkung) zeilen.push(d.bemerkung);
  if (d.totaleBrutentnahme) zeilen.push("Totale Brutentnahme.");
  const entnommen = entnommenText(d);
  if (entnommen) zeilen.push(entnommen);
  // Wirrbau kennt die App nicht als Bewertung - nur wenn er auffiel, kommt er in die Notiz.
  if (d.wirrbau !== null && d.wirrbau >= 1 && d.wirrbau < 5) {
    zeilen.push(`Wirrbau: Wertung ${zahlDeutsch(d.wirrbau)} von 5 (5 = kein Wirrbau).`);
  }
  if (zeilen.length > 0) felder.notizen = zeilen.join("\n");

  return { felder, kurz: d.bemerkung ? `Durchschau: ${kuerzen(d.bemerkung, 70)}` : "Durchschau" };
}

// --- Fütterung -----------------------------------------------------------------

export function fuetterungsArtAus(text: string): FuetterungsArt {
  const t = text.toLowerCase().replace(/\s+/g, "");
  if (t.includes("(3:2)")) return "ZUCKERWASSER_3_2";
  if (t.includes("(1:1)")) return "ZUCKERWASSER_1_1";
  if (t.includes("invert")) return "INVERTZUCKERSIRUP";
  if (t.includes("weizen")) return "WEIZENSIRUP";
  if (t.includes("eiwei") && t.includes("teig")) return "EIWEISSFUTTERTEIG";
  if (t.includes("teig")) return "FUTTERTEIG";
  return "SONSTIGE";
}

function fuetterungEntwurf(f: BitFuetterung): { felder: EintragFelder; kurz: string } {
  const art = fuetterungsArtAus(f.art);
  const einheit = f.einheit.trim().toLowerCase();
  const mengeText = f.menge === null ? "" : `${zahlDeutsch(f.menge)} ${f.einheit}`.trim();
  const felder: EintragFelder = { fuetterungArt: art };
  let verlustfrei = art !== "SONSTIGE";
  if (f.menge !== null && f.menge > 0) {
    if (einheit === "kg") felder.fuetterungMengeKg = f.menge;
    else if (einheit === "g") felder.fuetterungMengeKg = f.menge / 1000;
    else verlustfrei = false; // Liter lassen sich ohne Dichte nicht in kg umrechnen
  }
  if (!verlustfrei) {
    felder.notizen = `Fütterung: ${[f.art, mengeText].filter(Boolean).join(", ")}.`;
  }
  return { felder, kurz: `Fütterung: ${[f.art, mengeText].filter(Boolean).join(", ")}` };
}

// --- Honigernte ----------------------------------------------------------------

function honigEntwurf(h: BitHonigernte): { felder: EintragFelder; kurz: string } {
  const felder: EintragFelder = { honigGeerntet: true };
  if (h.sorte) felder.honigart = h.sorte.slice(0, 20);
  if (h.mengeKg !== null && h.mengeKg > 0) felder.honigertragKg = h.mengeKg;
  if (h.wassergehalt !== null && h.wassergehalt > 0) felder.notizen = `Wassergehalt: ${zahlDeutsch(h.wassergehalt)} %.`;
  const menge = h.mengeKg !== null && h.mengeKg > 0 ? `${zahlDeutsch(h.mengeKg)} kg` : "";
  return { felder, kurz: `Honigernte: ${[h.sorte, menge].filter(Boolean).join(", ")}` };
}

// --- Varroakontrolle -----------------------------------------------------------

function kontrolleEntwurf(k: BitVarroakontrolle): { felder: EintragFelder; kurz: string } {
  const felder: EintragFelder = {};
  const mitTagen = k.kontrolltage !== null && k.kontrolltage > 0;
  felder.varroaZaehlweise = mitTagen ? "GEMUELLDIAGNOSE" : "SONSTIGE";
  if (k.anzahl !== null && k.anzahl >= 0) felder.varroaAnzahl = Math.round(k.anzahl);
  if (mitTagen && k.kontrolltage !== null) felder.varroaGemuellTage = Math.round(k.kontrolltage);
  const teile = [
    k.milbenfall ? `Milbenfall: ${k.milbenfall}` : "",
    k.anzahl !== null ? `${zahlDeutsch(k.anzahl)} Varroa` : "",
    mitTagen && k.kontrolltage !== null ? `in ${zahlDeutsch(k.kontrolltage)} Tagen` : "",
    k.proTag !== null ? `${zahlDeutsch(k.proTag)} je Tag` : "",
  ].filter(Boolean);
  felder.notizen = `Varroakontrolle (aus BeeInTouch): ${teile.join(", ") || "ohne Angaben"}.`;
  return { felder, kurz: `Varroakontrolle: ${teile.join(", ") || "ohne Angaben"}` };
}

// --- Behandlungen ----------------------------------------------------------------

export function istBrutentnahme(b: BitBehandlung): boolean {
  return /\bTBE\b|totale\s+brutentnahme/i.test(b.methode);
}

// --- Gesamtplan ------------------------------------------------------------------

export function planErstellen(karte: BitStockkarte, optionen: Optionen): Plan {
  const kennung = kennungen();
  const eintraege: EintragEntwurf[] = [];
  const uebersprungen: string[] = [];

  const hinzufuegen = (
    art: EintragArt,
    datum: string,
    quelle: unknown,
    versatz: number,
    inhalt: { felder: EintragFelder; kurz: string },
  ) => {
    eintraege.push({
      sendungId: kennung(art, datum, quelle),
      datum,
      uhrzeit: minutenAlsUhrzeit(GRUNDZEIT[art] + Math.min(versatz, 9)),
      art,
      kurz: inhalt.kurz,
      felder: inhalt.felder,
    });
  };

  if (optionen.durchschauen) {
    const versatz = minutenVersatz(karte.durchschauen);
    karte.durchschauen.forEach((d, index) => hinzufuegen("durchschau", d.datum, d, versatz[index], durchschauEntwurf(d)));
  }
  if (optionen.fuetterungen) {
    const versatz = minutenVersatz(karte.fuetterungen);
    karte.fuetterungen.forEach((f, index) => hinzufuegen("fuetterung", f.datum, f, versatz[index], fuetterungEntwurf(f)));
  }
  if (optionen.honigernten) {
    const versatz = minutenVersatz(karte.honigernten);
    karte.honigernten.forEach((h, index) => {
      if ((h.mengeKg === null || h.mengeKg <= 0) && (h.wassergehalt === null || h.wassergehalt <= 0)) {
        uebersprungen.push(`Honigernte ${datumDeutsch(h.datum)} (${h.sorte || "ohne Sorte"}): keine Menge eingetragen`);
        return;
      }
      hinzufuegen("honigernte", h.datum, h, versatz[index], honigEntwurf(h));
    });
  }
  if (optionen.varroakontrollen) {
    const versatz = minutenVersatz(karte.varroakontrollen);
    karte.varroakontrollen.forEach((k, index) => hinzufuegen("varroakontrolle", k.datum, k, versatz[index], kontrolleEntwurf(k)));
  }
  eintraege.sort((a, b) => (a.datum + a.uhrzeit < b.datum + b.uhrzeit ? 1 : a.datum + a.uhrzeit > b.datum + b.uhrzeit ? -1 : 0));

  const behandlungen: BehandlungEntwurf[] = [];
  const verfahren: VerfahrenEntwurf[] = [];
  if (optionen.behandlungen) {
    const behandlungsKennung = kennungen();
    for (const b of karte.behandlungen) {
      if (istBrutentnahme(b)) {
        verfahren.push({
          schluessel: behandlungsKennung("tbe", b.datum, b),
          datum: b.datum,
          bemerkung: "Aus BeeInTouch übernommen.",
        });
        continue;
      }
      if (!b.mittel) {
        uebersprungen.push(`Behandlung ${datumDeutsch(b.datum)}: kein Mittel angegeben`);
        continue;
      }
      behandlungen.push({
        schluessel: behandlungsKennung("beh", b.datum, b),
        datum: b.datum,
        mittel: b.mittel,
        methode: b.methode,
        menge: b.menge ?? 0,
        einheit: b.einheit || "ml",
        mengeFehlt: b.menge === null,
      });
    }
  }

  let koenigin: KoeniginEntwurf | null = null;
  if (optionen.koenigin && (karte.zuchtbuchnummer || karte.koeniginFarbe || karte.koeniginZugesetzt)) {
    koenigin = {
      kennung: (karte.zuchtbuchnummer || `Stock ${karte.stocknummer}`).slice(0, 20),
      zuchtbuchnummer: karte.zuchtbuchnummer.slice(0, 40),
      zeichenFarbe: karte.koeniginFarbe.toLowerCase(),
      zugesetzt: karte.koeniginZugesetzt,
    };
  }

  return { eintraege, behandlungen, verfahren, koenigin, uebersprungen };
}

/// Der Name eines Mittels, wie er zum Vergleichen und Zuordnen benutzt wird.
export function mittelSchluessel(mittel: string): string {
  return mittel.trim().replace(/\s+/g, " ").toLowerCase();
}
