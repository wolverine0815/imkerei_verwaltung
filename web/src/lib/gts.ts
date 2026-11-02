// Grünlandtemperatursumme (GTS): ab dem 1. Januar werden die positiven
// Tagesmittel der Lufttemperatur addiert, im Januar mit dem Faktor 0,5, im
// Februar mit 0,75, danach voll. Die Karte nennt den Tag, an dem GTS_MARKE erreicht ist.
//
// Wolf liefert die Summe auch selbst, sein Wert sinkt aber stellenweise. Das
// kann bei einer Summe nicht sein, deshalb rechnen wir aus den Tagesmitteln.
// Grundlage sind die Messungen der Waage, nur Tage ohne Messung kommen vom
// Wetterdienst (eine Waage misst oft nicht seit dem 1. Januar).
// Ohne Abhängigkeiten, damit es sich auch außerhalb der App prüfen lässt.

export const GTS_MARKE = 350;

export type GtsTag = { tag: string; mittelC: number | null };

export type GtsErgebnis = {
  summe: number;
  // Tag (JJJJ-MM-TT), an dem die Summe 200 erreicht hat.
  erreichtAm: string | null;
  // Tage ohne Mittelwert seit Jahresbeginn: die Summe ist dann etwas zu klein.
  fehlendeTage: number;
  letzterTag: string | null;
};

function faktor(monat: number): number {
  if (monat === 1) return 0.5;
  if (monat === 2) return 0.75;
  return 1;
}

// Tage der Waage gehen vor. Gezählt wird nur vor `bisTag`, wie in gtsBerechnen.
export function gtsTageMischen(waage: GtsTag[], wetter: GtsTag[], bisTag: string) {
  const eigene = waage.filter((t) => t.mittelC !== null && t.mittelC !== undefined);
  const belegt = new Set(eigene.map((t) => t.tag));
  const ergaenzt = wetter.filter((t) => !belegt.has(t.tag));
  return {
    tage: [...eigene, ...ergaenzt],
    tageWaage: eigene.filter((t) => t.tag < bisTag).length,
    tageWetter: ergaenzt.filter((t) => t.tag < bisTag).length,
  };
}

// `tage` sind die Tage eines Jahres, `bisTag` ist der erste Tag, der nicht
// mehr zählt (der laufende Tag ist noch nicht abgeschlossen).
export function gtsBerechnen(tage: GtsTag[], jahr: number, bisTag: string): GtsErgebnis {
  const nachTag = new Map(tage.map((t) => [t.tag, t.mittelC]));
  let summe = 0;
  let erreichtAm: string | null = null;
  let fehlendeTage = 0;
  let letzterTag: string | null = null;

  for (let datum = new Date(Date.UTC(jahr, 0, 1)); datum.getUTCFullYear() === jahr; datum.setUTCDate(datum.getUTCDate() + 1)) {
    const tag = datum.toISOString().slice(0, 10);
    if (tag >= bisTag) break;
    const mittel = nachTag.get(tag);
    if (mittel === null || mittel === undefined) {
      fehlendeTage++;
      continue;
    }
    letzterTag = tag;
    if (mittel > 0) summe += mittel * faktor(datum.getUTCMonth() + 1);
    if (erreichtAm === null && summe >= GTS_MARKE) erreichtAm = tag;
  }
  return { summe: Math.round(summe * 10) / 10, erreichtAm, fehlendeTage, letzterTag };
}
