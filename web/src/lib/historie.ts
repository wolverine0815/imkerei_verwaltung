import type { Prisma, PrismaClient } from "@/generated/prisma/client";

// Änderungsprotokoll (Tabelle "Historie"): wer wann was angelegt, geändert
// oder gelöscht hat. Geschrieben wird automatisch als Erweiterung des
// Datenbank-Clients (siehe datenbank.ts) - die vielen Server-Aktionen müssen
// dafür nichts tun, und neue Funktionen sind von selbst dabei.
//
// Wer gerade ändert, weiß nur lib/prisma.ts (Anmeldung, Server-Aktion). Es
// meldet das über historieKontextSetzen() an. Ohne Kontext (Anmeldung selbst,
// Hintergrundabrufe, Kalender-Feed, Seitenaufbau) wird nichts protokolliert.
//
// Grenzen:
// - Verschachtelte Speichervorgänge (etwa ein Eintrag samt Fotos in einem
//   Aufruf) erscheinen als ein Eintrag für den äußeren Datensatz.
// - Direkte SQL-Befehle laufen an der Erweiterung vorbei.
// - Sammeländerungen werden je Datensatz protokolliert, höchstens
//   MAX_SAMMEL Stück.

export type HistorieWer = { kontoArt: string; nutzerId: string | null; nutzerName: string };

// Auf globalThis, weil Next.js dieses Modul für Seiten/Server-Aktionen und für
// API-Routen getrennt lädt, die Datenbank-Clients (datenbank.ts) aber nur
// einmal je Prozess entstehen.
const global = globalThis as unknown as { historieKontext?: () => Promise<HistorieWer | null> };

export function historieKontextSetzen(holen: () => Promise<HistorieWer | null>) {
  global.historieKontext = holen;
}

function kontextHolen(): Promise<HistorieWer | null> {
  return global.historieKontext?.() ?? Promise.resolve(null);
}

export type HistorieAktion = "angelegt" | "geaendert" | "geloescht";

// Nicht protokolliert: das Protokoll selbst, Zugangsdaten und Daten, die das
// System selbst abruft (Velutina-Meldungen) oder nur nebenbei merkt.
const OHNE_PROTOKOLL = new Set([
  "Historie",
  "Testzugang",
  "Hauptzugang",
  "MailEinstellung",
  "MailEmpfaenger",
  "VelutinaMeldung",
  "VelutinaAbruf",
  "UpdateStand",
  "WaagenEinstellung",
  "WaagenMesswert",
  "WaagenTageswert",
  "StandWettertag",
]);

// Felder, die nie ins Protokoll gehören.
const GEHEIM = /^(passwortHash|passwortVerschluesselt|resetTokenHash)$|token$/i;

const MAX_SAMMEL = 200;

type Zeile = Record<string, unknown>;
type Delegat = {
  findUnique: (a: unknown) => Promise<Zeile | null>;
  findMany: (a: unknown) => Promise<Zeile[]>;
};

function bereinigen(zeile: unknown): Zeile | null {
  if (!zeile || typeof zeile !== "object") return null;
  const sauber: Zeile = {};
  for (const [schluessel, wert] of Object.entries(zeile as Zeile)) {
    if (GEHEIM.test(schluessel)) continue;
    sauber[schluessel] = wert;
  }
  // Datum, Decimal usw. in reines JSON.
  return JSON.parse(JSON.stringify(sauber, (_k, wert) => (typeof wert === "bigint" ? wert.toString() : wert)));
}

function kleinAnfang(modell: string) {
  return modell.charAt(0).toLowerCase() + modell.slice(1);
}

function bezug(modell: string, zeile: Zeile | null) {
  const text = (wert: unknown) => (typeof wert === "string" ? wert : null);
  return {
    volkId: text(zeile?.volkId) ?? (modell === "Volk" ? text(zeile?.id) : null),
    bienenstandId: text(zeile?.bienenstandId) ?? (modell === "Bienenstand" ? text(zeile?.id) : null),
  };
}

