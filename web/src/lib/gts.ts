// Grünlandtemperatursumme (GTS): ab dem 1. Januar werden die positiven
// Tagesmittel der Lufttemperatur addiert, im Januar mit dem Faktor 0,5, im
// Februar mit 0,75, danach voll. 200 Grad gelten als Beginn des Vorfrühlings.
//
// Wolf liefert die Summe auch selbst, sein Wert sinkt aber stellenweise. Das
// kann bei einer Summe nicht sein, deshalb rechnen wir aus den Tagesmitteln.
// Ohne Abhängigkeiten, damit es sich auch außerhalb der App prüfen lässt.

export const GTS_VORFRUEHLING = 200;

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
    if (erreichtAm === null && summe >= GTS_VORFRUEHLING) erreichtAm = tag;
  }
  return { summe: Math.round(summe * 10) / 10, erreichtAm, fehlendeTage, letzterTag };
}
