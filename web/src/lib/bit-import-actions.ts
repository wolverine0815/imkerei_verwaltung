"use server";

import { revalidatePath } from "next/cache";
import { basisPrisma, mitHistorieWer, prisma } from "@/lib/prisma";
import { aktuellesKonto, istAdmin } from "@/lib/konto";
import type { HistorieWer } from "@/lib/historie";
import { schrittDatum, schrittText, verfahrenSchritte } from "@/lib/bio-verfahren";
import { mittelSchluessel, planErstellen, type Optionen, type Plan } from "@/lib/bit-import/plan";
import { stockkarteAusEingabe } from "@/lib/bit-import/pruefen";
import type { BitStockkarte } from "@/lib/bit-import/typen";

// Übernahme einer BeeInTouch-Stockkarte (PDF je Volk). Die PDF wird im
// Browser eingelesen (lib/bit-import/pdf-lesen.ts); hierher kommen nur die
// Daten. Gedacht für den Admin, der damit auf einen Schlag viele Einträge
// anlegt - Helfer sehen die Seite gar nicht.
//
// Wiederholbar: jeder angelegte Eintrag trägt eine Kennung (sendungId, wie
// bei der Warteschlange vom Handy), Behandlungen und Verfahren werden an
// Datum und Mittel erkannt. Dieselbe PDF zweimal einzuspielen legt nichts
// doppelt an.

export type VolkWahl =
  | { art: "vorhanden"; volkId: string }
  | { art: "neu"; name: string; bienenstandId: string | null; neuerStandName: string };

export type ImportAuftrag = {
  /// Die eingelesene Stockkarte. Wird hier noch einmal geprüft.
  karte: unknown;
  volk: VolkWahl;
  /// "admin" oder die ID eines Helfers: wem die Einträge zugeschrieben werden.
  wer: string;
  optionen: Optionen;
  /// Je Mittel (mittelSchluessel) die gewählte Medikament-ID oder "neu".
  medikamente: Record<string, string>;
};

export type ImportErgebnis =
  | { fehler: string }
  | {
      ok: true;
      volkId: string;
      volkName: string;
      neuesVolk: boolean;
      angelegt: { eintraege: number; behandlungen: number; verfahren: number; koenigin: boolean; medikamente: number };
      vorhanden: { eintraege: number; behandlungen: number; verfahren: number };
      hinweise: string[];
    };

function kurz(wert: unknown, max: number): string {
  return typeof wert === "string" ? wert.replace(/\s+/g, " ").trim().slice(0, max) : "";
}

export async function bitImportAusfuehren(auftrag: ImportAuftrag): Promise<ImportErgebnis> {
  if (!(await istAdmin())) return { fehler: "Der Import ist nur für den Admin." };
  const konto = await aktuellesKonto();
  if (!konto) return { fehler: "Nicht angemeldet." };

  const karte = stockkarteAusEingabe(auftrag?.karte);
  if (!karte) return { fehler: "Die eingelesenen Daten sind unvollständig. Bitte die PDF noch einmal einlesen." };

  const optionen: Optionen = {
    durchschauen: auftrag.optionen?.durchschauen === true,
    fuetterungen: auftrag.optionen?.fuetterungen === true,
    honigernten: auftrag.optionen?.honigernten === true,
    varroakontrollen: auftrag.optionen?.varroakontrollen === true,
    behandlungen: auftrag.optionen?.behandlungen === true,
    koenigin: auftrag.optionen?.koenigin === true,
  };

  let wer: HistorieWer = { kontoArt: "admin", nutzerId: null, nutzerName: konto.name || "Admin" };
  if (auftrag.wer && auftrag.wer !== "admin") {
    const nutzer = await basisPrisma.nutzer.findUnique({ where: { id: auftrag.wer }, select: { id: true, name: true } });
    if (!nutzer) return { fehler: "Der gewählte Benutzer wurde nicht gefunden." };
    wer = { kontoArt: "nutzer", nutzerId: nutzer.id, nutzerName: nutzer.name };
  }

  try {
    return await mitHistorieWer(wer, () => importieren(karte, auftrag, optionen, wer.nutzerName));
  } catch (fehler) {
    return {
      fehler:
        fehler instanceof Error && fehler.message
          ? `Der Import ist abgebrochen: ${fehler.message} Was schon angelegt wurde, bleibt. Ein zweiter Lauf macht ohne Doppelte weiter.`
          : "Der Import ist abgebrochen. Ein zweiter Lauf macht ohne Doppelte weiter.",
    };
  }
}

type MedikamentInfo = { id: string; wartezeitTage: number; einheit: string };

