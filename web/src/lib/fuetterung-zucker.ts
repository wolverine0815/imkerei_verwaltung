// Zucker-Trockenmasse einer Fütterung als Näherung, damit sich Futter in Litern
// und in Kilogramm vergleichen lässt. Ohne Abhängigkeiten, damit es sich auch
// außerhalb der App prüfen lässt.
//
// Zuckerwasser: Das Verhältnis ist Zucker zu Wasser nach Gewicht. Je Liter aus
// Zuckeranteil mal Dichte der Lösung (Tabellenwerte für Saccharose bei 20 °C):
//   0,7:1 → 41 % · 1,18 kg/l ≈ 0,49 kg   1:1 → 50 % · 1,23 kg/l ≈ 0,62 kg
//   3:2   → 60 % · 1,29 kg/l ≈ 0,77 kg   2:1 → 67 % · 1,33 kg/l ≈ 0,89 kg
// In Kilogramm ist bei Zuckerwasser die Zuckermenge selbst gemeint.
// Fertigsirup und Futterteig: grobe Durchschnittswerte, je nach Produkt anders.

export type FuetterungsEinheit = "KG" | "LITER";

const ZUCKER_JE: Record<string, { LITER?: number; KG?: number }> = {
  ZUCKERWASSER_07_1: { LITER: 0.49, KG: 1 },
  ZUCKERWASSER_1_1: { LITER: 0.62, KG: 1 },
  ZUCKERWASSER_3_2: { LITER: 0.77, KG: 1 },
  ZUCKERWASSER_2_1: { LITER: 0.89, KG: 1 },
  // Rund 72 % Trockenmasse bei etwa 1,38 kg/l.
  INVERTZUCKERSIRUP: { LITER: 1.0, KG: 0.72 },
  WEIZENSIRUP: { LITER: 1.0, KG: 0.72 },
  FUTTERTEIG: { KG: 0.9 },
};

// Null, wenn sich nichts Sinnvolles sagen lässt (Eiweißfutter, Sonstige,
// Futterteig in Litern).
export function zuckerNaeherungKg(art: string | null, menge: number | null, einheit: FuetterungsEinheit | null): number | null {
  if (!art || menge === null || menge <= 0) return null;
  const faktor = ZUCKER_JE[art]?.[einheit ?? "KG"];
  return faktor === undefined ? null : menge * faktor;
}

// Bei Zuckerwasser in Kilogramm ist die Menge schon der Zucker, nur sonst
// ist der Wert eine Näherung.
export function zuckerIstNaeherung(art: string | null, einheit: FuetterungsEinheit | null): boolean {
  return !(art?.startsWith("ZUCKERWASSER") && (einheit ?? "KG") === "KG");
}
