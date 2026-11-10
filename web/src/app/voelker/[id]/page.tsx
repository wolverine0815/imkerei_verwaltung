import { abgeschalteteBereiche } from "@/lib/bereiche";
import { SICHTBARE_MASSNAHMEN } from "@/lib/massnahmen-sichtbar";
import { FUETTERER_AKTION_LABEL, type FuettererAktion } from "@/lib/fuetterer";
import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import {
  volkFotoAktualisieren,
  volkFotoAusschnittAktualisieren,
  volkStatusAendern,
  volkUmziehen,
  dokumentLoeschen,
  koeniginUmweiseln,
} from "@/lib/actions";
import { DokumenteMiniListe } from "@/components/dokumente-mini-liste";
import { Card, knopfKlassen } from "@/components/ui";
import { zuckerIstNaeherung, zuckerNaeherungKg, type FuetterungsEinheit } from "@/lib/fuetterung-zucker";
import { anzeigeFarbe, koeniginZeile, verbleibKurz, type EreignisArt } from "@/lib/koeniginnen";
import { KoeniginUmweiselnDialog } from "@/components/koenigin-umweiseln-dialog";
import { KoeniginStern } from "@/components/koenigin-stern";
import { VolkFotoLightbox } from "@/components/volk-foto-lightbox";
import { GewichtVerlauf } from "@/components/gewicht-verlauf";
import { ErsteDurchsichtKnopf, StandSammelAktionen } from "@/components/stand-sammel-aktionen";
import { letzteBewertungenLaden, letzteWabenzahlenLaden } from "@/lib/letzte-durchsicht";
import { wabenbestaendeLaden, wabenbestandLaden } from "@/lib/wabenbestand";
import { wabenAenderungText } from "@/lib/waben";
import { sortiereVoelker } from "@/lib/voelker-sortierung";
import {
  BEURTEILUNGS_KRITERIEN,
  kriteriumEinstufung,
  stufeKurz,
  GESAMTEINDRUCK_KRITERIUM as GESAMTEINDRUCK,
  FUETTERUNGS_ART_LABEL,
  WIEGEMETHODE_LABEL,
} from "@/components/stockkarten-eintrag-felder";
import { MassnahmenListe } from "@/components/massnahmen-liste";
import { MassnahmeImVerlauf } from "@/components/massnahme-im-verlauf";
import { erstellerNamen, helferVorhanden } from "@/lib/historie-anzeige";
import { WartendeEingaben } from "@/components/wartende-eingaben";
import { VolkQrCode } from "@/components/volk-qr-code";
import { VolkStatusDialog } from "@/components/volk-status-dialog";
import { AKTION_KACHEL, AKTION_SYMBOL } from "@/components/volk-aktion-kachel";
import { VARROA_ZAEHLWEISE_LABEL, varroaAuswerten } from "@/lib/varroa";
import { datumAnzeige, dauerAnzeige, mengeAnzeige } from "@/lib/behandlung";
import {
  BANNWABE_VARIANTE_LABEL,
  VERBLEIB_LABEL,
  bannwabeVariante,
  behandlungLink,
  verfahrenFortschritt,
  verfahrenSchritte,
  verfahrenTitel,
} from "@/lib/bio-verfahren";
import { beutenStammdatenLaden } from "@/lib/beuten";
import { datumAlsInputWert, jetztAlsInputWert } from "@/lib/datum";
import { VolkUmzugDialog } from "@/components/volk-umzug-dialog";
import {
  brutraumBezeichnung,
  gruppiertAufzaehlen,
  kgAnzeige,
  kurzesDatum,
  WABENBESCHAFFENHEIT_LABEL,
} from "@/lib/honig";
import { IconBearbeiten, IconKrone, IconQrCode, IconUmzug, IconVerlauf, IconWinkelRechts } from "@/components/icons";
import { FuettererPlakette } from "@/components/fuetterer-plakette";
import { SeitenNavigation } from "@/components/seiten-navigation";
import { StockkartenBilder } from "@/components/bild-betrachter";
import { stockkartenBildName } from "@/lib/bild-name";
import { AMPEL_TEXT, EINSTUFUNG_AMPEL } from "@/lib/ampel";
import { MiniStrahl } from "@/components/mini-strahl";
import { AmpelSymbol } from "@/components/ampel-symbol";
import { massnahmenBuendeln } from "@/lib/massnahmen-buendeln";
import { gleicherRutsch } from "@/lib/massnahmen-gruppen";
import { faelligkeitBestimmen } from "@/lib/faelligkeit";

const STATUS_OPTIONEN = [
  { wert: "AKTIV", label: "aktiv" },
  { wert: "AUFGELOEST", label: "aufgelöst" },
  { wert: "VERKAUFT", label: "verkauft" },
  { wert: "VERLOREN", label: "verloren (z.B. Überwinterung)" },
];

// Plakette für den Status unter dem Namen: aktiv grün, alles andere neutral.
// Das Wort in Klammern ("verloren (z.B. Überwinterung)") gehört nur ins
// Auswahlfeld und wird hier weggelassen.
function statusPlakette(status: string) {
  const label = (STATUS_OPTIONEN.find((option) => option.wert === status)?.label ?? status).replace(/ \(.*\)$/, "");
  const farbe =
    status === "AKTIV"
      ? "bg-ok-flaeche text-ok"
      : "bg-background text-muted";
  return { label, farbe };
}

// "05.08." - in der Kurzleiste einer Saison steht das Jahr schon davor.
function tagUndMonat(datum: Date): string {
  return datum.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit" });
}

function anzahlText(anzahl: number, einzahl: string, mehrzahl: string): string {
  return `${anzahl} ${anzahl === 1 ? einzahl : mehrzahl}`;
}

// Gesamteindruck in der Kurzleiste: gelb und rot in Ampelfarbe mit Symbol,
// grün unauffällig wie der Rest der Zeile.
type WechselKoenigin = { id: string; kennung: string; jahrgang: number | null; zeichenFarbe: string | null };

/// Königinnenwechsel im Volk aus den Lebenslauf-Ereignissen: jedes "zugesetzt"
/// ist ein Wechsel; ging am selben Tag eine andere Königin aus diesem Volk
/// (entnommen, verstorben, verkauft), war es ein Umweiseln von alt auf neu.
function koeniginWechsel(
  ereignisse: { id: string; art: string; datum: Date; notiz: string | null; koeniginId: string; koenigin: WechselKoenigin }[]
) {
  const gleicherTag = (a: Date, b: Date) => a.toDateString() === b.toDateString();
  const abgaenge = ereignisse.filter((ereignis) => ereignis.art !== "ZUGESETZT");
  return ereignisse
    .filter((ereignis) => ereignis.art === "ZUGESETZT")
    .map((zugesetzt) => {
      // Beim Umweiseln haben beide Ereignisse genau denselben Zeitpunkt; von
      // Hand nachgetragene liegen wenigstens am selben Tag.
      const andere = abgaenge.filter((abgang) => abgang.koeniginId !== zugesetzt.koeniginId);
      const alt =
        andere.find((abgang) => abgang.datum.getTime() === zugesetzt.datum.getTime()) ??
        andere.find((abgang) => gleicherTag(abgang.datum, zugesetzt.datum));
      return {
        id: zugesetzt.id,
        datum: zugesetzt.datum,
        neu: zugesetzt.koenigin,
        notiz: zugesetzt.notiz,
        alt: alt && { koenigin: alt.koenigin, verbleib: verbleibKurz(alt.art as EreignisArt, alt.notiz) },
      };
    });
}

