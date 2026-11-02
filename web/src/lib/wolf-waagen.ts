// Liest die Antwort von app.wolf-waagen.de/graph/stock/<ID>. Das ist die
// Schnittstelle, mit der die Web-App von Wolf ihre Diagramme füllt, keine
// offizielle API: Ändert Wolf sie, schlägt der Abruf mit einer Meldung fehl.
// Ohne Abhängigkeiten, damit es sich auch außerhalb der App prüfen lässt.

export const WOLF_BASIS = "https://app.wolf-waagen.de";

// Unter diesem Gewicht steht nichts auf der Waage: Wolf meldet dann fast 0 kg
// (Beute abgehoben), das soll das Diagramm nicht stauchen.
const MINDESTGEWICHT_KG = 1;

export type WolfPunkt = {
  zeitpunkt: Date;
  gewichtKg: number | null;
  temperaturC: number | null;
  temperaturMinC: number | null;
  temperaturMaxC: number | null;
  feuchteProzent: number | null;
  regenMm: number | null;
  windKmh: number | null;
};

type Reihe = { id: string; values?: unknown[] };

function zahl(wert: unknown): number | null {
  return typeof wert === "number" && Number.isFinite(wert) ? wert : null;
}

// `values` beginnen bei pointStart im Abstand pointInterval. Wolf hängt vorn
// und hinten Punkte über den angefragten Zeitraum hinaus an, hinten ohne Wert.
export function wolfReihenLesen(antwort: unknown): WolfPunkt[] {
  const daten = antwort as { pointStart?: unknown; pointInterval?: unknown; series?: unknown };
  const start = zahl(daten?.pointStart);
  const abstand = zahl(daten?.pointInterval);
  if (start === null || abstand === null || abstand <= 0 || !Array.isArray(daten.series)) {
    throw new Error("Wolf hat unerwartete Daten geliefert.");
  }
  const reihen = new Map((daten.series as Reihe[]).map((reihe) => [reihe.id, reihe.values ?? []]));
  const gewicht = reihen.get("weight");
  if (!gewicht) throw new Error("Wolf hat keine Gewichtsdaten geliefert.");

  const wert = (id: string, i: number) => zahl(reihen.get(id)?.[i]);
  const spanne = (i: number): unknown[] => {
    const paar = reihen.get("temperature_range")?.[i];
    return Array.isArray(paar) ? paar : [];
  };

  const punkte: WolfPunkt[] = [];
  gewicht.forEach((_, i) => {
    const gewichtKg = wert("weight", i);
    const temperaturC = wert("temperature", i);
    if (gewichtKg === null && temperaturC === null) return;
    punkte.push({
      zeitpunkt: new Date(start + i * abstand),
      gewichtKg: gewichtKg !== null && gewichtKg >= MINDESTGEWICHT_KG ? gewichtKg : null,
      temperaturC,
      temperaturMinC: zahl(spanne(i)[0]),
      temperaturMaxC: zahl(spanne(i)[1]),
      feuchteProzent: wert("humidity", i),
      regenMm: wert("rain", i),
      windKmh: wert("wind_speed", i),
    });
  });
  return punkte;
}

export function wolfMessAdresse(kennung: string, intervall: "hour" | "day", von: Date, bis: Date): string {
  const parameter = new URLSearchParams({ interval: intervall, start: String(von.getTime()), end: String(bis.getTime()) });
  return `${WOLF_BASIS}/graph/stock/${encodeURIComponent(kennung)}?${parameter}`;
}
