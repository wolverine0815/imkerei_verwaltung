import { massnahmenBuendeln } from "@/lib/massnahmen-buendeln";
import { SICHTBARE_MASSNAHMEN } from "@/lib/massnahmen-sichtbar";
import { abgeschalteteBereiche } from "@/lib/bereiche";
import { standGtsTexte } from "@/lib/waagen";
import { lubwLage } from "@/lib/bundeslaender";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { Card, knopfKlassen } from "@/components/ui";
import { IconKarte, IconMassnahmen, IconWarnung } from "@/components/icons";
import { BienenstandFotoLightbox } from "@/components/bienenstand-foto-lightbox";
import { bienenstandFotoAktualisieren, bienenstandFotoAusschnittAktualisieren } from "@/lib/actions";
import { kurzesDatum } from "@/lib/honig";
import { StandtypBadge } from "@/components/standtyp";
import type { Standtyp } from "@/generated/prisma/enums";
import { massnahmenGruppieren } from "@/lib/massnahmen-gruppen";
import { faelligkeitBestimmen } from "@/lib/faelligkeit";
import { VelutinaHinweis } from "@/components/velutina-hinweis";
import { saisonLage } from "@/lib/velutina";
import { SeitenNavigation } from "@/components/seiten-navigation";
import { VolkSchnellsuche } from "@/components/volk-schnellsuche";
import { aktuellesDesign } from "@/lib/design";
import { StartKlar, StartWabe, type StartDaten, type StartMassnahme, type StartStand } from "@/components/start-designs";
import { GESAMTEINDRUCK_KRITERIUM, kriteriumEinstufung } from "@/components/stockkarten-eintrag-felder";

type BienenstandMitZusammenfassung = {
  id: string;
  name: string;
  strasse: string | null;
  ort: string | null;
  standtyp: Standtyp;
  standortFotoDateiname: string | null;
  standortFotoZoom: number;
  standortFotoFokusX: number;
  standortFotoFokusY: number;
  voelker: {
    name: string;
    eintraege: { datum: Date; gesamteindruck: number | null }[];
    massnahmen: { id: string; text: string; faelligAm: Date | null; createdAt: Date; zuchtserieId: string | null; bioVerfahrenId: string | null }[];
  }[];
};

// Fasst zusammen, was auf der Kachel zusätzlich zu Name/Adresse interessant
// ist: Anzahl aktiver Völker, Datum der letzten Durchsicht an diesem Stand
// (über alle Völker hinweg) und offene Maßnahmen aller Völker - dieselbe
// Grundlage, die auch die Volk-Kachel selbst schon für "offene Maßnahmen"
// verwendet.
function standZusammenfassung(bienenstand: BienenstandMitZusammenfassung) {
  const letzteEintraege = bienenstand.voelker
    .map((volk) => volk.eintraege[0])
    .filter((eintrag): eintrag is BienenstandMitZusammenfassung["voelker"][number]["eintraege"][number] =>
      Boolean(eintrag)
    );

  const letzteDurchsicht = letzteEintraege.reduce<Date | null>((spaeteste, eintrag) => {
    return !spaeteste || eintrag.datum > spaeteste ? eintrag.datum : spaeteste;
  }, null);

  // Gezählt wird wie auf der Maßnahmen-Seite: eine Zuchtserie zählt einmal,
  // ebenso eine Sammelmaßnahme für mehrere Völker dieses Stands (gleicher
  // Text, Termin, Anlegezeit) - sonst stünde für "alle Völker wiegen" gleich
  // die Zahl der Völker an der Kachel.
  const heute = new Date();
  // Von einem biotechnischen Verfahren zählt nur der nächste Schritt.
  const gruppen = massnahmenGruppieren(
    bienenstand.voelker.flatMap((volk) =>
      massnahmenBuendeln(volk.massnahmen).map((massnahme) => ({
        ...massnahme,
        zuchtserie: massnahme.zuchtserieId ? { id: massnahme.zuchtserieId, bezeichnung: "" } : null,
      }))
    )
  );
  const offeneMassnahmen = gruppen.length;
  // Die rote Plakette zählt nur, was überfällig oder heute fällig ist -
  // Maßnahmen mit späterem Termin sind kein Alarm und stecken nur in der
  // grauen Zahl, solange nichts dringend ist.
  const dringendeMassnahmen = gruppen.filter((gruppe) =>
    (gruppe.art === "einzeln" ? [gruppe.massnahme] : gruppe.massnahmen).some((massnahme) =>
      ["ueberfaellig", "heute"].includes(faelligkeitBestimmen(massnahme.faelligAm, heute))
    )
  ).length;

  return {
    anzahlVoelker: bienenstand.voelker.length,
    letzteDurchsicht,
    offeneMassnahmen,
    dringendeMassnahmen,
  };
}