function KoeniginPille({ koenigin, alt = false }: { koenigin: WechselKoenigin; alt?: boolean }) {
  const farbe = anzeigeFarbe(koenigin.jahrgang, koenigin.zeichenFarbe);
  return (
    <Link
      href={`/koeniginnen/${koenigin.id}`}
      className={`inline-flex items-center gap-1.5 rounded-full border border-border bg-background py-0.5 pl-1 pr-2.5 hover:border-accent ${
        alt ? "text-muted line-through" : "font-semibold"
      }`}
    >
      <span
        className="h-4 w-4 rounded-full border border-rand-bedienung"
        style={{ background: farbe?.hex ?? "transparent" }}
        aria-hidden="true"
      />
      {koenigin.kennung}
    </Link>
  );
}

function GesamteindruckKurz({ datum, wert }: { datum: Date; wert: number }) {
  const einstufung = kriteriumEinstufung(GESAMTEINDRUCK, wert);
  const text = `Bewertung ${tagUndMonat(datum)}: ${stufeKurz(GESAMTEINDRUCK, wert)}`;
  if (einstufung === null || einstufung === "gruen") return text;
  return (
    <span className={`font-medium ${AMPEL_TEXT[EINSTUFUNG_AMPEL[einstufung]]}`}>
      {text} <AmpelSymbol einstufung={einstufung} className="inline-block h-[1em] w-[1em] align-[-0.125em]" />
    </span>
  );
}

type SaisonEintrag = {
  datum: Date;
  umzugVonStandName: string | null;
  gesamteindruck: number | null;
  stifteGesehen: boolean | null;
  gewichtKg: number | null;
  varroaZaehlweise: string | null;
  varroaAnzahl: number | null;
  varroaGemuellTage: number | null;
  varroaBienenprobeGramm: number | null;
};

// Überschrift eines Saisonblocks im Verlauf: "Saison 2026 · 10 Durchsichten"
// und darunter eine Zeile mit dem Stand der Saison - auch bei zugeklappten
// Vorjahren sichtbar. Die Einträge kommen neueste zuerst; je Angabe zählt
// die jüngste Durchsicht, in der sie ausgefüllt ist. Die Bewertung steht als
// Wertungstext da, nie als Note.
function saisonUeberblick(
  eintraege: SaisonEintrag[],
  massnahmenAnzahl: number,
  behandlungenAnzahl: number,
  wechselAnzahl: number
) {
  // Ein reiner Umzug ist keine Durchsicht.
  const durchsichten = eintraege.filter((eintrag) => !eintrag.umzugVonStandName);
  const zaehler = [
    durchsichten.length > 0 && anzahlText(durchsichten.length, "Durchsicht", "Durchsichten"),
    massnahmenAnzahl > 0 && anzahlText(massnahmenAnzahl, "Maßnahme", "Maßnahmen"),
    behandlungenAnzahl > 0 && anzahlText(behandlungenAnzahl, "Behandlung", "Behandlungen"),
    wechselAnzahl > 0 && anzahlText(wechselAnzahl, "Königinnenwechsel", "Königinnenwechsel"),
  ].filter(Boolean);
  if (zaehler.length === 0) zaehler.push(anzahlText(eintraege.length, "Eintrag", "Einträge"));

  const letzte = durchsichten[0];
  const bewertet = durchsichten.find((eintrag) => eintrag.gesamteindruck !== null);
  const stifte = durchsichten.find((eintrag) => eintrag.stifteGesehen);
  const gewogen = durchsichten.find((eintrag) => eintrag.gewichtKg !== null);
  const varroa = durchsichten
    .map((eintrag) => ({
      datum: eintrag.datum,
      auswertung: varroaAuswerten({
        zaehlweise: eintrag.varroaZaehlweise,
        anzahl: eintrag.varroaAnzahl,
        gemuellTage: eintrag.varroaGemuellTage,
        bienenprobeGramm: eintrag.varroaBienenprobeGramm,
        datum: eintrag.datum,
      }),
    }))
    .find((messung) => messung.auswertung !== null);

  const kurzleiste: React.ReactNode[] = [
    letzte && `Letzte Durchsicht ${tagUndMonat(letzte.datum)}`,
    bewertet && <GesamteindruckKurz datum={bewertet.datum} wert={bewertet.gesamteindruck as number} />,
    stifte && `Stifte gesehen ${tagUndMonat(stifte.datum)}`,
    varroa?.auswertung &&
      (varroa.auswertung.schwelleErreicht ? (
        <span className="font-medium text-gefahr">
          Varroa {tagUndMonat(varroa.datum)}: {varroa.auswertung.anzeige}{" "}
          <AmpelSymbol einstufung="rot" className="inline-block h-[1em] w-[1em] align-[-0.125em]" />
        </span>
      ) : (
        `Varroa ${tagUndMonat(varroa.datum)}: ${varroa.auswertung.anzeige}`
      )),
    gewogen && `Gewicht ${kgAnzeige(gewogen.gewichtKg as number)} kg`,
  ].filter(Boolean);

  return { zaehler: zaehler.join(" · "), kurzleiste };
}

// Karten im Verlauf: flach auf der getönten Verlaufsfläche, links ein
// farbiger Streifen nach Art (grün Durchsicht/Königin, grau Maßnahme, honig
// Behandlung). "!" gegen die Wabe-Regel, die Kartenränder durchsichtig macht.
type VerlaufArt = "eintrag" | "massnahme" | "behandlung" | "verfahren" | "wechsel";
const VERLAUF_STREIFEN: Record<VerlaufArt, string> = {
  eintrag: "!border-l-accent",
  massnahme: "!border-l-rand-bedienung",
  behandlung: "!border-l-honig",
  verfahren: "!border-l-honig",
  wechsel: "!border-l-accent",
};
function verlaufKarte(art: VerlaufArt): string {
  return `!shadow-none !border-l-[6px] ${VERLAUF_STREIFEN[art]}`;
}

// "(4,5 l, ≈ 2,8 kg Zucker)"; bei Zuckerwasser in kg ist die Menge der Zucker selbst.
function fuetterungMengeText(eintrag: {
  fuetterungArt: string | null;
  fuetterungMenge: number | null;
  fuetterungEinheit: FuetterungsEinheit | null;
}) {
  if (eintrag.fuetterungMenge === null) return "";
  const liter = eintrag.fuetterungEinheit === "LITER";
  const menge = `${kgAnzeige(eintrag.fuetterungMenge)} ${liter ? "l" : "kg"}`;
  if (!zuckerIstNaeherung(eintrag.fuetterungArt, eintrag.fuetterungEinheit)) return ` (${menge} Zucker)`;
  const zucker = zuckerNaeherungKg(eintrag.fuetterungArt, eintrag.fuetterungMenge, eintrag.fuetterungEinheit);
  return zucker === null ? ` (${menge})` : ` (${menge}, ≈ ${kgAnzeige(zucker)} kg Zucker)`;
}

