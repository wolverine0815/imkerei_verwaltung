import { prisma, mitSchema } from "@/lib/prisma";
import { BEUTENSYSTEM_KATALOG } from "@/lib/beutensysteme";
import { zargenFuerNeueMasse } from "@/lib/beuten";
import { zargeBezeichnung } from "@/lib/honig";
import { jahresfarbe } from "@/lib/koeniginnen";
import { KOENIGINS_BEURTEILUNGS_KRITERIEN, noteText, stufeText } from "@/components/stockkarten-eintrag-felder";
import type { Prisma } from "@/generated/prisma/client";

// Beispieldaten für Testzugänge: ein erfundener Bienenstand mit drei Völkern
// und einer Saison Historie (Durchsichten, Bewertungen, Ernten, Fütterung,
// eine Varroa-Behandlung, offene und erledigte Maßnahmen, Königinnen mit
// Abstammung, ein paar Lagerbuchungen). So sieht ein neuer Tester sofort, wie
// Stand, Volk, Stockkarte, Maßnahmen, Königinnen, Behandlungen und Lager
// zusammenhängen, statt vor einer leeren App zu sitzen.
//
// Läuft automatisch beim Einrichten eines neuen Testzugangs (siehe
// testzugang-actions.ts) und auf Knopfdruck unter Einstellungen ->
// Testzugänge für bestehende. Schreibt ausschließlich in das übergebene
// Tester-Schema - Franks Schema "public" lehnt die Funktion ab.
//
// Die Historie liegt in der letzten Saison: ab August im laufenden Jahr,
// davor im Vorjahr. Einträge, die in der Zukunft lägen, entfallen. Die
// offenen Maßnahmen liegen dagegen um den heutigen Tag herum (eine
// überfällig, eine in ein paar Tagen, eine im Winter), damit Ampelfarben,
// Plakette und Kalender gleich etwas zeigen.

export const BEISPIEL_STAND_NAME = "Obstwiese";

const STAND_NOTIZ =
  "Erfundene Beispieldaten zum Ausprobieren. Du kannst hier alles ändern, ergänzen oder den Stand " +
  "archivieren bzw. löschen, sobald du deine eigenen Stände angelegt hast.";

type Datum = [monat: number, tag: number, stunde?: number, minute?: number];

/// Gibt es den Beispielstand in diesem Schema schon (auch archiviert)?
export async function beispieldatenVorhanden(schema: string): Promise<boolean> {
  return mitSchema(schema, async () => (await prisma.bienenstand.count({ where: { name: BEISPIEL_STAND_NAME } })) > 0);
}

/// Legt die Beispieldaten im Schema eines Testers an. Gibt false zurück, wenn
/// sie dort schon liegen (dann passiert nichts).
/// `demo`: zusätzlich zwei weitere Stände mit sieben Völkern für die
/// öffentliche Demo (lib/demo.ts), damit Übersichten, Karte und Auswertungen
/// nach einem echten Betrieb aussehen.
export async function beispieldatenAnlegen(
  schema: string,
  jetzt: Date = new Date(),
  { demo = false }: { demo?: boolean } = {},
): Promise<boolean> {
  if (!/^tester_[a-z0-9]+$/.test(schema)) {
    throw new Error("Beispieldaten gibt es nur für Testzugänge.");
  }
  if (await beispieldatenVorhanden(schema)) return false;
  await mitSchema(schema, () => anlegen(jetzt, demo));
  return true;
}