/// Das Medikament zu einem Mittel aus der PDF: das gewählte, sonst eines mit
/// gleichem Namen, sonst ein neues (ohne Beleg - das ergänzt der Admin später).
async function medikamentWaehlen(
  mittel: string,
  einheit: string,
  gewaehlt: string | undefined,
): Promise<{ fehler: string } | { medikament: MedikamentInfo; neu: boolean }> {
  const auswahl = { id: true, wartezeitTage: true, einheit: true };
  if (gewaehlt && gewaehlt !== "neu") {
    const vorhanden: MedikamentInfo | null = await prisma.medikament.findUnique({ where: { id: gewaehlt }, select: auswahl });
    if (!vorhanden) return { fehler: `Das gewählte Medikament für „${mittel}“ gibt es nicht (mehr).` };
    return { medikament: vorhanden, neu: false };
  }
  const gleicherName: MedikamentInfo | null = await prisma.medikament.findFirst({
    where: { name: { equals: mittel.slice(0, 100), mode: "insensitive" } },
    select: auswahl,
  });
  if (gleicherName) return { medikament: gleicherName, neu: false };
  const angelegt: MedikamentInfo = await prisma.medikament.create({
    data: {
      name: mittel.slice(0, 100),
      einheit: einheit.slice(0, 20) || "ml",
      notizen:
        "Beim Import aus BeeInTouch angelegt. Bitte Lieferant, Beleg, Charge und Wartezeit ergänzen - für den Nachweis fehlen sie noch.",
    },
    select: auswahl,
  });
  return { medikament: angelegt, neu: true };
}

