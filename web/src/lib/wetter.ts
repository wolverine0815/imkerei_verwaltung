// Tagesmittel der Lufttemperatur von Open-Meteo (Archiv, Modelldaten für beliebige
// Koordinaten, ohne Konto). Ergänzt die GTS an Tagen ohne eigene Waagen-Daten.
// Kostenlos nur für nichtkommerzielle Nutzung, Quellenangabe nach CC BY 4.0
// (siehe gts-karte.tsx). Bisher reicht das Archiv bis zum Vortag.
// Ohne Abhängigkeiten, damit es sich auch außerhalb der App prüfen lässt.

const ARCHIV = "https://archive-api.open-meteo.com/v1/archive";
const ZEITLIMIT_MS = 30_000;

export type WetterTag = { tag: string; mittelC: number };

export function wetterLesen(antwort: unknown): WetterTag[] {
  const daily = (antwort as { daily?: { time?: unknown; temperature_2m_mean?: unknown } })?.daily;
  if (!Array.isArray(daily?.time) || !Array.isArray(daily?.temperature_2m_mean)) {
    throw new Error("Der Wetterdienst hat unerwartete Daten geliefert.");
  }
  const werte = daily.temperature_2m_mean as unknown[];
  return (daily.time as unknown[]).flatMap((tag, i) => {
    const mittelC = werte[i];
    return typeof tag === "string" && typeof mittelC === "number" ? [{ tag, mittelC }] : [];
  });
}

export async function wetterHolen(breite: number, laenge: number, von: string, bis: string): Promise<WetterTag[]> {
  const parameter = new URLSearchParams({
    latitude: String(breite),
    longitude: String(laenge),
    start_date: von,
    end_date: bis,
    daily: "temperature_2m_mean",
    timezone: "Europe/Berlin",
  });
  const antwort = await fetch(`${ARCHIV}?${parameter}`, { cache: "no-store", signal: AbortSignal.timeout(ZEITLIMIT_MS) });
  if (!antwort.ok) throw new Error(`Der Wetterdienst antwortet mit HTTP ${antwort.status}.`);
  return wetterLesen(await antwort.json());
}