async function anlegen(jetzt: Date, demo: boolean) {
  const jahr = jetzt.getMonth() >= 7 ? jetzt.getFullYear() : jetzt.getFullYear() - 1;
  const am = ([monat, tag, stunde = 10, minute = 0]: Datum, j = jahr) => new Date(j, monat - 1, tag, stunde, minute);
  const tageAb = (tage: number) => {
    const d = new Date(jetzt.getFullYear(), jetzt.getMonth(), jetzt.getDate(), 12, 0);
    d.setDate(d.getDate() + tage);
    return d;
  };
  const vergangen = (datum: Date) => datum.getTime() < jetzt.getTime() - 60 * 60 * 1000;

  // --- Beutensystem Zander ------------------------------------------------
  // Nur, wenn der Tester noch keins angelegt hat; sonst das vorhandene nehmen.
  let zander = await prisma.beutensystem.findFirst({
    where: { name: "Zander" },
    include: { wabenmasse: { select: { id: true, name: true, honigProWabeKg: true } } },
  });
  if (!zander) {
    const vorlage = BEUTENSYSTEM_KATALOG.find((eintrag) => eintrag.name === "Zander")!;
    zander = await prisma.beutensystem.create({
      data: {
        name: "Zander",
        wabenmasse: {
          create: vorlage.wabenmasse.map((mass) => ({
            name: mass.name,
            breiteMm: mass.breiteMm,
            hoeheMm: mass.hoeheMm,
            eignung: mass.eignung,
            honigProWabeKg: mass.honigProWabeKg,
          })),
        },
      },
      include: { wabenmasse: { select: { id: true, name: true, honigProWabeKg: true } } },
    });
    await zargenFuerNeueMasse(zander.wabenmasse, "Zander");
  }
  const zargen = await prisma.zarge.findMany({
    where: { wabenmass: { beutensystemId: zander.id } },
    select: { id: true, name: true, wabenAnzahl: true, honigProZargeKg: true, gesamtbestand: true },
  });
  const brutraum = zargen.find((zarge) => zarge.name.startsWith("ganz")) ?? zargen[0];
  const honigraum = zargen.find((zarge) => zarge.name.startsWith("Flachzarge")) ?? brutraum;
  for (const [zarge, bestand] of [
    [brutraum, 8],
    [honigraum, 6],
  ] as const) {
    if (zarge && zarge.gesamtbestand === null) {
      await prisma.zarge.update({ where: { id: zarge.id }, data: { gesamtbestand: bestand } });
    }
  }
  const honigraumBezeichnung = zargeBezeichnung({
    systemName: "Zander",
    name: honigraum.name,
    wabenAnzahl: honigraum.wabenAnzahl,
  });

  // --- Belegstelle, Stand ----------------------------------------------
  const belegstelle = await prisma.belegstelle.create({
    data: {
      name: "Belegstelle Musterberg (Beispiel)",
      ort: "Musterberg",
      rasse: "Carnica",
      notizen: "Erfundene Belegstelle aus den Beispieldaten.",
      jahre: {
        create: [
          { jahr: jahr - 1, drohnenvoelker: "Beispiel-Linie, 8 Geschwistervölker" },
          { jahr, drohnenvoelker: "Andere Beispiel-Linie, 10 Geschwistervölker" },
        ],
      },
    },
  });

  const stand = await prisma.bienenstand.create({
    data: {
      name: BEISPIEL_STAND_NAME,
      ort: "Musterstadt",
      // Freies Feld am Ortsrand von Tübingen - erfunden, nur damit die Karte
      // etwas zeigt.
      breitengrad: 48.5402,
      laengengrad: 9.0127,
      notizen: STAND_NOTIZ,
      standtyp: "FEST",
      voelkerSortierung: "STANDPOSITION",
      createdAt: am([3, 20], jahr),
    },
  });

  // --- Königinnen ---------------------------------------------------------
  const farbe = (j: number) => jahresfarbe(j)?.name ?? null;
  const k1 = await prisma.koenigin.create({
    data: {
      kennung: `BS ${jahr - 1}-1`,
      rasse: "Carnica",
      jahrgang: jahr - 1,
      zeichenFarbe: farbe(jahr - 1),
      zeichenNummer: "12",
      herkunft: "ZUKAUF",
      herkunftText: "Zuchtbetrieb (Beispiel)",
      begattungsart: "BELEGSTELLE",
      belegstelleId: belegstelle.id,
      stern: true,
      status: "IM_VOLK",
      notizen: "Sehr sanft, baut gut aus. Kandidatin für die Nachzucht.",
    },
  });
  const k2 = await prisma.koenigin.create({
    data: {
      kennung: `BS ${jahr - 2}-1`,
      rasse: "Carnica",
      jahrgang: jahr - 2,
      zeichenFarbe: farbe(jahr - 2),
      herkunft: "EIGENE_NACHZUCHT",
      begattungsart: "STANDBEGATTUNG",
      begattungsStandId: stand.id,
      status: "IM_VOLK",
    },
  });

  // --- Völker -------------------------------------------------------------
  const volk1 = await prisma.volk.create({
    data: {
      bienenstandId: stand.id,
      name: "Volk 1",
      rasse: "Carnica",
      brutraumZargeId: brutraum.id,
      brutraumZargenAnzahl: 2,
      koeniginId: k1.id,
      standReihenfolge: 0,
      notizen: "Stärkstes Volk am Stand, sehr sanft.",
      // Waben im Brutraum beim Anlegen (siehe lib/wabenbestand.ts).
      wabenBrut: 5,
      wabenFutter: 7,
      wabenLeer: 3,
      wabenMittelwaende: 0,
      wabenStandAm: am([3, 20, 10, 0]),
      createdAt: am([3, 20, 10, 0]),
    },
  });
  const volk2 = await prisma.volk.create({
    data: {
      bienenstandId: stand.id,
      name: "Volk 2",
      rasse: "Carnica",
      brutraumZargeId: brutraum.id,
      brutraumZargenAnzahl: 2,
      koeniginId: k2.id,
      standReihenfolge: 1,
      notizen: "Neigt zum Schwärmen. Im Mai Ableger gebildet (Volk 3).",
      wabenBrut: 6,
      wabenFutter: 6,
      wabenLeer: 3,
      wabenMittelwaende: 0,
      wabenStandAm: am([3, 20, 10, 1]),
      createdAt: am([3, 20, 10, 1]),
    },
  });
  const volk3 = await prisma.volk.create({
    data: {
      bienenstandId: stand.id,
      name: "Volk 3",
      rasse: "Carnica",
      brutraumZargeId: brutraum.id,
      brutraumZargenAnzahl: 1,
      standReihenfolge: 2,
      notizen: "Ableger aus Volk 2, Königin selbst nachgezogen.",
      // Der Ableger: 3 Brutwaben aus Volk 2, 1 Futterwabe, 2 Mittelwände.
      wabenBrut: 3,
      wabenFutter: 1,
      wabenLeer: 0,
      wabenMittelwaende: 2,
      wabenStandAm: am([5, 9, 15, 0]),
      createdAt: am([5, 9, 15, 0]),
    },
  });

  // Die Jungkönigin von Volk 3 stammt aus Volk 2 (Nachschaffung im Ableger).
  const k3 = await prisma.koenigin.create({
    data: {
      kennung: `BS ${jahr}-1`,
      rasse: "Carnica",
      jahrgang: jahr,
      schlupfDatum: am([5, 22]),
      zeichenFarbe: farbe(jahr),
      herkunft: "NACHSCHAFFUNG",
      herkunftsVolkId: volk2.id,
      mutterKoeniginId: k2.id,
      begattungsart: "STANDBEGATTUNG",
      begattungsStandId: stand.id,
      status: "IM_VOLK",
    },
  });
  await prisma.volk.update({ where: { id: volk3.id }, data: { koeniginId: k3.id } });

  await prisma.koeniginEreignis.createMany({
    data: [
      { koeniginId: k1.id, datum: am([7, 8], jahr - 1), art: "ZUGESETZT", volkId: volk1.id, notiz: "Im Käfig zugesetzt, gut angenommen." },
      { koeniginId: k2.id, datum: am([6, 2], jahr - 2), art: "GESCHLUEPFT", volkId: volk2.id },
      { koeniginId: k3.id, datum: am([5, 22]), art: "GESCHLUEPFT", volkId: volk3.id, notiz: "Im Ableger aus Volk 2 nachgeschafft." },
      ...(vergangen(am([6, 13]))
        ? [{ koeniginId: k3.id, datum: am([6, 13]), art: "SONSTIGES" as const, volkId: volk3.id, notiz: "In Eilage, gezeichnet." }]
        : []),
    ],
  });

  // --- Durchsichten -----------------------------------------------------
  type EintragDaten = Omit<Prisma.StockkartenEintragUncheckedCreateInput, "volkId" | "datum">;
  type Extras = {
    zurKoenigin?: boolean;
    massnahmen?: { text: string; faellig: Datum; erledigt?: Datum }[];
    aufsetzen?: boolean;
    ernten?: boolean;
    honigsorte?: string;
  };
  const sorteIds = new Map<string, string>();
  const honig = await prisma.erzeugnistyp.findFirst({ where: { name: "Honig" } });
  if (honig) {
    for (const sorte of await prisma.sorte.findMany({ where: { erzeugnistypId: honig.id } })) {
      sorteIds.set(sorte.name, sorte.id);
    }
  }

  async function eintrag(volk: { id: string; koeniginId: string | null }, wann: Datum, daten: EintragDaten, extras: Extras = {}) {
    const datum = am(wann);
    if (!vergangen(datum)) return;

    let anteile: Prisma.HonigernteAnteilCreateWithoutStockkartenEintragInput[] | undefined;
    let offeneAufsaetze: { id: string }[] = [];
    if (extras.ernten) {
      offeneAufsaetze = await prisma.honigraumaufsatz.findMany({
        where: { volkId: volk.id, geerntetAm: null },
        select: { id: true },
      });
      if (offeneAufsaetze.length > 0) {
        anteile = [
          {
            istZarge: true,
            zarge: { connect: { id: honigraum.id } },
            bezeichnung: honigraumBezeichnung,
            anzahl: offeneAufsaetze.length,
            gewichtProEinheitKg: honigraum.honigProZargeKg,
          },
        ];
      }
    }

    const erstellt = await prisma.stockkartenEintrag.create({
      data: {
        ...daten,
        volkId: volk.id,
        datum,
        ...(anteile
          ? {
              honigSchaetzungKg: offeneAufsaetze.length * honigraum.honigProZargeKg,
              honigernteAnteile: { create: anteile },
            }
          : {}),
      } as Prisma.StockkartenEintragUncheckedCreateInput,
    });

    if (offeneAufsaetze.length > 0) {
      await prisma.honigraumaufsatz.updateMany({
        where: { id: { in: offeneAufsaetze.map((aufsatz) => aufsatz.id) } },
        data: { geerntetAm: datum, geerntetEintragId: erstellt.id },
      });
    }
    if (extras.aufsetzen) {
      await prisma.honigraumaufsatz.create({
        data: {
          volkId: volk.id,
          zargeId: honigraum.id,
          bezeichnung: honigraumBezeichnung,
          honigProZargeKg: honigraum.honigProZargeKg,
          wabenbeschaffenheit: "GEMISCHT",
          aufgesetztAm: datum,
          aufgesetztEintragId: erstellt.id,
        },
      });
    }
    if (daten.honigGeerntet && daten.honigertragKg && honig) {
      await prisma.erzeugnisBuchung.create({
        data: {
          erzeugnistypId: honig.id,
          menge: daten.honigertragKg as number,
          datum,
          grund: "Ernte",
          sorteId: extras.honigsorte ? sorteIds.get(extras.honigsorte) : undefined,
          zustand: "UNBEARBEITET",
          volkId: volk.id,
          stockkartenEintragId: erstellt.id,
        },
      });
    }
    for (const massnahme of extras.massnahmen ?? []) {
      const erledigtAm = massnahme.erledigt ? am(massnahme.erledigt) : null;
      await prisma.massnahme.create({
        data: {
          volkId: volk.id,
          stockkartenEintragId: erstellt.id,
          text: massnahme.text,
          faelligAm: am(massnahme.faellig),
          erledigt: erledigtAm !== null && vergangen(erledigtAm),
          erledigtAm: erledigtAm !== null && vergangen(erledigtAm) ? erledigtAm : null,
        },
      });
    }
    if (extras.zurKoenigin && volk.koeniginId) {
      const teile = KOENIGINS_BEURTEILUNGS_KRITERIEN.flatMap((kriterium) => {
        const wert = daten[kriterium.feld];
        if (typeof wert !== "number") return [];
        return [`${kriterium.label} ${noteText(wert)} (${stufeText(kriterium, wert)})`];
      });
      if (daten.honigGeerntet && daten.honigertragKg) teile.push(`Honig ${daten.honigertragKg} kg`);
      if (teile.length > 0) {
        await prisma.koeniginEreignis.create({
          data: {
            koeniginId: volk.koeniginId,
            datum,
            art: "BEWERTUNG",
            volkId: volk.id,
            stockkartenEintragId: erstellt.id,
            notiz: teile.join(" · "),
          },
        });
      }
    }
  }

  const v1 = { id: volk1.id, koeniginId: k1.id };
  const v2 = { id: volk2.id, koeniginId: k2.id };
  const v3 = { id: volk3.id, koeniginId: k3.id };

  // Volk 1: starkes, sanftes Wirtschaftsvolk.
  await eintrag(
    v1,
    [4, 4, 11, 0],
    {
      koeniginGesehen: true,
      stifteGesehen: true,
      larvenGesehen: true,
      verdeckelteBrutGesehen: true,
      volksstaerke: 9,
      bebrueteteWaben: 5,
      volksstaerkeEinschaetzung: 2,
      futtermengeEinschaetzung: 2.5,
      sanftmut: 1.5,
      wabensitz: 2,
      legeleistung: 2,
      gesamteindruck: 2,
      notizen: "Gut überwintert, Futterkranz über der Brut vorhanden.",
    },
    { zurKoenigin: true },
  );
  await eintrag(
    v1,
    [4, 25, 16, 30],
    {
      stifteGesehen: true,
      larvenGesehen: true,
      verdeckelteBrutGesehen: true,
      volksstaerke: 12,
      mittelwaende: 2,
      baurahmenDrohnenrahmen: 1,
      volksstaerkeEinschaetzung: 1.5,
      sanftmut: 1.5,
      schwarmtrieb: 1,
      gesamteindruck: 1.5,
      notizen: "Kirsche blüht. Honigraum aufgesetzt, Baurahmen eingehängt.",
    },
    { aufsetzen: true, massnahmen: [{ text: "Baurahmen schneiden", faellig: [5, 16], erledigt: [5, 16, 10, 30] }] },
  );
  await eintrag(
    v1,
    [5, 16, 10, 30],
    {
      koeniginGesehen: true,
      stifteGesehen: true,
      larvenGesehen: true,
      verdeckelteBrutGesehen: true,
      volksstaerke: 16,
      bebrueteteWaben: 8,
      volksstaerkeEinschaetzung: 1,
      sanftmut: 1.5,
      schwarmtrieb: 2,
      wabensitz: 1.5,
      legeleistung: 1.5,
      gesamteindruck: 1.5,
      drohnenbrutGeschnitten: true,
      notizen: "Spielnäpfchen, aber keine Stifte darin.",
    },
    { zurKoenigin: true },
  );
  await eintrag(
    v1,
    [6, 6, 9, 0],
    {
      honigGeerntet: true,
      honigertragKg: 13.5,
      honigart: "Frühtracht",
      volksstaerkeEinschaetzung: 1,
      gesamteindruck: 1.5,
      notizen: "Frühtracht abgeschleudert, neuer Honigraum drauf.",
    },
    { ernten: true, aufsetzen: true, honigsorte: "Frühtracht" },
  );
  await eintrag(
    v1,
    [7, 12, 8, 30],
    {
      honigGeerntet: true,
      honigertragKg: 11,
      honigart: "Sommertracht",
      varroaZaehlweise: "GEMUELLDIAGNOSE",
      varroaAnzahl: 21,
      varroaGemuellTage: 7,
      gesamteindruck: 1.5,
      notizen: "Sommertracht geerntet, Honigraum abgenommen.",
    },
    { ernten: true, honigsorte: "Sommertracht", zurKoenigin: true },
  );
  await eintrag(v1, [8, 23, 18, 0], {
    varroaZaehlweise: "GEMUELLDIAGNOSE",
    varroaAnzahl: 6,
    varroaGemuellTage: 7,
    fuetterungArt: "INVERTZUCKERSIRUP",
    fuetterungMenge: 10,
    fuetterungEinheit: "KG",
    fuettererAktion: "AUFGESETZT",
    notizen: "Kontrolle nach der Ameisensäure: kaum noch Milbenfall.",
  });
  await eintrag(v1, [9, 6, 17, 30], {
    fuetterungArt: "INVERTZUCKERSIRUP",
    fuetterungMenge: 6,
    fuetterungEinheit: "KG",
    fuettererAktion: "ABGENOMMEN",
    futtermengeEinschaetzung: 1.5,
    gewichtKg: 38,
    wiegemethode: "VOLLSTAENDIG",
  });
  await eintrag(
    v1,
    [10, 4, 14, 0],
    {
      volksstaerkeEinschaetzung: 2,
      futtermengeEinschaetzung: 1,
      sanftmut: 1.5,
      gesamteindruck: 1.5,
      gewichtKg: 41.5,
      wiegemethode: "VOLLSTAENDIG",
      notizen: "Gut eingefüttert. Mäusegitter angebracht.",
    },
    { zurKoenigin: true },
  );

  // Volk 2: Schwarmstimmung im Mai, daraus der Ableger Volk 3.
  await eintrag(
    v2,
    [4, 4, 11, 20],
    {
      koeniginGesehen: true,
      stifteGesehen: true,
      larvenGesehen: true,
      verdeckelteBrutGesehen: true,
      volksstaerke: 8,
      volksstaerkeEinschaetzung: 2.5,
      futtermengeEinschaetzung: 3,
      sanftmut: 3,
      wabensitz: 3,
      legeleistung: 2.5,
      gesamteindruck: 2.5,
    },
    { zurKoenigin: true },
  );
  await eintrag(
    v2,
    [4, 25, 16, 45],
    {
      stifteGesehen: true,
      larvenGesehen: true,
      volksstaerke: 11,
      mittelwaende: 2,
      volksstaerkeEinschaetzung: 2,
      schwarmtrieb: 1.5,
      gesamteindruck: 2.5,
      notizen: "Honigraum aufgesetzt.",
    },
    { aufsetzen: true },
  );
  await eintrag(
    v2,
    [5, 9, 14, 0],
    {
      stifteGesehen: true,
      larvenGesehen: true,
      verdeckelteBrutGesehen: true,
      weiselzellenGesehen: true,
      volksstaerke: 15,
      // Für den Ableger entnommen (Volk 3).
      brutwaben: -3,
      volksstaerkeEinschaetzung: 1.5,
      sanftmut: 3.5,
      schwarmtrieb: 4.5,
      wabensitz: 3,
      legeleistung: 2,
      gesamteindruck: 3,
      notizen:
        "Schwarmstimmung: sechs Weiselzellen mit Larven. Mit 3 Brutwaben samt Zellen einen Ableger gebildet " +
        "(Volk 3), im Volk alle Zellen gebrochen.",
    },
    {
      zurKoenigin: true,
      massnahmen: [{ text: "Nachschau: Weiselzellen ausbrechen", faellig: [5, 16], erledigt: [5, 16, 11, 0] }],
    },
  );
  await eintrag(v2, [5, 16, 11, 0], {
    stifteGesehen: true,
    larvenGesehen: true,
    schwarmtrieb: 2,
    gesamteindruck: 2.5,
    notizen: "Nachgeschaut: nur zwei neue Spielnäpfchen, ausgebrochen.",
  });
  await eintrag(
    v2,
    [6, 6, 9, 30],
    {
      honigGeerntet: true,
      honigertragKg: 9.5,
      honigart: "Frühtracht",
      gesamteindruck: 2.5,
    },
    { ernten: true, aufsetzen: true, honigsorte: "Frühtracht" },
  );
  await eintrag(
    v2,
    [7, 12, 9, 0],
    {
      honigGeerntet: true,
      honigertragKg: 7,
      honigart: "Sommertracht",
      varroaZaehlweise: "GEMUELLDIAGNOSE",
      varroaAnzahl: 32,
      varroaGemuellTage: 7,
      gesamteindruck: 2.5,
    },
    { ernten: true, honigsorte: "Sommertracht" },
  );
  await eintrag(v2, [8, 23, 18, 15], {
    fuetterungArt: "INVERTZUCKERSIRUP",
    fuetterungMenge: 12,
    fuetterungEinheit: "KG",
    fuettererAktion: "AUFGESETZT",
  });
  await eintrag(v2, [9, 6, 17, 45], {
    fuetterungArt: "INVERTZUCKERSIRUP",
    fuetterungMenge: 5,
    fuetterungEinheit: "KG",
    fuettererAktion: "ABGENOMMEN",
    gewichtKg: 35,
    wiegemethode: "VOLLSTAENDIG",
  });
  await eintrag(
    v2,
    [10, 4, 14, 20],
    {
      volksstaerkeEinschaetzung: 2.5,
      futtermengeEinschaetzung: 2,
      sanftmut: 4,
      gesamteindruck: 3.5,
      bienenAngeflogen: true,
      gewichtKg: 37,
      wiegemethode: "VOLLSTAENDIG",
      notizen: "Bei kühlem Wetter recht nervös. Mäusegitter angebracht.",
    },
    { zurKoenigin: true },
  );

  // Volk 3: Ableger mit selbst nachgezogener Königin, Varroa im Juli hoch.
  await eintrag(v3, [5, 9, 15, 0], {
    weiselzellenGesehen: true,
    fuetterungArt: "FUTTERTEIG",
    fuetterungMenge: 1,
    fuetterungEinheit: "KG",
    notizen: "Ableger aus Volk 2 gebildet: 3 Brutwaben mit Weiselzellen, 1 Futterwabe, 2 Mittelwände.",
  });
  await eintrag(v3, [5, 23, 10, 0], {
    notizen: "Weiselzellen sauber aufgebissen, Königin geschlüpft. Jetzt in Ruhe lassen.",
  });
  await eintrag(
    v3,
    [6, 13, 10, 0],
    {
      koeniginGesehen: true,
      stifteGesehen: true,
      larvenGesehen: true,
      volksstaerke: 5,
      volksstaerkeEinschaetzung: 4,
      sanftmut: 2,
      wabensitz: 2,
      legeleistung: 2.5,
      gesamteindruck: 3,
      notizen: "Jungkönigin in Eilage und gezeichnet. Schönes geschlossenes Brutnest.",
    },
    { zurKoenigin: true },
  );
  await eintrag(
    v3,
    [7, 12, 9, 30],
    {
      varroaZaehlweise: "PUDERZUCKER",
      varroaAnzahl: 9,
      varroaBienenprobeGramm: 50,
      volksstaerkeEinschaetzung: 3.5,
      gesamteindruck: 3,
      drohnenbrutGeschnitten: true,
      notizen: "Varroa deutlich über der Schadschwelle.",
    },
    {
      massnahmen: [
        { text: "Varroabehandlung mit Ameisensäure (ganzer Stand)", faellig: [7, 27], erledigt: [7, 27, 18, 0] },
      ],
    },
  );
  await eintrag(v3, [8, 23, 18, 30], {
    varroaZaehlweise: "PUDERZUCKER",
    varroaAnzahl: 3,
    varroaBienenprobeGramm: 50,
    fuetterungArt: "INVERTZUCKERSIRUP",
    fuetterungMenge: 8,
    fuetterungEinheit: "KG",
    fuettererAktion: "AUFGESETZT",
    notizen: "Behandlung hat gewirkt.",
  });
  await eintrag(v3, [9, 20, 16, 0], {
    fuetterungArt: "INVERTZUCKERSIRUP",
    fuetterungMenge: 4,
    fuetterungEinheit: "KG",
    volksstaerkeEinschaetzung: 3.5,
    futtermengeEinschaetzung: 4,
    gesamteindruck: 3,
    gewichtKg: 24,
    wiegemethode: "EINSEITIG",
    notizen: "Noch etwas leicht, Fütterer bleibt drauf.",
  });

  // --- Behandlung (Bestandsbuch) -----------------------------------------
  const ameisensaeure = await prisma.medikament.create({
    data: {
      name: "Ameisensäure 60 % ad us. vet. (Beispiel)",
      wirkstoff: "Ameisensäure",
      einheit: "ml",
      wartezeitTage: 0,
      lieferant: "Imkereibedarf Beispiel, Musterweg 1, 12345 Musterstadt",
      kaufdatum: am([7, 15]),
      belegnummer: `RE-${jahr}-0815`,
      chargennummer: "B-4711",
      verfallsdatum: am([12, 31], jahr + 1),
      notizen: "Erfundenes Beispiel. Echte Medikamente mit Erwerbsbeleg anlegen.",
    },
  });
  await prisma.medikament.create({
    data: {
      name: "Oxalsäuredihydrat-Lösung 3,5 % (Beispiel)",
      wirkstoff: "Oxalsäure",
      einheit: "ml",
      wartezeitTage: 0,
      lieferant: "Imkereibedarf Beispiel, Musterweg 1, 12345 Musterstadt",
      kaufdatum: am([9, 10]),
      belegnummer: `RE-${jahr}-0921`,
      verfallsdatum: am([6, 30], jahr + 1),
      notizen: "Für die Restentmilbung im Winter.",
    },
  });
  if (vergangen(am([7, 27]))) {
    await prisma.behandlung.create({
      data: {
        medikamentId: ameisensaeure.id,
        indikation: "Varroose",
        datum: am([7, 27, 18, 0]),
        endeDatum: vergangen(am([8, 10])) ? am([8, 10]) : null,
        mengeJeVolk: 200,
        wartezeitTage: 0,
        anwender: "Beispiel-Imker",
        bemerkung: "Langzeitverdunster nach der letzten Ernte, alle Völker des Stands.",
        voelker: {
          create: [volk1, volk2, volk3].map((volk) => ({
            volkId: volk.id,
            volkNameDamals: volk.name,
            standNameDamals: stand.name,
          })),
        },
      },
    });
  }

  // --- Offene Maßnahmen rund um heute ---------------------------------
  const winter = am([12, 10]);
  // Angelegt bei der letzten Durchsicht, damit sie im Verlauf nicht mit
  // dem Zeitpunkt des Einrichtens ganz oben stehen.
  const angelegt = vergangen(am([10, 4, 15, 0])) ? am([10, 4, 15, 0]) : tageAb(-7);
  await prisma.massnahme.createMany({
    data: [
      {
        volkId: volk3.id,
        text: "Futterkontrolle: Beute anheben, bei Bedarf nachfüttern",
        faelligAm: tageAb(-2),
        createdAt: angelegt,
      },
      ...[volk1, volk2, volk3].map((volk) => ({
        volkId: volk.id,
        text: "Varroa-Windel einlegen",
        faelligAm: tageAb(3),
        createdAt: angelegt,
      })),
      ...[volk1, volk2, volk3].map((volk) => ({
        volkId: volk.id,
        text: "Restentmilbung mit Oxalsäure (brutfrei)",
        faelligAm: winter.getTime() > tageAb(10).getTime() ? winter : tageAb(40),
        createdAt: angelegt,
      })),
    ],
  });

  // --- Weitere Stände (nur Demo) -----------------------------------------
  // Ein fester Heimstand und ein Wanderstand an der Waldtracht. Die
  // Durchsichten entstehen aus einem festen Muster je Volk, leicht versetzt
  // und mit eigenen Werten, damit die Völker unterscheidbar bleiben.
  if (demo) {
    // Gleiche Zahlenfolge bei jedem Aufbau: die Demo sieht immer gleich aus.
    let saat = 7;
    const zufall = () => {
      saat = (saat * 9301 + 49297) % 233280;
      return saat / 233280;
    };
    // Noten 1,0 bis 6,0 in halben Schritten, um einen Grundwert gestreut.
    const note = (grund: number) => Math.min(6, Math.max(1, Math.round((grund + (zufall() - 0.5)) * 2) / 2));

    const weitereStaende = [
      {
        name: "Heimstand",
        ort: "Musterdorf",
        breitengrad: 48.5531,
        laengengrad: 9.0496,
        standtyp: "FEST" as const,
        notizen: "Hinter der Scheune, windgeschützt. Erfundener Stand der Demo.",
        voelker: [
          { name: "Linde", grund: 1.5, notiz: "Ruhiges Volk, gute Wabenbauerin." },
          { name: "Holunder", grund: 2.5, notiz: "Etwas nervös auf der Wabe." },
          { name: "Quitte", grund: 2, notiz: "Kräftig, neigt im Mai zum Schwärmen." },
        ],
      },
      {
        name: "Waldrand",
        ort: "Musterwald",
        breitengrad: 48.5215,
        laengengrad: 8.9871,
        standtyp: "WANDER" as const,
        notizen: "Wanderstand an der Waldtracht, Völker stehen von Juni bis August hier.",
        voelker: [
          { name: "Tanne 1", grund: 2, notiz: "Aus dem Heimstand zugewandert." },
          { name: "Tanne 2", grund: 1.5, notiz: "Bestes Volk der Saison." },
          { name: "Tanne 3", grund: 3, notiz: "Schwächer, wird beobachtet." },
          { name: "Tanne 4", grund: 2.5, notiz: "Jungvolk aus dem Vorjahr." },
        ],
      },
    ];

    const alleNeuen: { id: string; name: string; standName: string }[] = [];
    for (const [standIndex, standDaten] of weitereStaende.entries()) {
      const neuerStand = await prisma.bienenstand.create({
        data: {
          name: standDaten.name,
          ort: standDaten.ort,
          breitengrad: standDaten.breitengrad,
          laengengrad: standDaten.laengengrad,
          notizen: standDaten.notizen,
          standtyp: standDaten.standtyp,
          voelkerSortierung: "STANDPOSITION",
          createdAt: am([3, 21 + standIndex], jahr),
        },
      });
      for (const [index, volkDaten] of standDaten.voelker.entries()) {
        const jahrgang = jahr - (index % 3);
        const koenigin = await prisma.koenigin.create({
          data: {
            kennung: `${standDaten.name.slice(0, 2).toUpperCase()} ${jahrgang}-${index + 1}`,
            rasse: "Carnica",
            jahrgang,
            zeichenFarbe: farbe(jahrgang),
            zeichenNummer: String(20 + standIndex * 10 + index),
            herkunft: index % 2 === 0 ? "EIGENE_NACHZUCHT" : "ZUKAUF",
            herkunftText: index % 2 === 0 ? null : "Zuchtbetrieb (Beispiel)",
            begattungsart: index % 2 === 0 ? "BELEGSTELLE" : "STANDBEGATTUNG",
            belegstelleId: index % 2 === 0 ? belegstelle.id : null,
            mutterKoeniginId: index % 2 === 0 ? k1.id : null,
            stern: volkDaten.grund <= 1.5,
            status: "IM_VOLK",
          },
        });
        const neuesVolk = await prisma.volk.create({
          data: {
            bienenstandId: neuerStand.id,
            name: volkDaten.name,
            rasse: "Carnica",
            brutraumZargeId: brutraum.id,
            brutraumZargenAnzahl: volkDaten.grund >= 3 ? 1 : 2,
            ...(volkDaten.grund >= 3
              ? { wabenBrut: 3, wabenFutter: 3, wabenLeer: 1, wabenMittelwaende: 0 }
              : { wabenBrut: 5, wabenFutter: 6, wabenLeer: 3, wabenMittelwaende: 0 }),
            wabenStandAm: am([3, 21 + standIndex, 11, index]),
            koeniginId: koenigin.id,
            standReihenfolge: index,
            notizen: volkDaten.notiz,
            createdAt: am([3, 21 + standIndex, 11, index]),
          },
        });
        alleNeuen.push({ id: neuesVolk.id, name: neuesVolk.name, standName: neuerStand.name });
        await prisma.koeniginEreignis.create({
          data: { koeniginId: koenigin.id, datum: am([6, 10], jahrgang), art: "ZUGESETZT", volkId: neuesVolk.id },
        });

        const v = { id: neuesVolk.id, koeniginId: koenigin.id };
        const g = volkDaten.grund;
        const t = index; // Durchsichten je Volk um ein paar Tage versetzt
        const staerke = (spitze: number) => Math.max(4, Math.round(spitze - g * 1.5 + zufall() * 2));
        await eintrag(
          v,
          [4, 6 + t, 11, 0],
          {
            koeniginGesehen: zufall() > 0.4,
            stifteGesehen: true,
            larvenGesehen: true,
            verdeckelteBrutGesehen: true,
            volksstaerke: staerke(11),
            bebrueteteWaben: Math.max(3, 7 - Math.round(g)),
            volksstaerkeEinschaetzung: note(g),
            futtermengeEinschaetzung: note(2),
            sanftmut: note(g),
            gesamteindruck: note(g),
            notizen: "Auswinterung: Volk sitzt gut, Futter reicht.",
          },
          { zurKoenigin: true },
        );
        await eintrag(
          v,
          [4, 24 + t, 15, 0],
          {
            stifteGesehen: true,
            larvenGesehen: true,
            volksstaerke: staerke(15),
            mittelwaende: 2,
            baurahmenDrohnenrahmen: 1,
            volksstaerkeEinschaetzung: note(g),
            schwarmtrieb: note(1.5),
            notizen: "Honigraum aufgesetzt, Baurahmen gegeben.",
          },
          { aufsetzen: true },
        );
        await eintrag(
          v,
          [5, 12 + t, 10, 0],
          {
            koeniginGesehen: zufall() > 0.5,
            stifteGesehen: true,
            larvenGesehen: true,
            verdeckelteBrutGesehen: true,
            weiselzellenGesehen: volkDaten.name === "Quitte",
            volksstaerke: staerke(20),
            volksstaerkeEinschaetzung: note(g - 0.5),
            sanftmut: note(g),
            schwarmtrieb: volkDaten.name === "Quitte" ? 4 : note(2),
            wabensitz: note(g),
            legeleistung: note(g),
            gesamteindruck: note(g),
            drohnenbrutGeschnitten: true,
            notizen:
              volkDaten.name === "Quitte"
                ? "Bestiftete Weiselzellen. Zellen gebrochen, Schwarmkontrolle in 7 Tagen."
                : "Baurahmen geschnitten, keine Schwarmstimmung.",
          },
          {
            zurKoenigin: true,
            massnahmen:
              volkDaten.name === "Quitte"
                ? [{ text: "Schwarmkontrolle", faellig: [5, 19 + t], erledigt: [5, 19 + t, 10, 0] }]
                : [],
          },
        );
        await eintrag(
          v,
          [6, 4 + t, 9, 30],
          {
            honigGeerntet: true,
            honigertragKg: Math.round((16 - g * 3 + zufall() * 3) * 2) / 2,
            honigart: "Frühtracht",
            volksstaerkeEinschaetzung: note(g),
            notizen: standDaten.standtyp === "WANDER" ? "Frühtracht geerntet, danach an den Waldrand gewandert." : "Frühtracht geerntet.",
          },
          { ernten: true, aufsetzen: true, honigsorte: "Frühtracht" },
        );
        await eintrag(
          v,
          [7, 18 + t, 8, 30],
          {
            honigGeerntet: true,
            honigertragKg: Math.round((14 - g * 2.5 + zufall() * 4) * 2) / 2,
            honigart: standDaten.standtyp === "WANDER" ? "Waldhonig" : "Sommertracht",
            varroaZaehlweise: "GEMUELLDIAGNOSE",
            varroaAnzahl: Math.round(8 + g * 6 + zufall() * 10),
            varroaGemuellTage: 7,
            gesamteindruck: note(g),
            notizen: "Letzte Ernte, Honigraum abgenommen. Windel für die Varroa-Kontrolle eingelegt.",
          },
          { ernten: true, honigsorte: standDaten.standtyp === "WANDER" ? "Waldhonig" : "Sommertracht", zurKoenigin: true },
        );
        await eintrag(v, [8, 20 + t, 18, 0], {
          varroaZaehlweise: "GEMUELLDIAGNOSE",
          varroaAnzahl: Math.round(2 + zufall() * 5),
          varroaGemuellTage: 7,
          fuetterungArt: "INVERTZUCKERSIRUP",
          fuetterungMenge: 10,
          fuetterungEinheit: "KG",
          fuettererAktion: "AUFGESETZT",
          notizen: "Nach der Ameisensäure: wenig Milbenfall. Fütterung begonnen.",
        });
        await eintrag(v, [9, 14 + t, 17, 0], {
          fuetterungArt: "INVERTZUCKERSIRUP",
          fuetterungMenge: 6,
          fuetterungEinheit: "KG",
          fuettererAktion: "ABGENOMMEN",
          futtermengeEinschaetzung: note(1.5),
          gewichtKg: Math.round((40 - g * 3 + zufall() * 3) * 2) / 2,
          wiegemethode: "VOLLSTAENDIG",
          notizen: "Eingefüttert.",
        });
        await eintrag(
          v,
          [10, 6 + t, 14, 0],
          {
            volksstaerkeEinschaetzung: note(g),
            futtermengeEinschaetzung: note(1.5),
            sanftmut: note(g),
            gesamteindruck: note(g),
            notizen: "Wintersitz gebildet. Mäusegitter dran.",
          },
          { zurKoenigin: true },
        );
      }
    }

    if (vergangen(am([7, 28]))) {
      await prisma.behandlung.create({
        data: {
          medikamentId: ameisensaeure.id,
          indikation: "Varroose",
          datum: am([7, 28, 18, 0]),
          endeDatum: vergangen(am([8, 11])) ? am([8, 11]) : null,
          mengeJeVolk: 200,
          wartezeitTage: 0,
          anwender: "Beispiel-Imker",
          bemerkung: "Langzeitverdunster, Heimstand und Waldrand.",
          voelker: {
            create: alleNeuen.map((volk) => ({
              volkId: volk.id,
              volkNameDamals: volk.name,
              standNameDamals: volk.standName,
            })),
          },
        },
      });
    }
    await prisma.massnahme.createMany({
      data: alleNeuen.map((volk, index) => ({
        volkId: volk.id,
        text: index % 3 === 0 ? "Futterkontrolle: Beute anheben" : "Varroa-Windel einlegen",
        faelligAm: tageAb(index % 3 === 0 ? 1 : 5),
        createdAt: tageAb(-7),
      })),
    });
  }

  // --- Lager ----------------------------------------------------------
  await prisma.materialartikel.createMany({
    data: [
      { name: "Mittelwände Zander", einheit: "Stück", bestand: 30 },
      { name: "Futtersirup (Invertzucker)", einheit: "kg", bestand: 28 },
    ],
  });
  if (honig && vergangen(am([6, 20]))) {
    // Frühtracht (23 kg lose aus den Ernten) abgefüllt wie über "Abfüllen"
    // im Lager: 20 kg raus, 30 × 500 g + 20 × 250 g rein (gerührt), 3 kg
    // bleiben lose. Danach ein Hofverkauf von 20 Gläsern.
    const glas500 = await prisma.gebinde.findFirst({ where: { erzeugnistypId: honig.id, inhalt: 0.5 } });
    const glas250 = await prisma.gebinde.findFirst({ where: { erzeugnistypId: honig.id, inhalt: 0.25 } });
    const fruehtracht = sorteIds.get("Frühtracht");
    if (glas500 && glas250) {
      const abfuellen = { erzeugnistypId: honig.id, datum: am([6, 20]), grund: "Abfüllen", sorteId: fruehtracht };
      await prisma.erzeugnisBuchung.createMany({
        data: [
          { ...abfuellen, menge: -20, zustand: "UNBEARBEITET" },
          { ...abfuellen, menge: 15, zustand: "GERUEHRT", gebindeId: glas500.id, anzahl: 30 },
          { ...abfuellen, menge: 5, zustand: "GERUEHRT", gebindeId: glas250.id, anzahl: 20 },
        ],
      });
      if (vergangen(am([7, 1]))) {
        await prisma.erzeugnisBuchung.create({
          data: {
            erzeugnistypId: honig.id,
            menge: -10,
            datum: am([7, 1]),
            grund: "Verkauf",
            sorteId: fruehtracht,
            zustand: "GERUEHRT",
            gebindeId: glas500.id,
            anzahl: -20,
            erloes: 130,
            kaeufer: "Hofverkauf",
          },
        });
      }
      // Ein Ableger, der nie als eigenes Volk geführt wurde.
      if (vergangen(am([7, 5]))) {
        await prisma.verkauf.create({
          data: { art: "ABLEGER", datum: am([7, 5]), bezeichnung: "Ableger Carnica", anzahl: 2, preis: 240, kaeufer: "Imkerverein" },
        });
      }
    }
  }
}