function BienenstandKachel({
  bienenstand,
  gedaempft = false,
  gts = null,
}: {
  bienenstand: BienenstandMitZusammenfassung;
  gedaempft?: boolean;
  gts?: string | null;
}) {
  const { anzahlVoelker, letzteDurchsicht, offeneMassnahmen, dringendeMassnahmen } = standZusammenfassung(bienenstand);
  const dringend = dringendeMassnahmen > 0;
  const plakettenZahl = dringend ? dringendeMassnahmen : offeneMassnahmen;

  return (
    <div
      className={`relative flex min-h-40 gap-3 sm:min-h-44 rounded-xl border border-border bg-card p-4 shadow-md transition-shadow hover:shadow-lg ${gedaempft ? "opacity-70 hover:opacity-100" : ""}`}
    >
      {/* Deckt die komplette Kachel ab, unabhängig davon, wie viel Text
          gerade angezeigt wird - so reagiert die ganze Kachel aufs Antippen
          und nicht nur der Name. Braucht ein eigenes, positives z-index,
          damit der Textbereich darunter (spätere Position im normalen
          Fluss, deshalb optisch darüber) die Klicks nicht abfängt. Das
          Vorschaubild daneben liegt bewusst noch höher (z-20) - es hat
          seine eigene Aufgabe und öffnet das Foto-Popup. */}
      <Link
        href={`/bienenstaende/${bienenstand.id}`}
        aria-label={`Bienenstand ${bienenstand.name} öffnen`}
        className="absolute inset-0 z-10"
      />
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex flex-wrap items-start justify-between gap-x-2 gap-y-1">
          <h2 className="min-w-0 break-words text-lg font-semibold">{bienenstand.name}</h2>
          {offeneMassnahmen > 0 && (
            <span
              title={
                dringend
                  ? `${dringendeMassnahmen} ${dringendeMassnahmen === 1 ? "Maßnahme" : "Maßnahmen"} überfällig oder heute fällig, ${offeneMassnahmen} offen insgesamt`
                  : `${offeneMassnahmen} ${offeneMassnahmen === 1 ? "offene Maßnahme" : "offene Maßnahmen"}`
              }
              className={`flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-xs font-bold ${
                dringend
                  ? "bg-gefahr-voll text-gefahr-voll-text shadow-[0_0_14px_3px_rgba(239,68,68,0.85)]"
                  : "border border-border bg-background text-muted"
              }`}
            >
              {dringend ? <IconWarnung className="h-3.5 w-3.5 shrink-0" /> : <IconMassnahmen className="h-3.5 w-3.5 shrink-0" />}
              {plakettenZahl}
            </span>
          )}
        </div>
        <div className="mt-1">
          <StandtypBadge standtyp={bienenstand.standtyp} />
        </div>
        {(bienenstand.strasse || bienenstand.ort) && (
          <p className="mt-1 text-sm text-muted">
            {[bienenstand.strasse, bienenstand.ort].filter(Boolean).join(", ")}
          </p>
        )}
        <div className="mt-auto flex flex-col gap-0.5 pt-3 text-sm text-muted">
          <p>
            {anzahlVoelker} {anzahlVoelker === 1 ? "Volk" : "Völker"}
          </p>
          {letzteDurchsicht && <p>Letzte Durchsicht: {kurzesDatum(letzteDurchsicht)}</p>}
          {gts && <p title="Grünlandtemperatursumme">GTS: {gts}</p>}
        </div>
      </div>

      <BienenstandFotoLightbox
        bienenstandId={bienenstand.id}
        dateiname={bienenstand.standortFotoDateiname}
        zoom={bienenstand.standortFotoZoom}
        fokusX={bienenstand.standortFotoFokusX}
        fokusY={bienenstand.standortFotoFokusY}
        action={bienenstandFotoAktualisieren}
        ausschnittAction={bienenstandFotoAusschnittAktualisieren}
        vorschau
        knopfKlasse="z-20 h-32 w-32 sm:h-36 sm:w-36"
      />
    </div>
  );
}