async function importieren(
  karte: BitStockkarte,
  auftrag: ImportAuftrag,
  optionen: Optionen,
  anwender: string,
): Promise<ImportErgebnis> {
  const hinweise: string[] = [];

  // --- Volk (vorhanden oder neu) ------------------------------------------
  let volk: { id: string; name: string; koeniginId: string | null; bienenstandId: string };
  let standName: string;
  let neuesVolk = false;

  if (auftrag.volk.art === "vorhanden") {
    const gefunden = await prisma.volk.findUnique({
      where: { id: auftrag.volk.volkId },
      select: { id: true, name: true, koeniginId: true, bienenstandId: true, bienenstand: { select: { name: true } } },
    });
    if (!gefunden) return { fehler: "Das gewählte Volk gibt es nicht (mehr)." };
    volk = gefunden;
    standName = gefunden.bienenstand.name;
  } else {
    const name = kurz(auftrag.volk.name, 40);
    if (!name) return { fehler: "Für das neue Volk fehlt ein Name." };
    let stand: { id: string; name: string };
    if (auftrag.volk.bienenstandId) {
      const gefunden = await prisma.bienenstand.findUnique({
        where: { id: auftrag.volk.bienenstandId },
        select: { id: true, name: true },
      });
      if (!gefunden) return { fehler: "Der gewählte Bienenstand wurde nicht gefunden." };
      stand = gefunden;
    } else {
      const standname = kurz(auftrag.volk.neuerStandName, 40);
      if (!standname) return { fehler: "Für das neue Volk fehlt ein Bienenstand." };
      const gleicherName = await prisma.bienenstand.findFirst({
        where: { name: { equals: standname, mode: "insensitive" } },
        select: { id: true, name: true },
      });
      stand = gleicherName ?? (await prisma.bienenstand.create({ data: { name: standname }, select: { id: true, name: true } }));
    }
    const angelegt = await prisma.volk.create({
      data: {
        bienenstandId: stand.id,
        name,
        notizen: karte.volkart ? `Aus BeeInTouch übernommen (Volkart: ${karte.volkart}).` : "Aus BeeInTouch übernommen.",
      },
      select: { id: true, name: true, koeniginId: true, bienenstandId: true },
    });
    volk = angelegt;
    standName = stand.name;
    neuesVolk = true;
  }

  const plan: Plan = planErstellen(karte, optionen);
  hinweise.push(...plan.uebersprungen.map((zeile) => `Nicht übernommen: ${zeile}.`));

  // --- Stockkarten-Einträge -------------------------------------------------
  const vorhandeneKennungen = new Set(
    (
      await prisma.stockkartenEintrag.findMany({
        where: { volkId: volk.id, sendungId: { startsWith: "bit-" } },
        select: { sendungId: true },
      })
    ).map((eintrag: { sendungId: string | null }) => eintrag.sendungId),
  );
  const neueEintraege = plan.eintraege.filter((eintrag) => !vorhandeneKennungen.has(eintrag.sendungId));
  for (let start = 0; start < neueEintraege.length; start += 100) {
    await prisma.stockkartenEintrag.createMany({
      data: neueEintraege.slice(start, start + 100).map((eintrag) => ({
        volkId: volk.id,
        sendungId: eintrag.sendungId,
        datum: new Date(`${eintrag.datum}T${eintrag.uhrzeit}:00`),
        ...eintrag.felder,
      })),
    });
  }

  // --- Behandlungen mit Medikament ------------------------------------------
  let neueMedikamente = 0;
  let neueBehandlungen = 0;
  let vorhandeneBehandlungen = 0;
  const medikamentFuer = new Map<string, MedikamentInfo>();

  for (const behandlung of plan.behandlungen) {
    const schluessel = mittelSchluessel(behandlung.mittel);
    let medikament = medikamentFuer.get(schluessel);
    if (!medikament) {
      const ergebnis = await medikamentWaehlen(behandlung.mittel, behandlung.einheit, auftrag.medikamente?.[schluessel]);
      if ("fehler" in ergebnis) return ergebnis;
      medikament = ergebnis.medikament;
      if (ergebnis.neu) neueMedikamente++;
      medikamentFuer.set(schluessel, medikament);
    }

    const datum = new Date(behandlung.datum);
    const schonDa = await prisma.behandlung.count({
      where: { medikamentId: medikament.id, datum, storniertAm: null, voelker: { some: { volkId: volk.id } } },
    });
    if (schonDa > 0) {
      vorhandeneBehandlungen++;
      continue;
    }
    const teile = [
      behandlung.methode ? `Methode: ${behandlung.methode}.` : "",
      behandlung.einheit && behandlung.einheit !== medikament.einheit
        ? `Menge laut BeeInTouch in ${behandlung.einheit}.`
        : "",
      "Aus BeeInTouch übernommen.",
    ].filter(Boolean);
    await prisma.behandlung.create({
      data: {
        medikamentId: medikament.id,
        indikation: "Varroose",
        datum,
        mengeJeVolk: behandlung.menge,
        wartezeitTage: medikament.wartezeitTage,
        anwender: anwender.slice(0, 60),
        bemerkung: teile.join(" "),
        voelker: { create: [{ volkId: volk.id, volkNameDamals: volk.name, standNameDamals: standName }] },
      },
    });
    neueBehandlungen++;
    if (behandlung.mengeFehlt) hinweise.push(`Behandlung ${behandlung.datum}: In der PDF stand keine Menge, eingetragen ist 0.`);
  }

  // --- Totale Brutentnahme als Verfahren --------------------------------------
  let neueVerfahren = 0;
  let vorhandeneVerfahren = 0;
  for (const verfahren of plan.verfahren) {
    const beginn = new Date(verfahren.datum);
    const schonDa = await prisma.bioVerfahren.count({
      where: { art: "TBE", beginn, voelker: { some: { volkId: volk.id } } },
    });
    if (schonDa > 0) {
      vorhandeneVerfahren++;
      continue;
    }
    const angelegt = await prisma.bioVerfahren.create({
      data: {
        art: "TBE",
        beginn,
        anwender: anwender.slice(0, 60),
        bemerkung: verfahren.bemerkung,
        inMassnahmen: false,
        voelker: { create: [{ volkId: volk.id, volkNameDamals: volk.name, standNameDamals: standName }] },
      },
      select: { id: true },
    });
    // Der Fahrplan steht als erledigt da, damit das Verfahren nichts Offenes
    // in die Maßnahmen und den Kalender bringt.
    await prisma.massnahme.createMany({
      data: verfahrenSchritte("TBE", {}).map((schritt) => ({
        volkId: volk.id,
        text: schrittText("TBE", null, schritt),
        faelligAm: schrittDatum(beginn, schritt.tag),
        erledigt: true,
        erledigtAm: schrittDatum(beginn, schritt.tag),
        bioVerfahrenId: angelegt.id,
        bioSchritt: schritt.schluessel,
      })),
    });
    neueVerfahren++;
  }

  // --- Königin ----------------------------------------------------------------
  let koeniginAngelegt = false;
  if (plan.koenigin && !volk.koeniginId) {
    const koenigin = await prisma.koenigin.create({
      data: {
        kennung: plan.koenigin.kennung,
        zuchtbuchnummer: plan.koenigin.zuchtbuchnummer || null,
        zeichenFarbe: plan.koenigin.zeichenFarbe || null,
        status: "IM_VOLK",
        notizen: "Aus BeeInTouch übernommen. Jahrgang und Herkunft sind nicht bekannt.",
      },
      select: { id: true },
    });
    await prisma.volk.update({ where: { id: volk.id }, data: { koeniginId: koenigin.id } });
    if (plan.koenigin.zugesetzt) {
      await prisma.koeniginEreignis.create({
        data: {
          koeniginId: koenigin.id,
          datum: new Date(plan.koenigin.zugesetzt),
          art: "ZUGESETZT",
          volkId: volk.id,
          notiz: "Aus BeeInTouch übernommen.",
        },
      });
    }
    koeniginAngelegt = true;
  } else if (plan.koenigin && volk.koeniginId) {
    hinweise.push("Das Volk hat schon eine Königin, die Angaben aus der PDF wurden nicht dazugeschrieben.");
  }

  revalidatePath(`/voelker/${volk.id}`);
  revalidatePath(`/bienenstaende/${volk.bienenstandId}`);
  revalidatePath("/bienenstaende");
  revalidatePath("/behandlungen", "layout");
  revalidatePath("/medikamente");
  revalidatePath("/koeniginnen", "layout");
  revalidatePath("/massnahmen");

  return {
    ok: true,
    volkId: volk.id,
    volkName: volk.name,
    neuesVolk,
    angelegt: {
      eintraege: neueEintraege.length,
      behandlungen: neueBehandlungen,
      verfahren: neueVerfahren,
      koenigin: koeniginAngelegt,
      medikamente: neueMedikamente,
    },
    vorhanden: {
      eintraege: plan.eintraege.length - neueEintraege.length,
      behandlungen: vorhandeneBehandlungen,
      verfahren: vorhandeneVerfahren,
    },
    hinweise,
  };
}
