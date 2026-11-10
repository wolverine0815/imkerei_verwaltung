import { AsyncLocalStorage } from "async_hooks";
import { headers } from "next/headers";
import type { PrismaClient } from "@/generated/prisma/client";
import { clientFuerSchema } from "@/lib/datenbank";
import { historieKontextSetzen } from "@/lib/historie";
import { aktuellesKonto } from "@/lib/konto";

export { basisPrisma } from "@/lib/datenbank";

// Datenbank-Zugriff, getrennt nach Konto: Franks Daten liegen wie bisher im
// Schema "public", jeder Testzugang hat ein eigenes Schema "tester_<id>" mit
// denselben Tabellen (siehe web/src/lib/testzugang.ts). Ein Schema ist in
// PostgreSQL ein eigener Namensraum innerhalb der Datenbank - ein Client, der
// auf "tester_x" eingestellt ist, kann Tabellen in "public" gar nicht
// ansprechen.
//
// Der übrige Code merkt davon nichts: er benutzt weiter `prisma`, und das
// wählt bei jedem Aufruf anhand der Sitzung (Cookie) den passenden Client.
// Ohne gültige Sitzung gibt es bewusst KEINEN Rückfall auf Franks Daten,
// sondern einen Fehler.

// Für Abläufe ohne Sitzung, die ihr Konto selbst ermitteln (Kalender-Feed):
// innerhalb von `mitSchema(schema, ...)` benutzt `prisma` dieses Schema.
// Wie die Datenbank-Clients einmal je Prozess (globalThis): Next.js lädt
// dieses Modul für Seiten und API-Routen getrennt.
const gemeinsam = globalThis as unknown as {
  schemaVorgabe?: AsyncLocalStorage<string>;
  nutzeraktion?: AsyncLocalStorage<boolean>;
};
const schemaVorgabe = (gemeinsam.schemaVorgabe ??= new AsyncLocalStorage<string>());

export function mitSchema<T>(schema: string, ablauf: () => Promise<T>): Promise<T> {
  return schemaVorgabe.run(schema, ablauf);
}

// Änderungen, die nicht als Server-Aktion ankommen, aber trotzdem jemand
// bewusst ausgelöst hat (Annahmestelle der Warteschlange).
const nutzeraktion = (gemeinsam.nutzeraktion ??= new AsyncLocalStorage<boolean>());

export function alsNutzeraktion<T>(ablauf: () => Promise<T>): Promise<T> {
  return nutzeraktion.run(true, ablauf);
}

// Wer ändert gerade? Für die Historie (lib/historie.ts). Nur bei Server-
// Aktionen und Nutzeraktionen eines angemeldeten Kontos - was beim bloßen
// Anzeigen einer Seite nebenbei gespeichert wird, gehört nicht hinein.
historieKontextSetzen(async () => {
  if (schemaVorgabe.getStore()) return null;
  if (!nutzeraktion.getStore() && !(await ausServerAktion())) return null;
  const konto = await aktuellesKonto().catch(() => null);
  if (!konto) return null;
  return {
    kontoArt: konto.art,
    nutzerId: konto.art === "nutzer" ? konto.nutzerId : null,
    nutzerName: konto.name || (konto.art === "admin" ? "Admin" : "Unbekannt"),
  };
});

async function aktuellerClient(): Promise<PrismaClient> {
  const vorgabe = schemaVorgabe.getStore();
  if (vorgabe) return clientFuerSchema(vorgabe);
  const konto = await aktuellesKonto();
  if (!konto) {
    throw new Error("Nicht angemeldet.");
  }
  return clientFuerSchema(konto.schema);
}