// Aufbereitung für die neuen Designs (siehe start-designs.tsx): Kennzahlen
// über alle aktiven Stände und die nächsten fälligen Maßnahmen.
function startDaten(
  aktive: BienenstandMitZusammenfassung[],
  archivierte: BienenstandMitZusammenfassung[],
  gts: Map<string, string>,
) {
  const heute = new Date();
  const stand = (b: BienenstandMitZusammenfassung): StartStand => {
    const z = standZusammenfassung(b);
    return {
      id: b.id,
      name: b.name,
      standtyp: b.standtyp,
      adresse: [b.strasse, b.ort].filter(Boolean).join(", "),
      anzahlVoelker: z.anzahlVoelker,
      gts: gts.get(b.id) ?? null,
      letzteDurchsicht: z.letzteDurchsicht,
      offen: z.offeneMassnahmen,
      dringend: z.dringendeMassnahmen,
      stufen: b.voelker.map((volk) => kriteriumEinstufung(GESAMTEINDRUCK_KRITERIUM, volk.eintraege[0]?.gesamteindruck ?? null)),
      foto: { dateiname: b.standortFotoDateiname, zoom: b.standortFotoZoom, fokusX: b.standortFotoFokusX, fokusY: b.standortFotoFokusY },
    };
  };
  // Alle offenen Maßnahmen der aktiven Stände, Sammelmaßnahmen und
  // Zuchtserien als ein Eintrag (wie auf der Maßnahmen-Seite).
  const alle = aktive.flatMap((b) =>
    b.voelker.flatMap((volk) =>
      massnahmenBuendeln(volk.massnahmen).map((massnahme) => ({
        ...massnahme,
        standName: b.name,
        volkName: volk.name,
        zuchtserie: massnahme.zuchtserieId ? { id: massnahme.zuchtserieId, bezeichnung: "" } : null,
      }))
    )
  );
  alle.sort((a, b) => (a.faelligAm?.getTime() ?? Infinity) - (b.faelligAm?.getTime() ?? Infinity));
  const gruppen = massnahmenGruppieren(alle);
  const zahlen = { ueberfaellig: 0, heute: 0, woche: 0, voelker: aktive.reduce((s, b) => s + b.voelker.length, 0) };
  const naechste: StartMassnahme[] = gruppen.map((gruppe) => {
    const mitglieder = gruppe.art === "einzeln" ? [gruppe.massnahme] : gruppe.massnahmen;
    const erste = mitglieder[0]!;
    const faelligkeit = faelligkeitBestimmen(erste.faelligAm, heute);
    if (faelligkeit === "ueberfaellig") zahlen.ueberfaellig++;
    if (faelligkeit === "heute") zahlen.heute++;
    if (faelligkeit === "bald") zahlen.woche++;
    const staende = [...new Set(mitglieder.map((m) => m.standName))];
    const wo =
      mitglieder.length === 1
        ? `${erste.volkName} · ${erste.standName}`
        : `${staende.length === 1 ? staende[0] : `${staende.length} Stände`} · ${mitglieder.length} Völker`;
    return { schluessel: erste.id, text: erste.text, wo, faelligAm: erste.faelligAm, faelligkeit };
  });
  return { aktive: aktive.map(stand), archivierte: archivierte.map(stand), zahlen, naechste: naechste.slice(0, 6) };
}

