// Gemeinsame Typen des BeeInTouch-Imports (siehe parser.ts und plan.ts).
// Nur Typen, kein Code - darum auch aus Server- und Client-Code ohne Folgen
// importierbar.

/// Ein Textstück aus der PDF, so wie pdf.js es liefert (siehe pdf-lesen.ts).
export type PdfItem = {
  str: string;
  /// Linke Kante und Grundlinie (von unten gemessen), Breite, Schrifthöhe.
  x: number;
  y: number;
  w: number;
  h: number;
  seite: number;
  seitenHoehe: number;
};

/// Alle Daten sind als "JJJJ-MM-TT" abgelegt. Bewertungen stehen so da, wie
/// BeeInTouch sie führt: 1 (schlecht) bis 5 (sehr gut).
export type BitDurchschau = {
  datum: string;
  koeniginGesehen: boolean | null;
  ausgebauteWaben: number | null;
  futterwaben: number | null;
  brutwaben: number | null;
  mittelwaende: number | null;
  schwarmstimmung: number | null;
  sanftmut: number | null;
  wabensitz: number | null;
  volksstaerke: number | null;
  brut: number | null;
  wirrbau: number | null;
  totaleBrutentnahme: boolean | null;
  bemerkung: string;
};

export type BitHonigernte = {
  datum: string;
  wassergehalt: number | null;
  sorte: string;
  mengeKg: number | null;
};

export type BitFuetterung = {
  datum: string;
  art: string;
  menge: number | null;
  /// Einheit hinter der Menge, wie in der PDF (kg, Liter ...).
  einheit: string;
};

export type BitVarroakontrolle = {
  datum: string;
  /// Spalte "Milbenfall" als Text (die Spalte ist in der Beispiel-PDF leer).
  milbenfall: string;
  anzahl: number | null;
  kontrolltage: number | null;
  proTag: number | null;
};

export type BitBehandlung = {
  datum: string;
  mittel: string;
  methode: string;
  menge: number | null;
  einheit: string;
  totenfall: number | null;
};

export type BitStockkarte = {
  /// Dateiname der PDF, nur zur Anzeige.
  quelle: string;
  stocknummer: string;
  stand: string;
  volkart: string;
  koeniginFarbe: string;
  koeniginZeichen: string;
  zuchtbuchnummer: string;
  /// "JJJJ-MM-TT" oder leer.
  koeniginZugesetzt: string;
  durchschauen: BitDurchschau[];
  honigernten: BitHonigernte[];
  fuetterungen: BitFuetterung[];
  varroakontrollen: BitVarroakontrolle[];
  behandlungen: BitBehandlung[];
  /// Hinweise zum Einlesen (nicht erkannte Zeilen usw.).
  warnungen: string[];
};
