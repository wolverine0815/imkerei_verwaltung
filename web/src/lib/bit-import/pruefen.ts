// Der Server vertraut den eingelesenen Daten nicht blind: sie kommen aus dem
// Browser. Diese Prüfung baut die Stockkarte aus dem Empfangenen neu auf -
// mit festen Typen, begrenzten Längen und gültigen Daten. Was nicht passt,
// fällt weg.

import type {
  BitBehandlung,
  BitDurchschau,
  BitFuetterung,
  BitHonigernte,
  BitStockkarte,
  BitVarroakontrolle,
} from "./typen";

const MAX_ZEILEN = 3000;

function objekt(wert: unknown): Record<string, unknown> {
  return wert && typeof wert === "object" && !Array.isArray(wert) ? (wert as Record<string, unknown>) : {};
}

function text(wert: unknown, max = 200): string {
  return typeof wert === "string" ? wert.replace(/\s+/g, " ").trim().slice(0, max) : "";
}

function zahl(wert: unknown): number | null {
  return typeof wert === "number" && Number.isFinite(wert) && Math.abs(wert) < 1e7 ? wert : null;
}

function jaNein(wert: unknown): boolean | null {
  return typeof wert === "boolean" ? wert : null;
}

function datum(wert: unknown): string | null {
  if (typeof wert !== "string") return null;
  const treffer = /^(\d{4})-(\d{2})-(\d{2})$/.exec(wert);
  if (!treffer) return null;
  const jahr = Number(treffer[1]);
  const monat = Number(treffer[2]);
  const tag = Number(treffer[3]);
  if (jahr < 1990 || jahr > 2100) return null;
  const pruefung = new Date(Date.UTC(jahr, monat - 1, tag));
  return pruefung.getUTCMonth() === monat - 1 && pruefung.getUTCDate() === tag ? wert : null;
}

function liste<T>(wert: unknown, bauen: (zeile: Record<string, unknown>) => T | null): T[] {
  if (!Array.isArray(wert)) return [];
  const ergebnis: T[] = [];
  for (const zeile of wert.slice(0, MAX_ZEILEN)) {
    const neu = bauen(objekt(zeile));
    if (neu) ergebnis.push(neu);
  }
  return ergebnis;
}

export function stockkarteAusEingabe(roh: unknown): BitStockkarte | null {
  const k = objekt(roh);
  const stocknummer = text(k.stocknummer, 40);
  if (!stocknummer) return null;

  const durchschauen = liste<BitDurchschau>(k.durchschauen, (z) => {
    const tag = datum(z.datum);
    if (!tag) return null;
    return {
      datum: tag,
      koeniginGesehen: jaNein(z.koeniginGesehen),
      ausgebauteWaben: zahl(z.ausgebauteWaben),
      futterwaben: zahl(z.futterwaben),
      brutwaben: zahl(z.brutwaben),
      mittelwaende: zahl(z.mittelwaende),
      schwarmstimmung: zahl(z.schwarmstimmung),
      sanftmut: zahl(z.sanftmut),
      wabensitz: zahl(z.wabensitz),
      volksstaerke: zahl(z.volksstaerke),
      brut: zahl(z.brut),
      wirrbau: zahl(z.wirrbau),
      totaleBrutentnahme: jaNein(z.totaleBrutentnahme),
      bemerkung: text(z.bemerkung, 3000),
    };
  });
  const honigernten = liste<BitHonigernte>(k.honigernten, (z) => {
    const tag = datum(z.datum);
    return tag ? { datum: tag, wassergehalt: zahl(z.wassergehalt), sorte: text(z.sorte, 60), mengeKg: zahl(z.mengeKg) } : null;
  });
  const fuetterungen = liste<BitFuetterung>(k.fuetterungen, (z) => {
    const tag = datum(z.datum);
    return tag ? { datum: tag, art: text(z.art, 100), menge: zahl(z.menge), einheit: text(z.einheit, 20) } : null;
  });
  const varroakontrollen = liste<BitVarroakontrolle>(k.varroakontrollen, (z) => {
    const tag = datum(z.datum);
    return tag
      ? {
          datum: tag,
          milbenfall: text(z.milbenfall, 100),
          anzahl: zahl(z.anzahl),
          kontrolltage: zahl(z.kontrolltage),
          proTag: zahl(z.proTag),
        }
      : null;
  });
  const behandlungen = liste<BitBehandlung>(k.behandlungen, (z) => {
    const tag = datum(z.datum);
    return tag
      ? {
          datum: tag,
          mittel: text(z.mittel, 100),
          methode: text(z.methode, 100),
          menge: zahl(z.menge),
          einheit: text(z.einheit, 20),
          totenfall: zahl(z.totenfall),
        }
      : null;
  });

  return {
    quelle: text(k.quelle, 200),
    stocknummer,
    stand: text(k.stand, 80),
    volkart: text(k.volkart, 80),
    koeniginFarbe: text(k.koeniginFarbe, 40),
    koeniginZeichen: text(k.koeniginZeichen, 40),
    zuchtbuchnummer: text(k.zuchtbuchnummer, 60),
    koeniginZugesetzt: datum(k.koeniginZugesetzt) ?? "",
    durchschauen,
    honigernten,
    fuetterungen,
    varroakontrollen,
    behandlungen,
    warnungen: [],
  };
}