// --- Schreibsperre für Helfer -------------------------------------------------
//
// Helfer mit "Nur lesen" dürfen nichts ändern, Helfer mit "Lesen und schreiben"
// keine Einstellungen und keine Zugänge (siehe lib/nutzer.ts). Geprüft wird
// hier, an der einen Stelle, durch die jeder Datenbankzugriff läuft - so kann
// keine der vielen Server-Aktionen die Prüfung vergessen.
//
// Gesperrt werden nur Schreibzugriffe aus Server-Aktionen (der Browser schickt
// dabei die Kopfzeile "Next-Action"), also alles, was jemand per Knopf
// auslöst. Was beim bloßen Anzeigen einer Seite nebenbei gespeichert wird
// (etwa die Prüfmarke der Velutina-Meldungen), bleibt erlaubt, sonst ließen
// sich manche Seiten mit "Nur lesen" gar nicht öffnen. Die Annahmestelle der
// Warteschlange (app/api/warteschlange) prüft selbst.

const SCHREIB_METHODEN = new Set([
  "create",
  "createMany",
  "createManyAndReturn",
  "update",
  "updateMany",
  "updateManyAndReturn",
  "upsert",
  "delete",
  "deleteMany",
  "$executeRaw",
  "$executeRawUnsafe",
  "$transaction",
]);

// Einstellungen und Zugänge: auch Helfer mit Schreibrecht nicht.
const NUR_ADMIN_MODELLE = new Set(["betrieb", "bereichswahl", "mailEinstellung", "waagenEinstellung", "nutzer", "testzugang", "hauptzugang"]);

// PDF-Nachweise und Lagerlisten erstellen ist Lesen, auch wenn dabei eine
// Datei gespeichert wird - etwa für eine Kontrolle mit "Nur lesen".
const LESEND_ERLAUBT = new Set(["nachweisDatei", "lagerlisteDatei"]);

export const NUR_LESEN_MELDUNG = "Du hast nur Leserechte. Ändern ist für dich gesperrt.";

async function ausServerAktion(): Promise<boolean> {
  try {
    return (await headers()).has("next-action");
  } catch {
    // Kein Seitenaufruf (Skript, Hintergrundabruf).
    return false;
  }
}

async function schreibenPruefen(methode: string, modell?: string) {
  if (!SCHREIB_METHODEN.has(methode) || schemaVorgabe.getStore()) return;
  if (!(await ausServerAktion())) return;
  const konto = await aktuellesKonto();
  if (konto?.art !== "nutzer") return;
  if (konto.nurLesen && !(methode === "create" && modell && LESEND_ERLAUBT.has(modell))) {
    throw new Error(NUR_LESEN_MELDUNG);
  }
  if (modell && NUR_ADMIN_MODELLE.has(modell)) {
    throw new Error("Einstellungen darf nur der Admin ändern.");
  }
}

// `prisma.volk.findMany(...)` usw. wie gewohnt - dahinter wird erst beim
// Aufruf der passende Client gewählt. Einschränkung: die Aufrufe liefern
// normale Promises, `prisma.$transaction([...])` mit einer Liste geht damit
// nicht; stattdessen `prisma.$transaction(async (tx) => ...)` verwenden.
function modellStellvertreter(modell: string) {
  return new Proxy(
    {},
    {
      get(_ziel, methode) {
        if (typeof methode !== "string") return undefined;
        return async (...argumente: unknown[]) => {
          await schreibenPruefen(methode, modell);
          const client = (await aktuellerClient()) as unknown as Record<
            string,
            Record<string, (...a: unknown[]) => unknown>
          >;
          return client[modell][methode](...argumente);
        };
      },
    },
  );
}

const modellCache = new Map<string, object>();

export const prisma = new Proxy({} as PrismaClient, {
  get(_ziel, eigenschaft) {
    if (typeof eigenschaft !== "string") return undefined;
    // Promises prüfen beim Auflösen auf "then" - `prisma` selbst ist keins.
    if (eigenschaft === "then") return undefined;
    if (eigenschaft.startsWith("$")) {
      return async (...argumente: unknown[]) => {
        await schreibenPruefen(eigenschaft);
        const client = (await aktuellerClient()) as unknown as Record<
          string,
          (...a: unknown[]) => unknown
        >;
        return client[eigenschaft](...argumente);
      };
    }
    let modell = modellCache.get(eigenschaft);
    if (!modell) {
      modell = modellStellvertreter(eigenschaft);
      modellCache.set(eigenschaft, modell);
    }
    return modell;
  },
});