export default async function StartPage() {
  const aus = await abgeschalteteBereiche();
  const ohneZucht = aus.includes("koeniginnen");
  const zusammenfassungAuswahl = {
    id: true,
    name: true,
    strasse: true,
    ort: true,
    standtyp: true,
    standortFotoDateiname: true,
    standortFotoZoom: true,
    standortFotoFokusX: true,
    standortFotoFokusY: true,
    voelker: {
      where: { archiviert: false },
      orderBy: [{ standReihenfolge: "asc" as const }, { createdAt: "asc" as const }],
      select: {
        name: true,
        eintraege: {
          orderBy: { datum: "desc" as const },
          take: 1,
          select: { datum: true, gesamteindruck: true },
        },
        massnahmen: {
          where: { ...SICHTBARE_MASSNAHMEN, erledigt: false, ...(ohneZucht ? { zuchtserieId: null } : {}) },
          orderBy: { faelligAm: "asc" as const },
          select: { id: true, text: true, faelligAm: true, createdAt: true, zuchtserieId: true, bioVerfahrenId: true },
        },
      },
    },
  };

  const [aktive, archivierte, velutina, suchVoelkerRoh] = await Promise.all([
    prisma.bienenstand.findMany({
      where: { archiviert: false },
      orderBy: { name: "asc" },
      select: zusammenfassungAuswahl,
    }),
    prisma.bienenstand.findMany({
      where: { archiviert: true },
      orderBy: { name: "asc" },
      select: zusammenfassungAuswahl,
    }),
    aus.includes("velutina") || (await lubwLage()) === "anderes"
      ? Promise.resolve(null)
      : saisonLage().catch(() => null),
    // Alle aktiven Völker der aktiven Stände für die Schnellsuche - die
    // Kachel-Abfrage oben trägt nur Anzahl und Maßnahmen, nicht die Namen.
    prisma.volk.findMany({
      where: { archiviert: false, bienenstand: { archiviert: false } },
      select: { id: true, name: true, bienenstand: { select: { name: true } } },
    }),
  ]);
  const suchVoelker = suchVoelkerRoh.map((volk) => ({ id: volk.id, name: volk.name, standName: volk.bienenstand.name }));
  const neueVelutina = velutina?.imBereich.filter((meldung) => meldung.neu) ?? [];
  const gts = aus.includes("waagen") ? new Map<string, string>() : await standGtsTexte(aktive.map((stand) => stand.id));

  const design = await aktuellesDesign();
  if (design !== "aktuell") {
    const oben = (
      <>
        {velutina && neueVelutina.length > 0 && (
          <VelutinaHinweis
            meldungen={neueVelutina}
            akutRadiusM={velutina.einstellung.akutRadiusM}
            warnRadiusM={velutina.einstellung.warnRadiusM}
            link="/velutina"
            zeigeStand
          />
        )}
        <VolkSchnellsuche voelker={suchVoelker} />
      </>
    );
    const daten: StartDaten = {
      ...startDaten(aktive, archivierte, gts),
      velutinaNeu: velutina ? neueVelutina.length : null,
      oben,
    };
    return design === "wabe" ? <StartWabe daten={daten} /> : <StartKlar daten={daten} />;
  }

  return (
    <div className="flex flex-col gap-6">
      <SeitenNavigation className="-mb-3" />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">Bienenstände</h1>
        <div className="flex flex-wrap gap-2">
          <Link
            href="/karte"
            className={`${knopfKlassen("secondary", "klein")} gap-1.5`}
          >
            <IconKarte className="h-4 w-4" /> Kartenübersicht
          </Link>
          <Link
            href="/bienenstaende/neu"
            className={knopfKlassen("primary", "klein")}
          >
            + Neuer Bienenstand
          </Link>
        </div>
      </div>

      {velutina && (
        <VelutinaHinweis
          meldungen={neueVelutina}
          akutRadiusM={velutina.einstellung.akutRadiusM}
          warnRadiusM={velutina.einstellung.warnRadiusM}
          link="/velutina"
          zeigeStand
        />
      )}

      <VolkSchnellsuche voelker={suchVoelker} />

      {aktive.length === 0 ? (
        <Card className="text-center text-muted">
          Noch kein Bienenstand angelegt. Leg mit &bdquo;Neuer Bienenstand&ldquo; deinen
          ersten Standort an.
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {aktive.map((bienenstand) => (
            <BienenstandKachel key={bienenstand.id} bienenstand={bienenstand} gts={gts.get(bienenstand.id)} />
          ))}
        </div>
      )}

      {archivierte.length > 0 && (
        <div className="flex flex-col gap-3">
          <h2 className="text-sm font-medium text-muted">Archivierte Bienenstände</h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {archivierte.map((bienenstand) => (
              <BienenstandKachel key={bienenstand.id} bienenstand={bienenstand} gedaempft />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