export function mitHistorie(basis: PrismaClient): PrismaClient {
  // Lesen und Protokollieren über den Client ohne diese Erweiterung, sonst
  // riefe sich das Protokoll selbst auf.
  const delegat = (modell: string) => (basis as unknown as Record<string, Delegat>)[kleinAnfang(modell)];

  async function schreiben(
    wer: HistorieWer,
    modell: string,
    eintraege: { aktion: HistorieAktion; vorher: unknown; nachher: unknown }[],
  ) {
    if (eintraege.length === 0) return;
    try {
      await basis.historie.createMany({
        data: eintraege.map(({ aktion, vorher, nachher }) => {
          const alt = bereinigen(vorher);
          const neu = bereinigen(nachher);
          const zeile = neu ?? alt;
          return {
            ...wer,
            aktion,
            modell: kleinAnfang(modell),
            datensatzId: typeof zeile?.id === "string" ? zeile.id : null,
            vorher: (alt ?? undefined) as Prisma.InputJsonValue | undefined,
            nachher: (neu ?? undefined) as Prisma.InputJsonValue | undefined,
            ...bezug(modell, zeile),
          };
        }),
      });
    } catch (fehler) {
      // Das Protokoll darf nie das Speichern selbst verhindern.
      console.error("Historie schreiben fehlgeschlagen:", fehler);
    }
  }

  return basis.$extends({
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          const schreibend =
            operation.startsWith("create") ||
            operation.startsWith("update") ||
            operation.startsWith("delete") ||
            operation === "upsert";
          if (!schreibend || OHNE_PROTOKOLL.has(model)) return query(args);
          const wer = await kontextHolen();
          if (!wer) return query(args);

          const a = args as { where?: unknown; data?: unknown };
          switch (operation) {
            case "create": {
              const ergebnis = await query(args);
              await schreiben(wer, model, [{ aktion: "angelegt", vorher: null, nachher: ergebnis }]);
              return ergebnis;
            }
            case "createManyAndReturn": {
              const ergebnis = (await query(args)) as Zeile[];
              await schreiben(wer, model, ergebnis.slice(0, MAX_SAMMEL).map((zeile) => ({ aktion: "angelegt" as const, vorher: null, nachher: zeile })));
              return ergebnis;
            }
            case "createMany": {
              const ergebnis = await query(args);
              const daten = (Array.isArray(a.data) ? a.data : [a.data]).slice(0, MAX_SAMMEL);
              await schreiben(wer, model, daten.map((zeile) => ({ aktion: "angelegt" as const, vorher: null, nachher: zeile })));
              return ergebnis;
            }
            case "update":
            case "upsert":
            case "delete": {
              const vorher = await delegat(model).findUnique({ where: a.where }).catch(() => null);
              const ergebnis = await query(args);
              const aktion: HistorieAktion =
                operation === "delete" ? "geloescht" : vorher ? "geaendert" : "angelegt";
              await schreiben(wer, model, [
                { aktion, vorher, nachher: operation === "delete" ? null : ergebnis },
              ]);
              return ergebnis;
            }
            case "updateMany":
            case "updateManyAndReturn":
            case "deleteMany": {
              const vorher = await delegat(model)
                .findMany({ where: a.where, take: MAX_SAMMEL })
                .catch(() => [] as Zeile[]);
              const ergebnis = await query(args);
              if (operation === "deleteMany") {
                await schreiben(wer, model, vorher.map((zeile) => ({ aktion: "geloescht" as const, vorher: zeile, nachher: null })));
                return ergebnis;
              }
              const ids = vorher.map((zeile) => zeile.id).filter((id) => typeof id === "string");
              const nachher = ids.length
                ? await delegat(model).findMany({ where: { id: { in: ids } } }).catch(() => [] as Zeile[])
                : [];
              const nachId = new Map(nachher.map((zeile) => [zeile.id, zeile]));
              await schreiben(
                wer,
                model,
                vorher
                  .map((zeile) => ({ aktion: "geaendert" as const, vorher: zeile, nachher: nachId.get(zeile.id) ?? null }))
                  // Unveränderte Datensätze (etwa schon erledigte Maßnahmen) nicht aufführen.
                  .filter(({ vorher: alt, nachher: neu }) => JSON.stringify(alt) !== JSON.stringify(neu)),
              );
              return ergebnis;
            }
            default:
              return query(args);
          }
        },
      },
    },
  }) as unknown as PrismaClient;
}
