// Liest die Antwort von app.wolf-waagen.de/graph/stock/<ID>. Das ist die
// Schnittstelle, mit der die Web-App von Wolf ihre Diagramme füllt, keine
// offizielle API: Ändert Wolf sie, schlägt der Abruf mit einer Meldung fehl.
// Ohne Abhängigkeiten, damit es sich auch außerhalb der App prüfen lässt.

export const WOLF_BASIS = "https://app.wolf-waagen.de";

// Werte nahe 0 kg sind keine Gewichtsmessung und sollen das Diagramm nicht
// stauchen. Kurze Sprünge beim Arbeiten am Volk bleiben im Gewicht sichtbar; die
// Waage gleicht sie per Schlüsseldrehung aus, im Ertrag (yield) stehen sie nicht.
const MINDESTGEWICHT_KG = 1;

export type WolfPunkt = {
  // Position in der Reihe; ein Tag ergibt sich daraus sicherer als aus der
  // Zeit, weil pointInterval die Zeitumstellung nicht kennt.
  index: number;
  zeitpunkt: Date;
  gewichtKg: number | null;
  ertragKg: number | null;
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

// Für Zeiträume ohne Messungen (Waage lief noch nicht) liefert Wolf eine Antwort
// ohne pointStart und Reihen. Das ist kein Fehler, nur nichts zu lesen.
export function wolfHatDaten(antwort: unknown): boolean {
  const daten = antwort as { pointStart?: unknown; series?: unknown };
  return zahl(daten?.pointStart) !== null && Array.isArray(daten?.series) && daten.series.length > 0;
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
      index: i,
      zeitpunkt: new Date(start + i * abstand),
      gewichtKg: gewichtKg !== null && gewichtKg >= MINDESTGEWICHT_KG ? gewichtKg : null,
      ertragKg: wert("yield", i),
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

// --- Anmeldung ---------------------------------------------------------------
//
// Wie die Web-App: Sitzungs-Cookies und CSRF-Token holen, dann mit E-Mail und
// Passwort an /public/login. Wolf begrenzt die Anfragen (X-RateLimit-Limit),
// deshalb hält eine Sitzung, solange Wolf sie annimmt.

const ZEITLIMIT_MS = 30_000;


export class WolfSitzungAbgelaufen extends Error {}

export type WolfSitzung = { cookies: Map<string, string> };

function cookiesMerken(antwort: Response, cookies: Map<string, string>) {
  for (const zeile of antwort.headers.getSetCookie()) {
    const paar = zeile.split(";", 1)[0];
    const trenner = paar.indexOf("=");
    if (trenner > 0) cookies.set(paar.slice(0, trenner), paar.slice(trenner + 1));
  }
}

function cookieZeile(cookies: Map<string, string>) {
  return [...cookies].map(([name, wert]) => `${name}=${wert}`).join("; ");
}

function kopfzeilen(cookies: Map<string, string>): Record<string, string> {
  return { Accept: "application/json", "X-Requested-With": "XMLHttpRequest", Cookie: cookieZeile(cookies) };
}

// /token antwortet erst nach der Anmeldung, davor steht das Token in der Seite,
// je nach Seite als Meta-Angabe oder in den eingebetteten Daten.
export function tokenAusSeite(html: string): string | null {
  const treffer =
    /name=["']csrf-token["'][^>]*content=["']([^"']+)/.exec(html) ??
    /content=["']([^"']+)["'][^>]*name=["']csrf-token/.exec(html) ??
    /csrf(?:&quot;|")\s*:\s*(?:&quot;|")([A-Za-z0-9+/=_-]+)/.exec(html);
  return treffer?.[1] ?? null;
}

// Fehlermeldungen nennen nie Passwort oder Cookies.
export async function wolfAnmelden(email: string, passwort: string): Promise<WolfSitzung> {
  const cookies = new Map<string, string>();

  const seite = await fetch(`${WOLF_BASIS}/login`, { cache: "no-store", redirect: "manual", signal: AbortSignal.timeout(ZEITLIMIT_MS) });
  cookiesMerken(seite, cookies);
  const token = tokenAusSeite(await seite.text());
  const xsrf = cookies.get("XSRF-TOKEN");
  if (!token && !xsrf) throw new Error("Wolf-Anmeldung: Token nicht erhalten.");

  const anmeldung = await fetch(`${WOLF_BASIS}/public/login`, {
    method: "POST",
    cache: "no-store",
    headers: {
      ...kopfzeilen(cookies),
      "Content-Type": "application/json",
      ...(token ? { "X-CSRF-TOKEN": token } : { "X-XSRF-TOKEN": decodeURIComponent(xsrf ?? "") }),
      Origin: WOLF_BASIS,
      Referer: `${WOLF_BASIS}/login`,
    },
    body: JSON.stringify({ email, password: passwort, remember: false }),
    redirect: "manual",
    signal: AbortSignal.timeout(ZEITLIMIT_MS),
  });
  if (anmeldung.status === 401 || anmeldung.status === 422) {
    throw new Error("Wolf lehnt die Zugangsdaten ab. Bitte unter Einstellungen → Waagen prüfen.");
  }
  // Eine Weiterleitung ist kein Fehler; ob die Sitzung gilt, zeigt der erste Abruf.
  if (anmeldung.status >= 400) throw new Error(`Wolf-Anmeldung fehlgeschlagen (HTTP ${anmeldung.status}).`);
  cookiesMerken(anmeldung, cookies);
  return { cookies };
}

export async function wolfDatenHolen(sitzung: WolfSitzung, adresse: string): Promise<unknown> {
  const antwort = await fetch(adresse, {
    cache: "no-store",
    headers: kopfzeilen(sitzung.cookies),
    redirect: "manual",
    signal: AbortSignal.timeout(ZEITLIMIT_MS),
  });
  cookiesMerken(antwort, sitzung.cookies);
  const istJson = antwort.headers.get("content-type")?.includes("application/json");
  if (antwort.status === 401 || antwort.status === 419 || (antwort.status >= 300 && antwort.status < 400) || (antwort.ok && !istJson)) {
    throw new WolfSitzungAbgelaufen("Wolf-Sitzung abgelaufen.");
  }
  if (!antwort.ok) throw new Error(`Wolf antwortet mit HTTP ${antwort.status}.`);
  return antwort.json();
}