export default async function VolkDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const aus = await abgeschalteteBereiche();

  const volk = await prisma.volk.findUnique({
    where: { id },
    include: {
      bienenstand: true,
      verkauf: { select: { art: true, datum: true, preis: true, kaeufer: true, updatedAt: true } },
      koenigin: {
        include: {
          belegstelle: { select: { name: true } },
          begattungsStand: { select: { name: true } },
        },
      },
      klimadeckel: { select: { name: true } },
      brutraumZarge: {
        select: {
          id: true,
          name: true,
          wabenmass: { select: { beutensystem: { select: { id: true, name: true } } } },
        },
      },
      honigraumaufsaetze: { orderBy: { aufgesetztAm: "asc" } },
      // Maßnahmen ohne eigenen Eintrag (z.B. von der Stand-Seite oder der
      // Maßnahmen-Übersicht für mehrere Völker angelegt) - stehen als eigene
      // Karten im Verlauf. Zuchtschritte bleiben bei ihrer Zuchtserie.
      massnahmen: {
        where: { stockkartenEintragId: null, zuchtserieId: null, bioVerfahrenId: null },
        orderBy: { createdAt: "desc" },
        select: { id: true, text: true, faelligAm: true, erledigt: true, createdAt: true },
      },
      eintraege: {
        orderBy: [{ datum: "desc" }, { createdAt: "desc" }],
        include: {
          bilder: true,
          massnahmen: { orderBy: { createdAt: "asc" } },
          honigernteAnteile: true,
          aufgesetzteHonigraeume: true,
          geernteteHonigraeume: true,
        },
      },
      behandlungen: {
        orderBy: { behandlung: { datum: "desc" } },
        include: { behandlung: { include: { medikament: true } } },
      },
      // Biotechnische Verfahren mit den Schritten dieses Volkes.
      bioVerfahren: {
        include: {
          verfahren: {
            include: {
              massnahmen: {
                where: { volkId: id },
                select: { bioSchritt: true, erledigt: true, faelligAm: true, text: true },
              },
            },
          },
        },
      },
      // Königinnenwechsel für den Verlauf: wer wurde zugesetzt, wer ging
      // (am selben Tag) - daraus entsteht die Karte "Umgeweiselt".
      koeniginEreignisse: {
        where: { art: { in: ["ZUGESETZT", "ENTNOMMEN", "VERSTORBEN", "VERKAUFT"] } },
        orderBy: { datum: "desc" },
        include: { koenigin: { select: { id: true, kennung: true, jahrgang: true, zeichenFarbe: true } } },
      },
      dokumente: {
        orderBy: { dokument: { datum: "desc" } },
        include: { dokument: { include: { kategorie: { select: { name: true } } } } },
      },
    },
  });

  if (!volk) {
    notFound();
  }

  const beuten = await beutenStammdatenLaden();
  const koeniginFarbe = anzeigeFarbe(volk.koenigin?.jahrgang, volk.koenigin?.zeichenFarbe);

  // Zur Wahl beim Umweiseln: lebende Königinnen außer der eigenen, Reserve
  // zuerst - die kommen am ehesten in Frage.
  const verfuegbareKoeniginnen =
    volk.koenigin && !aus.includes("koeniginnen")
      ? (
          await prisma.koenigin.findMany({
            where: { status: { in: ["RESERVE", "IM_VOLK"] }, NOT: { id: volk.koenigin.id } },
            orderBy: [{ status: "desc" }, { kennung: "asc" }],
            select: {
              id: true,
              kennung: true,
              status: true,
              zeichenFarbe: true,
              zeichenNummer: true,
              volk: { select: { name: true } },
            },
          })
        ).map((koenigin) => ({
          id: koenigin.id,
          text: [
            koenigin.kennung,
            koenigin.status === "RESERVE" ? "Reserve" : `in ${koenigin.volk?.name ?? "einem Volk"}`,
            [koenigin.zeichenFarbe, koenigin.zeichenNummer].filter(Boolean).join(" "),
          ]
            .filter(Boolean)
            .join(" · "),
        }))
      : [];

  // Ziele für "Volk umziehen": alle nicht archivierten Stände außer dem
  // eigenen - an einen archivierten Stand soll nicht umgezogen werden.
  const andereBienenstaende = await prisma.bienenstand.findMany({
    where: { archiviert: false, NOT: { id: volk.bienenstandId } },
    orderBy: { name: "asc" },
    select: { id: true, name: true, standtyp: true },
  });

  // Völker dieses Stands für die Auswahl im Eintrag-/Maßnahmen-Popup - in
  // derselben Reihenfolge wie auf der Stand-Seite. Das Volk selbst steht
  // auch dann drin, wenn es archiviert ist.
  const [standVoelkerRoh, eintragAnzahl, massnahmenAnzahl, letzteWabenzahlen, letzteBewertungen, offeneMassnahmenRoh] = await Promise.all([
    prisma.volk.findMany({
      where: { bienenstandId: volk.bienenstandId, OR: [{ archiviert: false }, { id: volk.id }] },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        name: true,
        standReihenfolge: true,
        brutraumZarge: { select: { wabenmass: { select: { beutensystemId: true } } } },
        koenigin: { select: { jahrgang: true, zeichenFarbe: true } },
      },
    }),
    // Steigen mit jedem Speichern im Popup - der Dialog startet dann frisch.
    prisma.stockkartenEintrag.count({ where: { volk: { bienenstandId: volk.bienenstandId } } }),
    prisma.massnahme.count({ where: { volk: { bienenstandId: volk.bienenstandId } } }),
    letzteWabenzahlenLaden(volk.bienenstandId),
    letzteBewertungenLaden(volk.bienenstandId),
    // Alle offenen Maßnahmen des Volkes für die Karte oben - egal ob lose, aus
    // einer Durchsicht oder Schritt einer Zuchtserie. Ohne Termin zuletzt.
    prisma.massnahme.findMany({
      where: { ...SICHTBARE_MASSNAHMEN, volkId: volk.id, erledigt: false },
      orderBy: [{ faelligAm: { sort: "asc", nulls: "last" } }, { createdAt: "asc" }],
      select: {
        id: true,
        text: true,
        faelligAm: true,
        erledigt: true,
        zuchtserieId: true,
        bioVerfahrenId: true,
        bioSchritt: true,
        createdAt: true,
        bioVerfahren: { select: { art: true, verbleib: true, fangwabe: true, bannwabeVariante: true } },
      },
    }),
  ]);
  // Andere Völker derselben Sammelmaßnahme (gleicher Text, Termin und
  // Anlegezeit, lib/massnahmen-gruppen.ts) für den Hinweis beim Bearbeiten.
  const loseOffene = offeneMassnahmenRoh.filter((massnahme) => !massnahme.zuchtserieId && !massnahme.bioVerfahrenId);
  const geschwister =
    loseOffene.length === 0
      ? []
      : await prisma.massnahme.findMany({
          where: {
            volkId: { not: volk.id },
            zuchtserieId: null,
            bioVerfahrenId: null,
            text: { in: loseOffene.map((massnahme) => massnahme.text) },
          },
          select: { text: true, faelligAm: true, createdAt: true, volk: { select: { name: true } } },
        });
  const sammelNachbarn = (massnahme: (typeof offeneMassnahmenRoh)[number]) =>
    massnahme.zuchtserieId || massnahme.bioVerfahrenId
      ? []
      : geschwister
          .filter((andere) =>
            gleicherRutsch(
              { ...andere, zuchtserie: null },
              { text: massnahme.text, faelligAm: massnahme.faelligAm, createdAt: massnahme.createdAt, zuchtserie: null }
            )
          )
          .map((andere) => andere.volk.name)
          .sort(new Intl.Collator("de", { numeric: true }).compare);
  // Von einer Zuchtserie nur der nächste Schritt, ohne Königinnen gar keiner.
  // Verfahrensschritte nur mit dem nächsten Termin; ein Medikamenten-Schritt
  // bekommt den Weg ins Behandlungsformular mit.
  const offeneMassnahmen = massnahmenBuendeln(
    offeneMassnahmenRoh.filter(
      (massnahme) =>
        !(aus.includes("koeniginnen") && massnahme.zuchtserieId) &&
        !(aus.includes("behandlungen") && massnahme.bioVerfahrenId)
    )
  ).map((massnahme) => {
    const schritt =
      massnahme.bioVerfahren &&
      verfahrenSchritte(massnahme.bioVerfahren.art, massnahme.bioVerfahren).find(
        (eintrag) => eintrag.schluessel === massnahme.bioSchritt
      );
    return {
      ...massnahme,
      auchBei: sammelNachbarn(massnahme),
      link: schritt?.medikament
        ? { href: behandlungLink(massnahme.bioVerfahrenId!, schritt.schluessel, volk.id), text: "Behandlung eintragen" }
        : undefined,
    };
  });
  const wabenBestaende = await wabenbestaendeLaden(standVoelkerRoh.map((standVolk) => standVolk.id));
  const standVoelker = sortiereVoelker(standVoelkerRoh, volk.bienenstand.voelkerSortierung).map((standVolk) => ({
    id: standVolk.id,
    name: standVolk.name,
    systemId: standVolk.brutraumZarge?.wabenmass.beutensystemId ?? null,
    koeniginFarbe: anzeigeFarbe(standVolk.koenigin?.jahrgang, standVolk.koenigin?.zeichenFarbe)?.hex ?? null,
    letzteDurchsicht: letzteWabenzahlen.get(standVolk.id) ?? null,
    letzteBewertungen: letzteBewertungen.get(standVolk.id) ?? null,
    wabenBestand: wabenBestaende.get(standVolk.id) ?? null,
  }));

  // Honigräume, die gerade auf dem Volk sitzen - beim neuen Eintrag stehen sie
  // zum Abhaken bereit.
  const offeneAufsaetze = volk.honigraumaufsaetze
    .filter((aufsatz) => aufsatz.geerntetAm === null)
    .map((aufsatz) => ({
      id: aufsatz.id,
      bezeichnung: aufsatz.bezeichnung,
      honigProZargeKg: aufsatz.honigProZargeKg,
      wabenbeschaffenheit: aufsatz.wabenbeschaffenheit,
      aufgesetztAm: aufsatz.aufgesetztAm,
    }));

  // Nur Einträge mit tatsächlich dokumentiertem Gewicht, chronologisch für
  // das Diagramm (volk.eintraege ist nach Datum absteigend sortiert).
  const gewichtsVerlauf = volk.eintraege
    .filter((eintrag) => eintrag.gewichtKg !== null)
    .reverse()
    .map((eintrag) => ({ datum: eintrag.datum.toISOString(), gewichtKg: eintrag.gewichtKg as number }));

  // Einträge, lose Maßnahmen und Behandlungen gemeinsam, neueste zuerst -
  // eine Maßnahme steht dort, wo sie angelegt wurde, eine Behandlung an
  // ihrem Anwendungstag. Stornierte Behandlungen bleiben draußen, sie stehen
  // (durchgestrichen) nur im Nachweis unter Behandlungen.
  const heute = new Date();
  const verlauf = [
    ...volk.eintraege.map((eintrag) => ({ art: "eintrag" as const, datum: eintrag.datum, eintrag })),
    ...volk.massnahmen.map((massnahme) => ({ art: "massnahme" as const, datum: massnahme.createdAt, massnahme })),
    ...(aus.includes("behandlungen") ? [] : volk.behandlungen)
      .filter(({ behandlung }) => !behandlung.storniertAm)
      .map(({ behandlung }) => ({ art: "behandlung" as const, datum: behandlung.datum, behandlung })),
    ...(aus.includes("behandlungen") ? [] : volk.bioVerfahren).map(({ verfahren }) => ({
      art: "verfahren" as const,
      datum: verfahren.beginn,
      verfahren,
    })),
    ...(aus.includes("koeniginnen") ? [] : koeniginWechsel(volk.koeniginEreignisse)).map((wechsel) => ({
      art: "wechsel" as const,
      datum: wechsel.datum,
      wechsel,
    })),
  ].sort((a, b) => b.datum.getTime() - a.datum.getTime());

  // Wer hat Durchsichten und Maßnahmen angelegt (Historie)? Nur sobald es
  // Helfer gibt - allein wäre "von Frank" an jeder Karte nur Ballast.
  const [eintragVon, massnahmeVon] = (await helferVorhanden())
    ? await Promise.all([
        erstellerNamen("stockkartenEintrag", volk.eintraege.map((eintrag) => eintrag.id)),
        erstellerNamen("massnahme", volk.massnahmen.map((massnahme) => massnahme.id)),
      ])
    : [new Map<string, string>(), new Map<string, string>()];

  // Verlauf nach Saison (Kalenderjahr) gegliedert, neueste zuerst. Nur die
  // jüngste Saison steht offen - nach ein paar Jahren wäre die Seite sonst
  // zwanzig Bildschirme lang. Bilder zugeklappter Saisons lädt der Browser
  // erst beim Aufklappen (loading="lazy").
  const saisons: { jahr: number; punkte: typeof verlauf }[] = [];
  for (const punkt of verlauf) {
    const jahr = punkt.datum.getFullYear();
    const vorige = saisons.at(-1);
    if (vorige?.jahr === jahr) vorige.punkte.push(punkt);
    else saisons.push({ jahr, punkte: [punkt] });
  }

  // Für die zugeklappte Karte "Offene Maßnahmen": was drängt?
  const dringend = { ueberfaellig: 0, heute: 0 };
  for (const massnahme of offeneMassnahmen) {
    const faelligkeit = faelligkeitBestimmen(massnahme.faelligAm, heute);
    if (faelligkeit === "ueberfaellig") dringend.ueberfaellig += 1;
    if (faelligkeit === "heute") dringend.heute += 1;
  }

  const statusAendernFuerVolk = volkStatusAendern.bind(null, volk.id);
  const umziehenFuerVolk = volkUmziehen.bind(null, volk.id);

  const rasseUndBrutraum = [
    volk.rasse,
    volk.brutraumZarge &&
      brutraumBezeichnung({
        systemName: volk.brutraumZarge.wabenmass.beutensystem.name,
        name: volk.brutraumZarge.name,
        zargenAnzahl: volk.brutraumZargenAnzahl,
      }),
    // Nur Klimadeckel nennen - der Standarddeckel ist der Normalfall.
    volk.klimadeckel &&
      (/klimadeckel/i.test(volk.klimadeckel.name) ? volk.klimadeckel.name : `Klimadeckel ${volk.klimadeckel.name}`),
  ]
    .filter(Boolean)
    .join(" · ");

  const statusInfo = statusPlakette(volk.status);
  // volk.eintraege ist nach Datum absteigend sortiert - die erste
  // Fütterer-Aktion ist die aktuelle.
  const fuettererAuf = volk.eintraege.find((eintrag) => eintrag.fuettererAktion)?.fuettererAktion === "AUFGESETZT";

  // Die Königin steht bewusst als eigene Zeile mit ihrer Zeichenfarbe da -
  // sie ist beim Durchsehen am Stand die wichtigste Angabe.
  const koeniginZeileInhalt = (
    <div className="text-sm">
      {volk.koenigin ? (
        <div className="flex items-center gap-2 rounded-lg border border-border bg-background py-1.5 pl-1.5 pr-1.5">
          <Link
            href={`/koeniginnen/${volk.koenigin.id}`}
            className="flex min-w-0 flex-1 items-center gap-2.5 rounded-md py-0.5 pl-1.5 pr-1 hover:text-accent"
          >
            {koeniginFarbe && (
              <span
                className="h-6 w-6 shrink-0 rounded-full border border-rand-bedienung"
                style={{ background: koeniginFarbe.hex }}
                aria-hidden="true"
              />
            )}
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="flex items-center gap-1">
                <span className="font-semibold">{volk.koenigin.kennung}</span>
                {volk.koenigin.stern && <KoeniginStern className="h-6 w-6" />}
              </span>
              <span className="text-muted">{koeniginZeile(volk.koenigin)}</span>
            </span>
            <span className="text-muted" aria-hidden="true">›</span>
          </Link>
          <KoeniginUmweiselnDialog
            key={volk.koenigin.id}
            alteKennung={volk.koenigin.kennung}
            verfuegbare={verfuegbareKoeniginnen}
            action={koeniginUmweiseln.bind(null, volk.id)}
          />
        </div>
      ) : (
        <Link
          href={`/koeniginnen/neu?volk=${volk.id}`}
          className="inline-flex items-center gap-1.5 rounded-lg border border-dashed border-border px-3 py-2 text-muted hover:border-accent hover:text-accent"
        >
          <IconKrone className="h-4 w-4" /> Königin erfassen
        </Link>
      )}
    </div>
  );

  const eigenerWabenBestand = volk.wabenStandAm ? await wabenbestandLaden(volk.id) : null;
  const honigraeumeUndNotizen = (
    <>
      {eigenerWabenBestand !== null ? (
        <p className="text-sm">
          <span className="text-muted">Waben im Brutraum: </span>
          {eigenerWabenBestand}
        </p>
      ) : (
        !volk.archiviert && (
          <p className="text-sm">
            <span className="text-muted">Waben im Brutraum: </span>
            <Link href={`/voelker/${volk.id}/bearbeiten#waben`} className="font-semibold text-accent hover:underline">
              noch nicht erfasst, jetzt nachtragen
            </Link>
          </p>
        )
      )}
      {offeneAufsaetze.length > 0 && (
        <p className="text-sm">
          <span className="text-muted">Honigräume drauf: </span>
          {gruppiertAufzaehlen(
            offeneAufsaetze.map(
              (aufsatz) => `${aufsatz.bezeichnung} (seit ${kurzesDatum(aufsatz.aufgesetztAm)})`
            )
          )}
        </p>
      )}
      {volk.notizen && <p className="whitespace-pre-wrap text-sm">{volk.notizen}</p>}
    </>
  );

  return (
    <div className="flex flex-col gap-6">
      <SeitenNavigation
        pfad={[{ href: `/bienenstaende/${volk.bienenstandId}`, label: volk.bienenstand.name }]}
        className="-mb-3"
      />

      {/* Kopfkachel: oben Foto links neben Name, Plaketten (Status, QR gelernt,
          Fütterer drauf)
          und Rasse/Beute, darunter die Königin als eigene Zeile, zuunterst eine
          Leiste mit vier gleich breiten Knöpfen. Aufbau auf jedem Gerät gleich,
          volle Inhaltsbreite wie alle Karten der Seite. */}
      <div className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4 shadow-md">
        <div className="flex items-center gap-3">
          <VolkFotoLightbox
            volkId={volk.id}
            dateiname={volk.beuteFotoDateiname}
            zoom={volk.beuteFotoZoom}
            fokusX={volk.beuteFotoFokusX}
            fokusY={volk.beuteFotoFokusY}
            action={volkFotoAktualisieren}
            ausschnittAction={volkFotoAusschnittAktualisieren}
            vorschau
            knopfKlasse="h-24 w-24 sm:h-32 sm:w-32"
          />
          <div className="flex min-w-0 flex-1 flex-col items-start gap-1.5">
            <h1 className="text-2xl font-semibold leading-tight tracking-tight">{volk.name}</h1>
            <div className="flex flex-wrap gap-1.5">
              <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${statusInfo.farbe}`}>
                {statusInfo.label}
              </span>
              {volk.qrCodeWert && !aus.includes("scannen") && (
                <span className="inline-flex items-center gap-1 rounded-full bg-sky-100 px-2.5 py-0.5 text-xs font-semibold text-sky-800 dark:bg-sky-950 dark:text-sky-300">
                  <IconQrCode className="h-3.5 w-3.5" /> QR gelernt
                </span>
              )}
              {fuettererAuf && <FuettererPlakette />}
              {volk.archiviert && (
                <span className="rounded-full bg-background px-2.5 py-0.5 text-xs text-muted">archiviert</span>
              )}
            </div>
            {rasseUndBrutraum && <p className="text-sm text-muted">{rasseUndBrutraum}</p>}
          </div>
        </div>

        {!aus.includes("koeniginnen") && koeniginZeileInhalt}
        {honigraeumeUndNotizen}

        <div className="grid grid-flow-col auto-cols-fr gap-1.5">
          <Link href={`/voelker/${volk.id}/bearbeiten`} className={AKTION_KACHEL}>
            <IconBearbeiten className={AKTION_SYMBOL} />
            Bearbeiten
          </Link>
          <VolkUmzugDialog
            key={volk.eintraege.length}
            bienenstaende={andereBienenstaende}
            action={umziehenFuerVolk}
          />
          {!aus.includes("scannen") && <VolkQrCode volkId={volk.id} wert={volk.qrCodeWert} />}
          <VolkStatusDialog
            key={`${volk.status}-${volk.verkauf?.updatedAt.getTime() ?? ""}`}
            status={volk.status}
            optionen={STATUS_OPTIONEN}
            action={statusAendernFuerVolk}
            verkauf={
              volk.verkauf
                ? {
                    art: volk.verkauf.art === "ABLEGER" ? "ABLEGER" : "VOLK",
                    datum: datumAlsInputWert(volk.verkauf.datum),
                    preis: volk.verkauf.preis,
                    kaeufer: volk.verkauf.kaeufer ?? "",
                  }
                : null
            }
          />
        </div>
      </div>

      {/* Nur sichtbar, wenn schon mindestens eine Gewichtsmessung über die
          Stockkarte dokumentiert wurde - ohne Messwerte gäbe es nichts
          anzuzeigen. Das Diagramm selbst bleibt zu, bis das Gewicht
          angetippt wird (siehe GewichtVerlauf). */}
      <GewichtVerlauf verlauf={gewichtsVerlauf} />

      {/* Dieselben zwei Knöpfe wie auf der Stand-Seite, aber fest für dieses
          Volk: das Popup öffnet gleich mit dem Formular, ohne Völker-Auswahl
          (die gibt es nur am Stand). */}
      <StandSammelAktionen
        aus={aus}
        bienenstandId={volk.bienenstandId}
        voelker={standVoelker}
        honigraeume={beuten.honigraeume}
        wabenmasse={beuten.wabenmasse}
        jetzt={jetztAlsInputWert()}
        eintragKey={eintragAnzahl}
        massnahmeKey={massnahmenAnzahl}
        einzelVolk={{
          id: volk.id,
          koeniginKennung: aus.includes("koeniginnen") ? null : (volk.koenigin?.kennung ?? null),
          offeneAufsaetze,
          fuettererAuf,
        }}
      />

      {/* Offene Maßnahmen direkt unter den Knöpfen, damit man sie bei der
          Durchsicht am Volk gleich abhaken kann, ohne in den alten Eintrag
          oder die Maßnahmen-Seite zu wechseln. Kompakt nur mit Haken -
          Bearbeiten und Löschen gibt es im Verlauf und unter Maßnahmen,
          abgehakt wird nur hier.
          Abgehakte verschwinden, die Rückgängig-Leiste holt sie zurück. Bei
          einer Maßnahme für mehrere Völker gilt der Haken nur für dieses Volk.
          Ab drei Maßnahmen zugeklappt (Franks Wunsch), die Kopfzeile nennt
          dann, was überfällig oder heute fällig ist. */}
      {offeneMassnahmen.length > 0 &&
        (offeneMassnahmen.length <= 2 ? (
          <Card>
            <h2 className="mb-3 text-lg font-semibold">
              Offene Maßnahmen{" "}
                  <span className="ml-1 inline-flex h-6 min-w-6 items-center justify-center rounded-full bg-accent px-2 align-middle text-sm font-bold text-accent-foreground">
                    {offeneMassnahmen.length}
                  </span>
            </h2>
            <MassnahmenListe volkId={volk.id} massnahmen={offeneMassnahmen} heute={heute} kompakt />
          </Card>
        ) : (
          <details className="group rounded-xl border border-border bg-card shadow-md">
            <summary className="flex min-h-11 cursor-pointer list-none items-start justify-between gap-3 px-5 py-4 [&::-webkit-details-marker]:hidden">
              <span className="flex min-w-0 flex-col gap-0.5">
                <span className="text-lg font-semibold">
                  Offene Maßnahmen{" "}
                  <span className="ml-1 inline-flex h-6 min-w-6 items-center justify-center rounded-full bg-accent px-2 align-middle text-sm font-bold text-accent-foreground">
                    {offeneMassnahmen.length}
                  </span>
                </span>
                {(dringend.ueberfaellig > 0 || dringend.heute > 0) && (
                  <span className="text-sm">
                    {dringend.ueberfaellig > 0 && (
                      <span className={`font-medium ${AMPEL_TEXT.gefahr}`}>{dringend.ueberfaellig} überfällig</span>
                    )}
                    {dringend.ueberfaellig > 0 && dringend.heute > 0 && <span className="text-muted"> · </span>}
                    {dringend.heute > 0 && (
                      <span className={`font-medium ${AMPEL_TEXT.warnung}`}>{dringend.heute} heute fällig</span>
                    )}
                  </span>
                )}
              </span>
              <span className="mt-1 shrink-0 text-muted transition-transform group-open:rotate-180" aria-hidden="true">▾</span>
            </summary>
            <div className="px-5 pb-5">
              <MassnahmenListe volkId={volk.id} massnahmen={offeneMassnahmen} heute={heute} kompakt />
            </div>
          </details>
        ))}

      {/* Nur sichtbar, wenn tatsächlich Dokumente mit diesem Volk verknüpft
          sind - sonst würde jedes Volk eine leere Karte zeigen. Hochgeladen
          wird über /dokumente bzw. die Bienenstand-Seite, nicht hier. */}
      {!aus.includes("dokumente") && volk.dokumente.length > 0 && (
        <Card>
          <h2 className="mb-3 text-lg font-semibold">Dokumente</h2>
          <DokumenteMiniListe
            dokumente={volk.dokumente.map((eintrag) => ({
              id: eintrag.dokument.id,
              kategorieName: eintrag.dokument.kategorie.name,
              titel: eintrag.dokument.titel,
              datum: eintrag.dokument.datum,
              dateiname: eintrag.dokument.dateiname,
              mimeType: eintrag.dokument.mimeType,
              groesse: eintrag.dokument.groesse,
              loeschenAction: dokumentLoeschen.bind(null, eintrag.dokument.id),
            }))}
          />
        </Card>
      )}

      {/* Der Verlauf liegt auf einer eigenen getönten Fläche (am Handy über
          die volle Breite), damit er sich vom Volk-Kopf darüber abhebt. */}
      <section className="-mx-4 mt-2 flex flex-col gap-4 bg-flaeche px-4 py-5 sm:mx-0 sm:rounded-2xl sm:px-5">
        <h2 className="flex items-center gap-2.5 text-2xl font-bold">
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-accent text-accent-foreground">
            <IconVerlauf className="h-5 w-5" />
          </span>
          Verlauf
        </h2>
        <WartendeEingaben volkId={volk.id} />
        {verlauf.length === 0 ? (
          <Card className="flex flex-col items-center gap-3 text-center">
            <p className="text-muted">Noch keine Durchsicht.</p>
            <ErsteDurchsichtKnopf />
          </Card>
        ) : (
          saisons.map((saison, index) => {
          const ueberblick = saisonUeberblick(
            saison.punkte.flatMap((punkt) => (punkt.art === "eintrag" ? [punkt.eintrag] : [])),
            saison.punkte.filter((punkt) => punkt.art === "massnahme").length,
            saison.punkte.filter((punkt) => punkt.art === "behandlung" || punkt.art === "verfahren").length,
            saison.punkte.filter((punkt) => punkt.art === "wechsel").length
          );
          return (
          <details key={saison.jahr} open={index === 0} className="group">
            <summary className="flex min-h-11 cursor-pointer list-none items-start justify-between gap-3 rounded-xl border border-rand-ruhig bg-card px-4 py-3 [&::-webkit-details-marker]:hidden">
              <span className="flex min-w-0 flex-col gap-0.5">
                <span className="font-semibold">
                  Saison {saison.jahr} <span className="font-normal text-muted">· {ueberblick.zaehler}</span>
                </span>
                {ueberblick.kurzleiste.length > 0 && (
                  <span className="text-sm text-muted">
                    {/* Umbrochen wird nur zwischen den Angaben, nie mitten darin. */}
                    {ueberblick.kurzleiste.flatMap((teil, i) => {
                      const angabe = (
                        <span key={i} className="whitespace-nowrap">
                          {teil}
                        </span>
                      );
                      return i === 0 ? [angabe] : [" · ", angabe];
                    })}
                  </span>
                )}
              </span>
              <span className="shrink-0 text-muted transition-transform group-open:rotate-180" aria-hidden="true">▾</span>
            </summary>
          <div className="mt-4 flex flex-col gap-4">
          {saison.punkte.map((punkt) => {
            if (punkt.art === "massnahme") {
              return (
                <Card key={`massnahme-${punkt.massnahme.id}`} className={verlaufKarte("massnahme")}>
                  <MassnahmeImVerlauf
                    massnahme={punkt.massnahme}
                    datum={new Intl.DateTimeFormat("de-DE", { dateStyle: "medium", timeStyle: "short" }).format(punkt.datum)}
                    heute={heute}
                    von={massnahmeVon.get(punkt.massnahme.id)}
                  />
                </Card>
              );
            }
            if (punkt.art === "wechsel") {
              const { neu, alt, notiz } = punkt.wechsel;
              return (
                <Card key={`wechsel-${punkt.wechsel.id}`} className={verlaufKarte("wechsel")}>
                  <div className="mb-2 flex items-center justify-between gap-3">
                    <p className="font-semibold">{datumAnzeige(punkt.datum)}</p>
                    <span className="rounded-full bg-background px-2 py-0.5 text-xs text-muted">Königin</span>
                  </div>
                  <p className="mb-2 font-semibold">{alt ? "Umgeweiselt" : "Königin zugesetzt"}</p>
                  <div className="flex flex-wrap items-center gap-2 text-sm">
                    {alt && (
                      <>
                        <KoeniginPille koenigin={alt.koenigin} alt />
                        <span aria-hidden="true">→</span>
                      </>
                    )}
                    <KoeniginPille koenigin={neu} />
                  </div>
                  {(alt || notiz) && (
                    <p className="mt-2 text-sm text-muted">
                      {[alt && `${alt.koenigin.kennung} ${alt.verbleib}`, notiz].filter(Boolean).join(" · ")}
                    </p>
                  )}
                </Card>
              );
            }
            if (punkt.art === "verfahren") {
              const verfahren = punkt.verfahren;
              const schritte = verfahrenSchritte(verfahren.art, verfahren);
              const fortschritt = verfahrenFortschritt(
                schritte,
                verfahren.massnahmen.map((massnahme) => ({ schluessel: massnahme.bioSchritt ?? "", erledigt: massnahme.erledigt }))
              );
              const naechster = verfahren.massnahmen
                .filter((massnahme) => !massnahme.erledigt && massnahme.faelligAm)
                .sort((a, b) => a.faelligAm!.getTime() - b.faelligAm!.getTime())[0];
              const angaben = [
                "Ohne Medikament",
                verfahren.brutwaben !== null && `${verfahren.brutwaben} Brutwaben`,
                verfahren.verbleib && (VERBLEIB_LABEL[verfahren.verbleib] ?? verfahren.verbleib),
                verfahren.fangwabe && "mit Fangwabe",
                verfahren.art === "BANNWABE" && BANNWABE_VARIANTE_LABEL[bannwabeVariante(verfahren.bannwabeVariante)],
                verfahren.kaefig,
              ].filter(Boolean);
              return (
                <Card key={`verfahren-${verfahren.id}`} className={verlaufKarte("verfahren")}>
                  <div className="mb-2 flex items-center justify-between gap-3">
                    <p className="font-semibold">{datumAnzeige(verfahren.beginn)}</p>
                    <span
                      className={`rounded-full border px-2 py-0.5 text-xs ${
                        fortschritt.abgeschlossen ? "border-transparent bg-background text-muted" : "border-ok-rand bg-ok-flaeche text-ok"
                      }`}
                    >
                      {fortschritt.abgeschlossen ? "Behandlung" : "läuft"}
                    </span>
                  </div>
                  <p className="font-medium">{verfahrenTitel(verfahren.art, verfahren.bezeichnung)}</p>
                  <p className="mt-0.5 text-sm text-muted">
                    {fortschritt.gesamt > 1 &&
                      (fortschritt.abgeschlossen
                        ? "Abgeschlossen · "
                        : `Schritt ${Math.min(fortschritt.erledigt + 1, fortschritt.gesamt)} von ${fortschritt.gesamt} · `)}
                    {angaben.join(" · ")}
                  </p>
                  {fortschritt.gesamt > 1 && !fortschritt.abgeschlossen && (
                    <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-border" aria-hidden="true">
                      <div
                        className="h-full rounded-full bg-ok"
                        style={{ width: `${Math.round((fortschritt.erledigt / fortschritt.gesamt) * 100)}%` }}
                      />
                    </div>
                  )}
                  {naechster && (
                    <p className="mt-2 text-sm">
                      Als Nächstes: {naechster.text.replace(/^[^:]*: /, "")} · {datumAnzeige(naechster.faelligAm!)}
                    </p>
                  )}
                  {verfahren.bemerkung && <p className="mt-1 text-sm">{verfahren.bemerkung}</p>}
                  <p className="mt-2 text-xs text-muted">
                    <Link href={`/behandlungen/verfahren/${verfahren.id}`} className="text-accent hover:underline">
                      Fahrplan und Details
                    </Link>
                  </p>
                </Card>
              );
            }
            if (punkt.art === "behandlung") {
              const behandlung = punkt.behandlung;
              return (
                <Card key={`behandlung-${behandlung.id}`} className={verlaufKarte("behandlung")}>
                  <div className="mb-2 flex items-center justify-between gap-3">
                    <p className="font-semibold">{datumAnzeige(behandlung.datum)}</p>
                    <span className="rounded-full bg-background px-2 py-0.5 text-xs text-muted">Behandlung</span>
                  </div>
                  <p className="font-medium">
                    {behandlung.medikament.name}{" "}
                    <span className="font-normal text-muted">· gegen {behandlung.indikation}</span>
                  </p>
                  <p className="mt-0.5 text-sm text-muted">
                    {mengeAnzeige(behandlung.mengeJeVolk, behandlung.medikament.einheit)} ·{" "}
                    {dauerAnzeige(behandlung.datum, behandlung.endeDatum)} · Wartezeit {behandlung.wartezeitTage} Tage
                  </p>
                  {behandlung.bemerkung && <p className="mt-1 text-sm">{behandlung.bemerkung}</p>}
                  <p className="mt-2 text-xs text-muted">
                    Vollständiger Nachweis unter{" "}
                    <Link href="/behandlungen" className="text-accent hover:underline">
                      Behandlungen
                    </Link>
                    .
                  </p>
                </Card>
              );
            }
            const eintrag = punkt.eintrag;
            const datumKurz = new Intl.DateTimeFormat("de-DE", { dateStyle: "medium" }).format(eintrag.datum);
            // Nur Angaben zeigen, die wirklich gemacht wurden: ältere Einträge
            // haben nicht angefasste Felder als "nein"/0 gespeichert.
            const bewertungen = BEURTEILUNGS_KRITERIEN.flatMap((kriterium) => {
              const wert = eintrag[kriterium.feld];
              return kriterium.feld === "gesamteindruck" || wert === null ? [] : [{ kriterium, wert }];
            });
            const brutbild = [
              eintrag.stifteGesehen && "Stifte",
              eintrag.larvenGesehen && "Larven",
              eintrag.verdeckelteBrutGesehen && "Verdeckelte Brut",
              eintrag.weiselzellenGesehen && "Weiselzellen",
              eintrag.drohnenbruetig && "drohnenbrütig",
            ]
              .filter(Boolean)
              .join(", ");
            const varroaGezaehlt = !!eintrag.varroaZaehlweise || eintrag.varroaAnzahl !== null;
            const varroa = varroaAuswerten({
              zaehlweise: eintrag.varroaZaehlweise,
              anzahl: eintrag.varroaAnzahl,
              gemuellTage: eintrag.varroaGemuellTage,
              bienenprobeGramm: eintrag.varroaBienenprobeGramm,
              datum: eintrag.datum,
            });
            // Gezählte Milben und Zählweise - beim Befallsgrad als Zusatz.
            const varroaZaehlung = [
              eintrag.varroaAnzahl !== null && `${eintrag.varroaAnzahl} Milben`,
              eintrag.varroaZaehlweise && VARROA_ZAEHLWEISE_LABEL[eintrag.varroaZaehlweise],
            ]
              .filter(Boolean)
              .join(" · ");
            const wabenText = wabenAenderungText(eintrag);
            const honigGeerntet = eintrag.honigGeerntet || eintrag.honigertragKg !== null || !!eintrag.honigart;
            // Übrige Angaben als kompakte Chips: Bezeichnung grau, Wert normal,
            // Zusatz grau dahinter.
            const angaben = [
              eintrag.koeniginGesehen && { schluessel: "koenigin", bezeichnung: "Königin", wert: "gesehen" },
              brutbild && { schluessel: "brut", bezeichnung: "Brut", wert: brutbild },
              !!eintrag.volksstaerke && {
                schluessel: "gassen",
                bezeichnung: "Besetzte Wabengassen",
                wert: String(eintrag.volksstaerke),
              },
              !!eintrag.bebrueteteWaben && {
                schluessel: "bebruetet",
                bezeichnung: "Bebrütet",
                wert: anzahlText(eintrag.bebrueteteWaben, "Wabe", "Waben"),
              },
              wabenText.gegeben && {
                schluessel: "waben-gegeben",
                bezeichnung: "Waben gegeben",
                wert: wabenText.gegeben,
              },
              wabenText.entnommen && {
                schluessel: "waben-entnommen",
                bezeichnung: "Waben entnommen",
                wert: wabenText.entnommen,
              },
              eintrag.gewichtKg !== null && {
                schluessel: "gewicht",
                bezeichnung: "Gewicht",
                wert: `${kgAnzeige(eintrag.gewichtKg)} kg`,
                zusatz: eintrag.wiegemethode ? WIEGEMETHODE_LABEL[eintrag.wiegemethode] : undefined,
              },
              eintrag.fuetterungArt && {
                schluessel: "fuetterung",
                bezeichnung: "Fütterung",
                wert:
                  (FUETTERUNGS_ART_LABEL[eintrag.fuetterungArt] ?? eintrag.fuetterungArt) + fuetterungMengeText(eintrag),
              },
              eintrag.fuettererAktion && {
                schluessel: "fuetterer",
                bezeichnung: "Fütterer",
                wert: FUETTERER_AKTION_LABEL[eintrag.fuettererAktion as FuettererAktion] ?? eintrag.fuettererAktion,
              },
              eintrag.aufgesetzteHonigraeume.length > 0 && {
                schluessel: "honigraum",
                bezeichnung: "Honigraum aufgesetzt",
                wert: gruppiertAufzaehlen(
                  eintrag.aufgesetzteHonigraeume.map(
                    (aufsatz) =>
                      aufsatz.bezeichnung +
                      (aufsatz.wabenbeschaffenheit ? ` (${WABENBESCHAFFENHEIT_LABEL[aufsatz.wabenbeschaffenheit]})` : "")
                  )
                ),
              },
              honigGeerntet && {
                schluessel: "honigernte",
                bezeichnung: "Honigernte",
                wert:
                  [
                    eintrag.honigRaehmchenAnzahl !== null && `${eintrag.honigRaehmchenAnzahl} Rähmchen`,
                    eintrag.honigertragKg !== null && `${kgAnzeige(eintrag.honigertragKg)} kg`,
                    eintrag.honigart,
                  ]
                    .filter(Boolean)
                    .join(" · ") || "ja",
                zusatz:
                  [
                    eintrag.honigernteAnteile.length > 0 &&
                      gruppiertAufzaehlen(
                        eintrag.honigernteAnteile.flatMap((anteil) =>
                          Array.from(
                            { length: anteil.anzahl },
                            () => `${anteil.bezeichnung}${anteil.istZarge ? "" : " (Waben)"}`
                          )
                        )
                      ),
                    eintrag.honigSchaetzungKg !== null &&
                      eintrag.honigertragKg !== null &&
                      eintrag.honigSchaetzungKg !== eintrag.honigertragKg &&
                      `Schätzung war ${kgAnzeige(eintrag.honigSchaetzungKg)} kg`,
                  ]
                    .filter(Boolean)
                    .join("; ") || undefined,
              },
              varroaGezaehlt &&
                !varroa?.schwelleErreicht && {
                  schluessel: "varroa",
                  bezeichnung: "Varroa",
                  wert: varroa?.anzeige ?? varroaZaehlung,
                  zusatz: varroa ? varroaZaehlung || undefined : undefined,
                },
              (eintrag.drohnenbrutGeschnitten || eintrag.biotechnischeMassnahmen) && {
                schluessel: "biotechnik",
                bezeichnung: "Biotechnik",
                wert: [eintrag.drohnenbrutGeschnitten && "Drohnenbrut geschnitten", eintrag.biotechnischeMassnahmen]
                  .filter(Boolean)
                  .join(" · "),
              },
              eintrag.bienenAngeflogen && { schluessel: "angeflogen", wert: "Bienen haben angeflogen" },
            ].filter((angabe) => !!angabe) as { schluessel: string; bezeichnung?: string; wert: string; zusatz?: string }[];
            return (
            <Card key={eintrag.id} className={`${verlaufKarte("eintrag")} scroll-mt-32`} id={`eintrag-${eintrag.id}`}>
                {/* Geöffnet wird nur über "Durchsicht öffnen" oben rechts - die
                    Karte selbst ist kein Link, damit ein Tipp beim Scrollen
                    nicht gleich das Formular öffnet. Die id ist das Sprungziel
                    für "Durchsicht schließen". */}
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 pt-1.5">
                  <p className="font-semibold">
                    {new Intl.DateTimeFormat("de-DE", { dateStyle: "medium", timeStyle: "short" }).format(
                      eintrag.datum
                    )}
                  </p>
                  {eintragVon.get(eintrag.id) && (
                    <span className="text-xs text-muted">von {eintragVon.get(eintrag.id)}</span>
                  )}
                  {eintrag.umzugVonStandName && (
                    <span className="rounded-full bg-accent px-2 py-0.5 text-xs text-accent-foreground">
                      <IconUmzug className="mr-1 inline-block h-[1em] w-[1em] align-[-0.125em]" />
                      Umzug
                    </span>
                  )}
                  </div>
                  <Link
                    href={`/voelker/${volk.id}/eintraege/${eintrag.id}/bearbeiten`}
                    aria-label={`Durchsicht vom ${datumKurz} öffnen`}
                    className={`${knopfKlassen("leise", "mittel")} -mr-2 -mt-1 shrink-0 gap-1 font-semibold !text-accent`}
                  >
                    Durchsicht öffnen
                    <IconWinkelRechts className="h-4 w-4" />
                  </Link>
                </div>

              {eintrag.umzugVonStandName && (
                <p className="mt-2 text-sm">Von Stand „{eintrag.umzugVonStandName}“ hierher umgezogen.</p>
              )}

              {/* Alle Bewertungen als gleich große Strahlen, Gesamteindruck
                  zuerst (am PC in drei Spalten). Sichtbar sind nur
                  Wertungstexte, nie Noten. */}
              {(eintrag.gesamteindruck !== null || bewertungen.length > 0) && (
                <div className="mt-3.5 grid gap-x-8 gap-y-3.5 sm:grid-cols-2 lg:grid-cols-3">
                  {eintrag.gesamteindruck !== null && (
                    <MiniStrahl kriterium={GESAMTEINDRUCK} wert={eintrag.gesamteindruck} />
                  )}
                  {bewertungen.map(({ kriterium, wert }) => (
                    <MiniStrahl key={kriterium.feld} kriterium={kriterium} wert={wert} />
                  ))}
                </div>
              )}

              {(angaben.length > 0 || eintrag.abgeschwaermt || (varroaGezaehlt && varroa?.schwelleErreicht)) && (
                <div className="mt-4 flex flex-wrap gap-1.5 text-[13px]">
                  {angaben.map((angabe) => (
                    <span
                      key={angabe.schluessel}
                      className="inline-flex max-w-full flex-wrap items-baseline gap-x-1.5 rounded-2xl border border-rand-ruhig px-2.5 py-1"
                    >
                      {angabe.bezeichnung && <span className="text-muted">{angabe.bezeichnung}</span>}
                      <span>{angabe.wert}</span>
                      {angabe.zusatz && <span className="text-muted">({angabe.zusatz})</span>}
                    </span>
                  ))}
                  {eintrag.abgeschwaermt && (
                    <span className="inline-flex items-center gap-1.5 rounded-2xl border-2 border-gefahr bg-gefahr-flaeche px-2.5 py-0.5 font-semibold text-gefahr">
                      <AmpelSymbol einstufung="rot" />
                      Abgeschwärmt
                    </span>
                  )}
                  {/* Varroa über der Schadschwelle als roter Hinweis über die
                      ganze Breite statt als Chip. */}
                  {varroaGezaehlt && varroa?.schwelleErreicht && (
                    <p className="flex w-full items-start gap-2 rounded-xl border-2 border-gefahr bg-gefahr-flaeche px-3 py-2 text-sm font-semibold text-gefahr">
                      <AmpelSymbol einstufung="rot" className="mt-0.5 h-4 w-4 shrink-0" />
                      <span>
                        <span className="font-normal">Varroa</span> {varroa.anzeige}. Schadschwelle{" "}
                        {varroa.zeitraum.label}: {varroa.schwelleAnzeige}
                        {varroaZaehlung && <span className="block text-xs font-normal">{varroaZaehlung}</span>}
                      </span>
                    </p>
                  )}
                </div>
              )}

              {(eintrag.massnahmen.length > 0 || eintrag.notizen) && (
                <dl className="mt-3 grid gap-2 text-sm">
                  {eintrag.massnahmen.length > 0 && (
                    <div>
                      <dt className="text-[13px] text-muted">{eintrag.massnahmen.length === 1 ? "Maßnahme" : "Maßnahmen"}</dt>
                      <dd className="flex flex-col gap-0.5">
                        {eintrag.massnahmen.map((massnahme) => (
                          <span
                            key={massnahme.id}
                            className={massnahme.erledigt ? "text-muted line-through" : "font-medium text-accent"}
                          >
                            {massnahme.erledigt ? "✓ " : "○ "}
                            {massnahme.text}
                          </span>
                        ))}
                      </dd>
                    </div>
                  )}
                  {eintrag.notizen && (
                    <div>
                      <dt className="text-[13px] text-muted">Notizen</dt>
                      <dd className="whitespace-pre-wrap">{eintrag.notizen}</dd>
                    </div>
                  )}
                </dl>
              )}
              {eintrag.bilder.length > 0 && (
                <StockkartenBilder
                  titel={`${volk.name}, ${new Intl.DateTimeFormat("de-DE", { dateStyle: "medium" }).format(eintrag.datum)}`}
                  bilder={eintrag.bilder.map((bild, i) => ({
                    id: bild.id,
                    url: `/bilder/${bild.dateiname}`,
                    alt: bild.beschreibung ?? bild.originalDateiname,
                    speichername: stockkartenBildName(volk.name, eintrag.datum, i + 1, bild.dateiname),
                  }))}
                />
              )}
            </Card>
            );
          })}
          </div>
          </details>
          );
          })
        )}
      </section>
    </div>
  );
}
