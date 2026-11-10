import { abgeschalteteBereiche } from "@/lib/bereiche";
import { SICHTBARE_MASSNAHMEN } from "@/lib/massnahmen-sichtbar";
import { lubwLage } from "@/lib/bundeslaender";
import Link from "next/link";
import { Fragment } from "react";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import {
  volkAnlegen,
  volkFotoAktualisieren,
  volkFotoAusschnittAktualisieren,
  bienenstandFotoAktualisieren,
  bienenstandFotoAusschnittAktualisieren,
  bienenstandVoelkerSortierungAktualisieren,
  volkStandPositionVerschieben,
  dokumentLoeschen,
} from "@/lib/actions";
import { Card, LinkKnopf } from "@/components/ui";
import { StandortAnzeige } from "@/components/standort-anzeige";
import { VelutinaStandStatus } from "@/components/velutina-stand-status";
import { GtsKarte } from "@/components/gts-karte";
import { standLage } from "@/lib/velutina";
import { VolkAnlegenDialog } from "@/components/volk-anlegen-dialog";
import { VolkFotoLightbox } from "@/components/volk-foto-lightbox";
import { BienenstandFotoLightbox } from "@/components/bienenstand-foto-lightbox";
import { StandtypBadge } from "@/components/standtyp";
import { DokumenteMiniListe } from "@/components/dokumente-mini-liste";
import { beutenStammdatenLaden } from "@/lib/beuten";
import { klimadeckelAuswahlListe } from "@/lib/lager";
import {
  BEURTEILUNGS_KRITERIEN,
  kriteriumEinstufung,
  type BeurteilungsEinstufung,
  stufeKurz,
  stufeText,
  type LetzteBewertungen,
} from "@/components/stockkarten-eintrag-felder";
import { kgAnzeige, kurzesDatum } from "@/lib/honig";
import { HERKUNFT_LABEL, anzeigeFarbe, type Herkunft } from "@/lib/koeniginnen";
import type { FreieKoenigin } from "@/components/koenigin-wahl-beim-anlegen";
import { KoeniginStern } from "@/components/koenigin-stern";
import { IconQrCode } from "@/components/icons";
import { FuettererPlakette } from "@/components/fuetterer-plakette";
import { GesamteindruckPlakette } from "@/components/gesamteindruck-plakette";
import { massnahmenBuendeln } from "@/lib/massnahmen-buendeln";
import { AMPEL_TEXT } from "@/lib/ampel";
import { FAELLIGKEIT_RAHMEN, faelligkeitBestimmen, type Faelligkeit } from "@/lib/faelligkeit";

/// Reihenfolge, in der die dringendste offene Maßnahme die Farbe der
/// Maßnahmen-Box in der Volkskachel bestimmt.
const DRINGLICHKEIT: Faelligkeit[] = ["ueberfaellig", "heute", "bald", "spaeter", "ohne"];
// Schriftfarbe je Einstufung in der Kachel "Wertung letzte Durchsicht".
const WERTUNG_TEXT: Record<BeurteilungsEinstufung, string> = {
  rot: AMPEL_TEXT.gefahr,
  gelb: AMPEL_TEXT.warnung,
  gruen: AMPEL_TEXT.ok,
};

const MASSNAHMEN_TEXT: Record<Faelligkeit, string> = {
  ueberfaellig: AMPEL_TEXT.gefahr,
  heute: AMPEL_TEXT.warnung,
  bald: "text-foreground",
  spaeter: "text-foreground",
  ohne: "text-foreground",
};
import { StandSammelAktionen } from "@/components/stand-sammel-aktionen";
import { letzteBewertungenLaden, letzteWabenzahlenLaden } from "@/lib/letzte-durchsicht";
import { wabenbestaendeLaden } from "@/lib/wabenbestand";
import { jetztAlsInputWert } from "@/lib/datum";
import { sortiereVoelker } from "@/lib/voelker-sortierung";
import { SeitenNavigation } from "@/components/seiten-navigation";
import { aktuellesDesign } from "@/lib/design";
import type { Design } from "@/lib/design-namen";
import { IconWarnung } from "@/components/icons";

const STATUS_LABEL: Record<string, string> = {
  AKTIV: "aktiv",
  AUFGELOEST: "aufgelöst",
  VERKAUFT: "verkauft",
  VERLOREN: "verloren",
};

type VolkMitLetztemEintrag = {
  id: string;
  name: string;
  rasse: string | null;
  status: string;
  bienenstandId: string;
  createdAt: Date;
  standReihenfolge: number | null;
  qrCodeWert: string | null;
  koenigin: {
    id: string;
    kennung: string;
    jahrgang: number | null;
    zeichenFarbe: string | null;
    zeichenNummer: string | null;
    stern: boolean;
  } | null;
  brutraumZargeId: string | null;
  brutraumZargenAnzahl: number;
  beuteFotoDateiname: string | null;
  beuteFotoZoom: number;
  beuteFotoFokusX: number;
  beuteFotoFokusY: number;
  // Je Kriterium die letzte Durchsicht, die einen Wert hatte (auch ältere).
  letzteBewertungen: LetzteBewertungen | null;
  eintraege: {
    datum: Date;
    gewichtKg: number | null;
    gesamteindruck: number | null;
    volksstaerkeEinschaetzung: number | null;
    futtermengeEinschaetzung: number | null;
    sanftmut: number | null;
    schwarmtrieb: number | null;
    wabensitz: number | null;
    legeleistung: number | null;
    koeniginGesehen: boolean | null;
    stifteGesehen: boolean | null;
    larvenGesehen: boolean | null;
    verdeckelteBrutGesehen: boolean | null;
    weiselzellenGesehen: boolean | null;
    drohnenbruetig: boolean | null;
    abgeschwaermt: boolean | null;
    fuetterungArt: string | null;
    fuettererAktion: string | null;
    varroaAnzahl: number | null;
    varroaZaehlweise: string | null;
    honigGeerntet: boolean | null;
    aufgesetzteHonigraeume: { id: string }[];
  }[];
  massnahmen: { id: string; text: string; faelligAm: Date | null; zuchtserieId: string | null; bioVerfahrenId: string | null }[];
};

// Kurzfassung dessen, was bei der letzten Durchsicht getan und gesehen wurde -
// für die Kachel in der Völkerübersicht. Beurteilung und offene Maßnahmen
// stehen dort schon separat, darum geht es hier nur um Sichtung und Tätigkeit.
function letzteAktivitaet(eintrag: VolkMitLetztemEintrag["eintraege"][number]): string[] {
  const punkte: string[] = [];

  const brutbild = [
    eintrag.stifteGesehen && "Stifte",
    eintrag.larvenGesehen && "Larven",
    eintrag.verdeckelteBrutGesehen && "verdeckelte Brut",
    eintrag.weiselzellenGesehen && "Weiselzellen",
  ].filter(Boolean);
  if (eintrag.gewichtKg != null) punkte.push(`Gewicht ${kgAnzeige(eintrag.gewichtKg)} kg`);
  if (eintrag.koeniginGesehen) punkte.push("Königin gesehen");
  if (brutbild.length > 0) punkte.push(`Brutbild: ${brutbild.join(", ")}`);
  if (eintrag.varroaAnzahl !== null || eintrag.varroaZaehlweise) punkte.push("Varroa kontrolliert");
  if (eintrag.aufgesetzteHonigraeume.length > 0) punkte.push("Honigraum aufgesetzt");
  if (eintrag.honigGeerntet) punkte.push("Honig geerntet");
  if (eintrag.fuetterungArt) punkte.push("gefüttert");
  if (eintrag.fuettererAktion === "AUFGESETZT") punkte.push("Fütterer aufgesetzt");
  if (eintrag.fuettererAktion === "ABGENOMMEN") punkte.push("Fütterer abgenommen");

  return punkte;
}

// Wertungen aus der letzten Durchsicht: alle ausgefüllten Bewertungen mit
// ihrer Einstufung (grün/gelb/rot), dazu Drohnenbrütig und Abgeschwärmt
// (zählen wie Rot).
function wertungenLetzteDurchsicht(eintrag: VolkMitLetztemEintrag["eintraege"][number]) {
  const haken = [
    eintrag.drohnenbruetig && { schluessel: "drohnenbruetig", text: "Drohnenbrütig", einstufung: "rot" as const },
    eintrag.abgeschwaermt && { schluessel: "abgeschwaermt", text: "Abgeschwärmt", einstufung: "rot" as const },
  ].filter((punkt) => !!punkt);
  const bewertungen = BEURTEILUNGS_KRITERIEN.flatMap((kriterium) => {
    const wert = eintrag[kriterium.feld];
    const einstufung = kriteriumEinstufung(kriterium, wert);
    if (einstufung === null || wert === null) return [];
    return [
      {
        schluessel: kriterium.feld,
        text: `${kriterium.label}: ${stufeText(kriterium, wert)}`,
        einstufung,
      },
    ];
  });
  return [...haken, ...bewertungen];
}

// Wortlaut und Farbe einer Bewertung der letzten Durchsicht (für die
// Volkskarten der neuen Designs). `kurz` schreibt halbe Noten als "A–B"
// statt "zwischen A und B", damit der Wert in eine Zeile passt; der
// Langtext steht dann im title.
function bewertung(eintrag: VolkMitLetztemEintrag["eintraege"][number] | undefined, feld: BeurteilungsFeldName) {
  const kriterium = BEURTEILUNGS_KRITERIEN.find((k) => k.feld === feld)!;
  const wert = eintrag?.[feld] ?? null;
  if (wert === null) return null;
  return { text: stufeText(kriterium, wert), kurz: stufeKurz(kriterium, wert), einstufung: kriteriumEinstufung(kriterium, wert) };
}
type BeurteilungsFeldName = (typeof BEURTEILUNGS_KRITERIEN)[number]["feld"];

// Ab so vielen Tagen gilt eine ältere Bewertung als nicht mehr frisch: ihr
// Datum wird grau markiert.
const BEWERTUNG_ALT_TAGE = 21;

// Wie bewertung(), aber mit Rückgriff: fehlt der Wert in der letzten
// Durchsicht (z.B. nur Gewicht oder Notiz erfasst), kommt er aus der
// letzten Durchsicht, die ihn wirklich enthält. `seit` ist dann deren Datum,
// `alt` sagt, ob sie mehr als drei Wochen zurückliegt. Gibt es nie einen
// Wert, kommt null zurück und die Zeile entfällt.
function bewertungMitRueckgriff(volk: VolkMitLetztemEintrag, feld: BeurteilungsFeldName, heute: Date) {
  const eintrag = volk.eintraege[0];
  const aktuell = bewertung(eintrag, feld);
  if (aktuell) return { ...aktuell, seit: null, alt: false };
  const frueher = volk.letzteBewertungen?.[feld];
  if (!frueher) return null;
  const kriterium = BEURTEILUNGS_KRITERIEN.find((k) => k.feld === feld)!;
  return {
    text: `${stufeText(kriterium, frueher.note)} (Durchsicht vom ${kurzesDatum(frueher.datum)})`,
    kurz: stufeKurz(kriterium, frueher.note),
    einstufung: kriteriumEinstufung(kriterium, frueher.note),
    seit: frueher.datum,
    alt: heute.getTime() - frueher.datum.getTime() > BEWERTUNG_ALT_TAGE * 24 * 60 * 60 * 1000,
  };
}
type BewertungMitRueckgriff = NonNullable<ReturnType<typeof bewertungMitRueckgriff>>;

const tagMonat = (d: Date) => d.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit" });

// Kleines Datum hinter einem Wert aus einer früheren Durchsicht. Älter als
// drei Wochen: grau hinterlegt, damit es auffällt.
function SeitDatum({ wert }: { wert: BewertungMitRueckgriff }) {
  if (!wert.seit) return null;
  return (
    <span
      className={`text-xs font-normal whitespace-nowrap text-muted ${wert.alt ? "rounded bg-rand-ruhig/40 px-1" : ""}`}
      title={wert.alt ? `Älter als ${BEWERTUNG_ALT_TAGE / 7} Wochen` : undefined}
    >
      {tagMonat(wert.seit)}
    </span>
  );
}

// Datum der letzten Durchsicht, ggf. mit dem dort erfassten Gewicht.
function durchsichtText(eintrag: VolkMitLetztemEintrag["eintraege"][number] | undefined) {
  if (!eintrag) return "–";
  return eintrag.gewichtKg != null ? `${tagMonat(eintrag.datum)} · ${kgAnzeige(eintrag.gewichtKg)} kg` : tagMonat(eintrag.datum);
}

const STREIFEN: Record<BeurteilungsEinstufung, string> = { gruen: "bg-ok-voll", gelb: "bg-warnung-voll", rot: "bg-gefahr-voll" };

function VerschiebenKnoepfe({ volk, verschieben }: { volk: VolkMitLetztemEintrag; verschieben: { istErste: boolean; istLetzte: boolean } }) {
  const knopf =
    "flex h-10 w-10 items-center justify-center rounded-full border border-rand-ruhig bg-card text-base leading-none hover:bg-accent hover:text-accent-foreground disabled:cursor-not-allowed disabled:opacity-40";
  return (
    <div className="relative z-20 flex gap-1.5">
      <form action={volkStandPositionVerschieben.bind(null, volk.id, "hoch")}>
        <button type="submit" disabled={verschieben.istErste} aria-label={`${volk.name} weiter nach oben`} title="Weiter nach oben" className={knopf}>
          ↑
        </button>
      </form>
      <form action={volkStandPositionVerschieben.bind(null, volk.id, "runter")}>
        <button type="submit" disabled={verschieben.istLetzte} aria-label={`${volk.name} weiter nach unten`} title="Weiter nach unten" className={knopf}>
          ↓
        </button>
      </form>
    </div>
  );
}

// Volk in den neuen Designs: A "Wabe" als Karte, B "Klar" als Tabellenzeile.
function VolkNeu({
  volk,
  aus,
  design,
  gedaempft = false,
  fuettererAuf = false,
  verschieben,
}: {
  volk: VolkMitLetztemEintrag;
  aus: readonly string[];
  design: Exclude<Design, "aktuell">;
  gedaempft?: boolean;
  fuettererAuf?: boolean;
  verschieben?: { istErste: boolean; istLetzte: boolean };
}) {
  const eintrag = volk.eintraege[0];
  const farbe = aus.includes("koeniginnen") ? null : anzeigeFarbe(volk.koenigin?.jahrgang, volk.koenigin?.zeichenFarbe);
  const ohneKoenigin = aus.includes("koeniginnen");
  const heute = new Date();
  const staerke = bewertungMitRueckgriff(volk, "volksstaerkeEinschaetzung", heute);
  const futter = bewertungMitRueckgriff(volk, "futtermengeEinschaetzung", heute);
  const gesamt = bewertung(eintrag, "gesamteindruck");
  const offene = massnahmenBuendeln(volk.massnahmen);
  const naechste = offene[0];
  const naechsteFaellig = naechste ? faelligkeitBestimmen(naechste.faelligAm, heute) : "ohne";
  const ueberfaellig = offene.some((m) => faelligkeitBestimmen(m.faelligAm, heute) === "ueberfaellig");
  const datum = (d: Date | null) => (d ? d.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit" }) : "");
  const naechsteText = naechste
    ? `${naechste.text}${naechste.faelligAm ? ` · ${naechsteFaellig === "ueberfaellig" ? "seit " : ""}${datum(naechste.faelligAm)}` : ""}`
    : null;
  const punkt = farbe && (
    <span
      aria-label={`Königin gezeichnet ${farbe.name}`}
      title={`Königin ${volk.koenigin?.kennung ?? ""}: ${farbe.name}`}
      className={`inline-block shrink-0 rounded-full border border-rand-bedienung ${design === "wabe" ? "h-8 w-8 ring-4 ring-card" : "h-6 w-6"}`}
      style={{ background: farbe.hex }}
    />
  );
  const name = (
    <span className="flex items-center gap-1 font-semibold">
      <span className="truncate">{volk.name}</span>
      {!ohneKoenigin && volk.koenigin?.stern && <KoeniginStern />}
      {volk.qrCodeWert && !aus.includes("scannen") && (
        <span title="QR-Code angelernt" role="img" aria-label="QR-Code angelernt" className="inline-flex shrink-0 text-muted">
          <IconQrCode className="h-4 w-4" />
        </span>
      )}
    </span>
  );
  const unterzeile = [!ohneKoenigin ? volk.koenigin?.kennung : null, volk.rasse, volk.status !== "AKTIV" ? STATUS_LABEL[volk.status] : null]
    .filter(Boolean)
    .join(" · ");
  const link = <Link href={`/voelker/${volk.id}`} aria-label={`Volk ${volk.name} öffnen`} className="absolute inset-0 z-10" />;

  if (design === "wabe") {
    return (
      <div className={`relative flex flex-col gap-3 rounded-xl bg-card p-4 shadow-md ${gedaempft ? "opacity-70" : ""}`}>
        {link}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          {punkt}
          <span className="min-w-0 flex-1 basis-40">
            <h3 className="text-[17px]">{name}</h3>
            {unterzeile && <p className="truncate text-sm text-muted">{unterzeile}</p>}
          </span>
          {eintrag?.gesamteindruck != null && <GesamteindruckPlakette wert={eintrag.gesamteindruck} />}
        </div>
        {/* Name links, Wert rechts, eine Zeile je Wert. Kein Umbruch mitten im
            Wort (die allgemeine Regel aus globals.css bricht sonst z.B.
            "Ausreichen/d"), notfalls am Leerzeichen oder Strich. */}
        <dl className="grid grid-cols-[auto_minmax(0,1fr)] items-baseline gap-x-4 gap-y-1 rounded-lg bg-flaeche px-3 py-2.5 [overflow-wrap:normal]">
          {(
            [
              ["Stärke", staerke],
              ["Futter", futter],
            ] as const
          ).map(
            ([titel, wert]) =>
              wert && (
                <Fragment key={titel}>
                  <dt className="text-sm text-muted">{titel}</dt>
                  <dd title={wert.text} className="flex flex-wrap items-baseline gap-x-2">
                    <span className={`font-semibold ${wert.einstufung && wert.einstufung !== "gruen" ? WERTUNG_TEXT[wert.einstufung] : ""}`}>{wert.kurz}</span>
                    <SeitDatum wert={wert} />
                  </dd>
                </Fragment>
              )
          )}
          <dt className="text-sm text-muted">Durchsicht</dt>
          <dd className="font-semibold">{durchsichtText(eintrag)}</dd>
        </dl>
        {naechsteText && (
          <p className={`flex items-center gap-2 text-sm ${ueberfaellig ? "text-gefahr" : naechsteFaellig === "heute" ? "text-warnung" : ""}`}>
            <span className="min-w-0 flex-1">
              <b className="font-semibold">{naechsteText}</b>
            </span>
            <span
              className={`inline-flex shrink-0 items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold ${
                ueberfaellig ? "bg-gefahr-flaeche text-gefahr" : "bg-flaeche text-muted"
              }`}
            >
              {ueberfaellig && <IconWarnung className="h-3.5 w-3.5" />}
              {offene.length} offen
            </span>
          </p>
        )}
        {(fuettererAuf || verschieben) && (
          <div className="flex items-center justify-between gap-2">
            <span>{fuettererAuf && <FuettererPlakette />}</span>
            {verschieben && <VerschiebenKnoepfe volk={volk} verschieben={verschieben} />}
          </div>
        )}
      </div>
    );
  }

  return (
    <div
      className={`relative grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1.5 border-b border-border py-3 pr-1 pl-4 hover:bg-flaeche md:grid-cols-[auto_minmax(0,1.4fr)_11rem_6.5rem_7rem_6rem_minmax(0,1.6fr)_auto] ${gedaempft ? "opacity-70" : ""}`}
    >
      {link}
      <span className={`absolute top-2.5 bottom-2.5 left-0 w-1 rounded ${gesamt?.einstufung ? STREIFEN[gesamt.einstufung] : "bg-rand-ruhig"}`} />
      <span className="w-6">{punkt}</span>
      <span className="min-w-0">
        {name}
        {(unterzeile || fuettererAuf) && (
          <span className="flex items-center gap-1.5 text-sm text-muted">
            <span className="klar-mono truncate">{unterzeile}</span>
            {fuettererAuf && <FuettererPlakette />}
          </span>
        )}
      </span>
      <span className="text-sm md:order-none">{eintrag?.gesamteindruck != null && <GesamteindruckPlakette wert={eintrag.gesamteindruck} />}</span>
      <span className="col-span-3 flex flex-wrap gap-x-3 pl-9 text-sm md:contents">
        {[staerke, futter].map((wert, i) => (
          // Leer bleibt die Zelle stehen (Spalten am PC), am Handy fällt sie weg.
          <span key={i} title={wert?.text} className="flex flex-wrap items-baseline gap-x-1.5 empty:hidden md:flex-col md:items-start md:pl-0 md:empty:flex">
            {wert && (
              <>
                <span className={wert.einstufung && wert.einstufung !== "gruen" ? WERTUNG_TEXT[wert.einstufung] : ""}>{wert.kurz}</span>
                <SeitDatum wert={wert} />
              </>
            )}
          </span>
        ))}
        {/* Am PC das Gewicht in eine zweite, kleine Zeile, damit die schmale
            Spalte nicht mitten im Wert umbricht. */}
        <span className="klar-mono flex flex-wrap items-baseline gap-x-1.5 md:flex-col md:items-start">
          {eintrag ? (
            <>
              <span>{tagMonat(eintrag.datum)}</span>
              {eintrag.gewichtKg != null && <span className="text-xs text-muted">{kgAnzeige(eintrag.gewichtKg)} kg</span>}
            </>
          ) : (
            "–"
          )}
        </span>
      </span>
      <span className="col-span-3 flex items-center gap-2 pl-9 text-sm md:col-span-1 md:pl-0">
        {offene.length > 0 && (
          <b className={`klar-mono inline-flex h-6 min-w-6 shrink-0 items-center justify-center rounded px-1 text-xs ${ueberfaellig ? "bg-gefahr-voll text-gefahr-voll-text" : "bg-flaeche"}`}>
            {offene.length}
          </b>
        )}
        <span className={`min-w-0 ${ueberfaellig ? "text-gefahr" : naechsteFaellig === "heute" ? "text-warnung" : ""}`}>{naechsteText ?? <span className="text-muted">nichts offen</span>}</span>
      </span>
      <span className="col-span-3 justify-self-end empty:hidden md:col-span-1">{verschieben && <VerschiebenKnoepfe volk={volk} verschieben={verschieben} />}</span>
    </div>
  );
}

function KlarVolkKopf() {
  return (
    <div className="hidden grid-cols-[auto_minmax(0,1.4fr)_11rem_6.5rem_7rem_6rem_minmax(0,1.6fr)_auto] gap-x-3 border-b border-border py-2 pr-1 pl-4 text-xs font-bold tracking-[0.05em] text-muted uppercase md:grid">
      <span className="w-6" />
      <span>Volk · Königin</span>
      <span>Gesamteindruck</span>
      <span>Stärke</span>
      <span>Futter</span>
      <span>Durchsicht</span>
      <span>Offen · nächste Maßnahme</span>
      <span />
    </div>
  );
}

function VolkVorschau({
  volk,
  aus,
  gedaempft = false,
  fuettererAuf = false,
  verschieben,
}: {
  volk: VolkMitLetztemEintrag;
  /// Laut letzter Fütterer-Aktion liegt gerade ein Fütterer auf dem Volk.
  fuettererAuf?: boolean;
  /// Abgeschaltete Bereiche (Einstellungen -> Bereiche).
  aus: readonly string[];
  gedaempft?: boolean;
  // Nur gesetzt, wenn der Stand gerade nach Standposition sortiert wird -
  // blendet die Pfeile zum Umsortieren ein. An den Rändern der Liste fehlt
  // der jeweilige Pfeil (nichts zum Tauschen mehr in die Richtung).
  verschieben?: { istErste: boolean; istLetzte: boolean };
}) {
  const letzterEintrag = volk.eintraege[0];
  const wertungen = letzterEintrag ? wertungenLetzteDurchsicht(letzterEintrag) : [];
  // Stärke und Futter, die in der letzten Durchsicht fehlen, aus einer
  // früheren Durchsicht nachtragen (mit deren Datum).
  const jetzt = new Date();
  const nachgetragen = (["volksstaerkeEinschaetzung", "futtermengeEinschaetzung"] as const).flatMap((feld) => {
    const wert = bewertungMitRueckgriff(volk, feld, jetzt);
    if (!wert?.seit) return [];
    const label = BEURTEILUNGS_KRITERIEN.find((k) => k.feld === feld)!.label;
    return [{ schluessel: feld, label, wert }];
  });
  // Zeichenfarbe der Königin - auf einen Blick erkennbar, welchen Jahrgang
  // das Volk führt, ohne die Kachel zu öffnen.
  const farbe = aus.includes("koeniginnen") ? null : anzeigeFarbe(volk.koenigin?.jahrgang, volk.koenigin?.zeichenFarbe);
  // Schritte einer Zuchtserie als eine Maßnahme (der nächste Schritt).
  const offeneMassnahmen = massnahmenBuendeln(volk.massnahmen);
  // Farbe nach der dringendsten offenen Maßnahme: rot nur, wenn etwas
  // überfällig ist, gelb bei "heute fällig", sonst ruhig - wie in der
  // Maßnahmen-Übersicht.
  const heute = new Date();
  const faelligkeiten = offeneMassnahmen.map((massnahme) => faelligkeitBestimmen(massnahme.faelligAm, heute));
  const dringendste =
    DRINGLICHKEIT.find((stufe) => faelligkeiten.includes(stufe)) ?? "ohne";

  // Status und Gesamteindruck stehen als kleine Marken unter der Kopfzeile,
  // nicht in ihr: in der Kopfzeile teilen sich Farbpunkt, Name, Bearbeiten-
  // Knopf und Vorschaubild schon den Platz, ein weiteres Element daneben
  // ließe am Smartphone kaum noch Breite für den Namen.
  const infoInhalt = (
    <div>
      {(!gedaempft || letzterEintrag?.gesamteindruck != null || fuettererAuf) && (
        <p className="mt-2 flex flex-wrap items-center gap-1.5 text-xs">
          {!gedaempft && (
            <span className="rounded-full bg-background px-2 py-0.5 text-muted">
              {STATUS_LABEL[volk.status] ?? volk.status}
            </span>
          )}
          {letzterEintrag?.gesamteindruck != null && (
            <GesamteindruckPlakette wert={letzterEintrag.gesamteindruck} />
          )}
          {fuettererAuf && <FuettererPlakette />}
        </p>
      )}

      {letzterEintrag && (
        <p className="mt-2 text-xs text-muted">
          <span className="font-medium">{kurzesDatum(letzterEintrag.datum)}:</span>{" "}
          {letzteAktivitaet(letzterEintrag).join(" · ") || "keine Angaben"}
        </p>
      )}

      {(wertungen.length > 0 || nachgetragen.length > 0) && (
        <div className="mt-2 rounded-md border border-border bg-background px-2 py-1 text-xs">
          <p className="font-medium">{wertungen.length > 0 ? "Bewertung letzte Durchsicht" : "Letzte Bewertung"}</p>
          <ul className="mt-0.5 list-inside list-disc">
            {wertungen.map((k) => (
              <li key={k.schluessel} className={WERTUNG_TEXT[k.einstufung]}>
                {k.text}
              </li>
            ))}
            {nachgetragen.map(({ schluessel, label, wert }) => (
              <li key={schluessel} title={wert.text} className={wert.einstufung ? WERTUNG_TEXT[wert.einstufung] : ""}>
                {label}: {wert.kurz} <SeitDatum wert={wert} />
              </li>
            ))}
          </ul>
        </div>
      )}

      {offeneMassnahmen.length > 0 && (
        <div className={`mt-2 rounded-md border px-2 py-1 text-xs ${FAELLIGKEIT_RAHMEN[dringendste]} ${MASSNAHMEN_TEXT[dringendste]}`}>
          <p className="font-medium">
            {offeneMassnahmen.length} {offeneMassnahmen.length === 1 ? "offene Maßnahme" : "offene Maßnahmen"}
          </p>
          <ul className="mt-0.5 list-inside list-disc">
            {offeneMassnahmen.slice(0, 3).map((massnahme) => (
              <li key={massnahme.id} className="truncate">
                {massnahme.text}
                {massnahme.faelligAm && <span className="opacity-75">
                    {" "}
                    ({massnahme.faelligAm.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit" })})
                  </span>}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );

  // Pfeile zum Umsortieren nach Standposition - eigene Zeile über der
  // Kopfzeile, damit sie nirgends auf Knopf oder Vorschaubild landen.
  // `pointer-events-none` auf der Zeile selbst (die Formulare darin schalten
  // es wieder an), damit die Lücken zwischen den Pfeilen weiterhin die
  // Kachel öffnen und nicht ins Leere greifen.
  const verschiebenZeile = verschieben && (
    <div className="pointer-events-none relative z-20 flex justify-end gap-1.5">
      <form action={volkStandPositionVerschieben.bind(null, volk.id, "hoch")} className="pointer-events-auto">
        <button
          type="submit"
          disabled={verschieben.istErste}
          aria-label={`${volk.name} weiter nach oben`}
          title="Weiter nach oben"
          className="flex h-11 w-11 items-center justify-center rounded-full border border-rand-ruhig bg-background text-lg leading-none hover:bg-accent hover:text-accent-foreground disabled:cursor-not-allowed disabled:opacity-40"
        >
          ↑
        </button>
      </form>
      <form action={volkStandPositionVerschieben.bind(null, volk.id, "runter")} className="pointer-events-auto">
        <button
          type="submit"
          disabled={verschieben.istLetzte}
          aria-label={`${volk.name} weiter nach unten`}
          title="Weiter nach unten"
          className="flex h-11 w-11 items-center justify-center rounded-full border border-rand-ruhig bg-background text-lg leading-none hover:bg-accent hover:text-accent-foreground disabled:cursor-not-allowed disabled:opacity-40"
        >
          ↓
        </button>
      </form>
    </div>
  );

  return (
    <div
      className={`relative flex min-h-40 gap-3 sm:min-h-44 rounded-xl border border-border bg-card p-4 shadow-md transition-shadow hover:shadow-lg ${gedaempft ? "opacity-70 hover:opacity-100" : ""}`}
    >
      {/* Deckt die komplette Kachel ab, unabhängig davon, wie viel Text
          gerade angezeigt wird - sonst reagiert nur der Bereich um
          Name/Text auf Antippen, nicht die ganze Kachel. Braucht ein
          eigenes, positives z-index, weil der Textbereich darunter zwar
          optisch "darüber" liegt (spätere Position im normalen Fluss),
          selbst aber nicht anklickbar ist - sonst würden Klicks auf den
          Zeilen hier hängen bleiben, statt beim Link anzukommen. Alles, was
          selbst eine Aufgabe hat (Pfeile, Bearbeiten-Knopf, Vorschaubild),
          liegt darum eine Stufe höher bei z-20. */}
      <Link
        href={`/voelker/${volk.id}`}
        aria-label={`Volk ${volk.name} öffnen`}
        className="absolute inset-0 z-10"
      />
      {/* Textspalte und Vorschaubild liegen nebeneinander, nicht das Bild
          in der Kopfzeile: nur so kann es über die ganze Kachelhöhe laufen
          und behält unten denselben Randabstand wie oben und rechts. */}
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        {verschiebenZeile}
        <div className="flex items-center gap-3">
          <span className="flex min-w-0 flex-1 items-center gap-2">
            {farbe && (
              <span
                aria-label={`Königin gezeichnet ${farbe.name}`}
                title={`Königin ${volk.koenigin?.kennung ?? ""}: ${farbe.name}`}
                className="h-6 w-6 shrink-0 rounded-full border border-rand-bedienung"
                style={{ background: farbe.hex }}
              />
            )}
            <span className="min-w-0">
              <h3 className="flex items-center gap-1 font-semibold">
                <span className="truncate">{volk.name}</span>
                {/* Der Stern gehört zur Königin, die hier nur als Farbpunkt
                    vorkommt - deshalb neben dem Volksnamen. */}
                {!aus.includes("koeniginnen") && volk.koenigin?.stern && <KoeniginStern />}
                {/* Dezenter Hinweis, dass ein QR-Code an der Beute
                    angelernt ist - geändert wird er auf der Stockkarte. */}
                {volk.qrCodeWert && !aus.includes("scannen") && (
                  <span title="QR-Code angelernt" role="img" aria-label="QR-Code angelernt" className="inline-flex shrink-0 text-muted">
                    <IconQrCode className="h-4 w-4" />
                  </span>
                )}
              </h3>
              {volk.rasse && <p className="truncate text-xs text-muted">{volk.rasse}</p>}
            </span>
          </span>
        </div>
        {infoInhalt}
      </div>

      {/* Das Vorschaubild ist selbst der Knopf: Antippen öffnet das Foto
          im Popup (ansehen, austauschen, Ausschnitt anpassen), ohne dafür
          erst auf die Volk-Seite wechseln zu müssen. */}
      <VolkFotoLightbox
        volkId={volk.id}
        dateiname={volk.beuteFotoDateiname}
        zoom={volk.beuteFotoZoom}
        fokusX={volk.beuteFotoFokusX}
        fokusY={volk.beuteFotoFokusY}
        action={volkFotoAktualisieren}
        ausschnittAction={volkFotoAusschnittAktualisieren}
        vorschau
        knopfKlasse="z-20 h-32 w-32 sm:h-36 sm:w-36"
      />
    </div>
  );
}

// Zur Wahl beim Anlegen eines Volks: lebende Königinnen, die in keinem Volk
// sitzen - jüngste zuerst, die kommen am ehesten in Frage.
async function freieKoeniginnenLaden(): Promise<FreieKoenigin[]> {
  const koeniginnen = await prisma.koenigin.findMany({
    where: { status: "RESERVE", volk: null },
    orderBy: [{ jahrgang: { sort: "desc", nulls: "last" } }, { kennung: "asc" }],
    select: {
      id: true,
      kennung: true,
      jahrgang: true,
      zeichenFarbe: true,
      zeichenNummer: true,
      rasse: true,
      herkunft: true,
      herkunftText: true,
      zuchtserie: { select: { bezeichnung: true } },
    },
  });
  return koeniginnen.map((koenigin) => {
    const farbe = anzeigeFarbe(koenigin.jahrgang, koenigin.zeichenFarbe);
    return {
      id: koenigin.id,
      kennung: koenigin.kennung,
      jahrgang: koenigin.jahrgang,
      farbeHex: farbe?.hex ?? null,
      farbeDunklerText: farbe?.dunklerText ?? false,
      zeichen: [koenigin.zeichenFarbe, koenigin.zeichenNummer].filter(Boolean).join(" "),
      rasse: koenigin.rasse,
      herkunft:
        koenigin.zuchtserie?.bezeichnung ??
        (koenigin.herkunft === "UNBEKANNT" ? "" : (koenigin.herkunftText ?? HERKUNFT_LABEL[koenigin.herkunft as Herkunft])),
    };
  });
}

export default async function BienenstandDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const aus = await abgeschalteteBereiche();
  const design = await aktuellesDesign();
  const ohneZucht = aus.includes("koeniginnen");

  const bienenstand = await prisma.bienenstand.findUnique({
    where: { id },
    include: {
      dokumente: { orderBy: { datum: "desc" }, include: { kategorie: { select: { name: true } } } },
      voelker: {
        // Grundreihenfolge ist immer chronologisch (Anlage-Datum) - bei
        // Standposition-Sortierung wird danach in sortiereVoelker() noch
        // einmal umsortiert, siehe unten.
        orderBy: { createdAt: "asc" },
        include: {
          koenigin: {
            select: { id: true, kennung: true, jahrgang: true, zeichenFarbe: true, zeichenNummer: true, stern: true },
          },
          brutraumZarge: { select: { wabenmass: { select: { beutensystemId: true } } } },
          massnahmen: {
            where: { ...SICHTBARE_MASSNAHMEN, erledigt: false, ...(ohneZucht ? { zuchtserieId: null } : {}) },
            orderBy: { faelligAm: "asc" },
            select: { id: true, text: true, faelligAm: true, zuchtserieId: true, bioVerfahrenId: true },
          },
          eintraege: {
            orderBy: { datum: "desc" },
            take: 1,
            select: {
              datum: true,
              gewichtKg: true,
              gesamteindruck: true,
              volksstaerkeEinschaetzung: true,
              futtermengeEinschaetzung: true,
              sanftmut: true,
              schwarmtrieb: true,
              wabensitz: true,
              legeleistung: true,
              koeniginGesehen: true,
              stifteGesehen: true,
              larvenGesehen: true,
              verdeckelteBrutGesehen: true,
              weiselzellenGesehen: true,
              drohnenbruetig: true,
              abgeschwaermt: true,
              fuetterungArt: true,
              fuettererAktion: true,
              varroaAnzahl: true,
              varroaZaehlweise: true,
              honigGeerntet: true,
              aufgesetzteHonigraeume: { select: { id: true } },
            },
          },
        },
      },
    },
  });

  if (!bienenstand) {
    notFound();
  }

  const { brutraeume, honigraeume, wabenmasse } = await beutenStammdatenLaden();
  // Steigen mit jedem Sammel-Eintrag bzw. jeder Sammel-Maßnahme - damit
  // schließen sich die beiden Popups nach dem Speichern und starten leer.
  const [eintragAnzahl, massnahmenAnzahl, klimadeckel, letzteFuettererAktionen, letzteWabenzahlen, letzteBewertungen] = await Promise.all([
    prisma.stockkartenEintrag.count({ where: { volk: { bienenstandId: bienenstand.id } } }),
    prisma.massnahme.count({ where: { volk: { bienenstandId: bienenstand.id } } }),
    klimadeckelAuswahlListe(),
    // Je Volk die letzte Fütterer-Aktion - liegt sie auf "aufgesetzt", ist
    // der Fütterer noch drauf (der letzte Eintrag allein sagt das nicht).
    prisma.stockkartenEintrag.findMany({
      where: { volk: { bienenstandId: bienenstand.id }, fuettererAktion: { not: null } },
      orderBy: [{ datum: "desc" }, { createdAt: "desc" }],
      distinct: ["volkId"],
      select: { volkId: true, fuettererAktion: true },
    }),
    letzteWabenzahlenLaden(bienenstand.id),
    letzteBewertungenLaden(bienenstand.id),
  ]);
  const fuettererAuf = new Set(
    letzteFuettererAktionen.filter((eintrag) => eintrag.fuettererAktion === "AUFGESETZT").map((eintrag) => eintrag.volkId)
  );
  const volkAnlegenMitBienenstand = volkAnlegen.bind(null, bienenstand.id);
  const freieKoeniginnen = ohneZucht ? [] : await freieKoeniginnenLaden();
  // Je Volk die letzten vorhandenen Bewertungen anhängen (für Stärke und
  // Futter in der Kachel, wenn die letzte Durchsicht keine hatte).
  const voelkerMitBewertungen = bienenstand.voelker.map((volk) => ({
    ...volk,
    letzteBewertungen: letzteBewertungen.get(volk.id) ?? null,
  }));
  const aktiveVoelker = sortiereVoelker(
    voelkerMitBewertungen.filter((volk) => !volk.archiviert),
    bienenstand.voelkerSortierung
  );
  const wabenBestaende = await wabenbestaendeLaden(aktiveVoelker.map((volk) => volk.id));
  const archivierteVoelker = sortiereVoelker(
    voelkerMitBewertungen.filter((volk) => volk.archiviert),
    bienenstand.voelkerSortierung
  );
  const nachStandposition = bienenstand.voelkerSortierung === "STANDPOSITION";

  // Velutina-Meldungen dieser Saison im Akut-/Warnbereich dieses Stands.
  const hatStandort = bienenstand.breitengrad != null && bienenstand.laengengrad != null;
  const velutina = hatStandort && !aus.includes("velutina") && (await lubwLage()) !== "anderes"
    ? await standLage({
        id: bienenstand.id,
        name: bienenstand.name,
        lat: bienenstand.breitengrad!,
        lng: bienenstand.laengengrad!,
      }).catch(() => null)
    : null;

  // Meldung im Akut- oder Warnbereich? Nur dann steht der Hornissen-Status am
  // Handy oben, sonst ("Ruhig") unten bei der Karte.
  const velutinaMeldung = Boolean(
    velutina?.imBereich.some((meldung) => meldung.bereich === "akut" || meldung.bereich === "warnung")
  );
  const velutinaStatus = velutina && (
    <VelutinaStandStatus
      standId={bienenstand.id}
      meldungen={velutina.imBereich}
      akutRadiusM={velutina.einstellung.akutRadiusM}
      warnRadiusM={velutina.einstellung.warnRadiusM}
      letzterAbruf={velutina.letzterAbruf}
    />
  );

  return (
    <div className="flex flex-col gap-6">
      <SeitenNavigation className="-mb-3" />
      {/* Kopfbanner in voller Breite: das Foto füllt den Streifen randlos
          (object-cover), ein dunkler Verlauf von unten hält Name und Adresse
          darin lesbar. Ohne Foto reicht ein schmalerer Streifen - sonst
          klaffte oben ein leerer Block.
          Am Handy (unter "lg") zählt der schnelle Weg zum Volk: Banner niedrig,
          dann die Knöpfe, dann die Völker; Karte und Hornissen-Status folgen
          ganz unten. Dafür löst "contents" die Hülle auf, und die Teile sind
          einzeln im Fluss der Seite anzuordnen. Ab "lg" (PC) bleibt es ein
          Kasten: Banner, Notizen, Status und Karte darin. */}
      <div className="contents lg:relative lg:block lg:overflow-hidden lg:rounded-xl lg:border lg:border-border lg:bg-card lg:shadow-md">
       <div className="relative overflow-hidden rounded-xl border border-border bg-card shadow-md lg:rounded-none lg:border-0 lg:shadow-none">
        <div
          className={`relative w-full overflow-hidden ${
            bienenstand.standortFotoDateiname ? "h-36 sm:h-64" : "h-28"
          }`}
        >
          {bienenstand.standortFotoDateiname ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={`/bilder/${bienenstand.standortFotoDateiname}`}
              alt=""
              className="absolute inset-0 h-full w-full object-cover"
              style={{
                objectPosition: `${bienenstand.standortFotoFokusX * 100}% ${bienenstand.standortFotoFokusY * 100}%`,
                transform: `scale(${bienenstand.standortFotoZoom})`,
                transformOrigin: `${bienenstand.standortFotoFokusX * 100}% ${bienenstand.standortFotoFokusY * 100}%`,
              }}
            />
          ) : (
            // Ohne Foto ein ruhiger dunkler Streifen statt einer hellen
            // Leerfläche - darauf bleibt der helle Text lesbar und es sieht
            // nicht nach Fehler aus. Bewusst ein neutraler Grauton und nicht
            // die Akzentfarbe: die wechselt im Dunkelmodus auf ein helles
            // Bernstein, auf dem weiße Schrift nicht mehr trägt.
            <div className="absolute inset-0 bg-gradient-to-br from-neutral-600 to-neutral-800" />
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
          <BienenstandFotoLightbox
            bienenstandId={bienenstand.id}
            dateiname={bienenstand.standortFotoDateiname}
            zoom={bienenstand.standortFotoZoom}
            fokusX={bienenstand.standortFotoFokusX}
            fokusY={bienenstand.standortFotoFokusY}
            action={bienenstandFotoAktualisieren}
            ausschnittAction={bienenstandFotoAusschnittAktualisieren}
          />
          <div className="absolute inset-x-0 bottom-0 p-4">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl font-semibold text-white sm:text-2xl">{bienenstand.name}</h1>
              <StandtypBadge standtyp={bienenstand.standtyp} aufFoto />
              {bienenstand.archiviert && (
                <span className="rounded-full bg-white/20 px-2 py-0.5 text-xs text-white">archiviert</span>
              )}
              <Link
                href={`/bienenstaende/${bienenstand.id}/bearbeiten`}
                className="inline-flex min-h-11 items-center px-3 text-sm text-white/85 hover:text-white"
              >
                bearbeiten
              </Link>
            </div>
            {(bienenstand.strasse || bienenstand.ort) && (
              <p className="text-sm text-white/85">
                {[bienenstand.strasse, bienenstand.ort].filter(Boolean).join(", ")}
              </p>
            )}
          </div>
        </div>

        {bienenstand.notizen && (
          <p className="whitespace-pre-wrap p-4 text-sm lg:pb-3">{bienenstand.notizen}</p>
        )}
       </div>

        {/* Am Handy nur bei Meldung ganz oben (die zweite Fassung unten ist
            dann am Handy ausgeblendet). */}
        {velutinaMeldung && <div className="lg:hidden">{velutinaStatus}</div>}

        {hatStandort && (
          // Am PC links der Velutina-Status, rechts die (schmalere) Karte;
          // am Handy/iPad ganz unten (order-last), Status vor der Karte.
          <div
            className={`order-last grid grid-cols-1 gap-3 rounded-xl border border-border bg-card p-4 shadow-md lg:order-none lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)] lg:rounded-none lg:border-0 lg:shadow-none ${
              bienenstand.notizen ? "lg:pt-0" : ""
            }`}
          >
            {velutina && (
              <div className={velutinaMeldung ? "hidden lg:block" : ""}>{velutinaStatus}</div>
            )}
            <div className={velutina ? "" : "lg:col-start-2"}>
              <StandortAnzeige
                breitengrad={bienenstand.breitengrad!}
                laengengrad={bienenstand.laengengrad!}
                wanderstand={bienenstand.standtyp === "WANDER"}
              />
            </div>
          </div>
        )}
      </div>

      {/* Sammel-Eintrag und Sammel-Maßnahme für mehrere Völker dieses
          Stands - direkt unter dem Banner (am PC unter Banner und Karte),
          über der Völkerliste. */}
      <StandSammelAktionen
        aus={aus}
        bienenstandId={bienenstand.id}
        voelker={aktiveVoelker.map((volk) => ({
          id: volk.id,
          name: volk.name,
          systemId: volk.brutraumZarge?.wabenmass.beutensystemId ?? null,
          koeniginFarbe: anzeigeFarbe(volk.koenigin?.jahrgang, volk.koenigin?.zeichenFarbe)?.hex ?? null,
          letzteDurchsicht: letzteWabenzahlen.get(volk.id) ?? null,
          letzteBewertungen: letzteBewertungen.get(volk.id) ?? null,
          wabenBestand: wabenBestaende.get(volk.id) ?? null,
        }))}
        honigraeume={honigraeume}
        wabenmasse={wabenmasse}
        jetzt={jetztAlsInputWert()}
        eintragKey={eintragAnzahl}
        massnahmeKey={massnahmenAnzahl}
      />

      {!aus.includes("waagen") && <GtsKarte bienenstandId={bienenstand.id} />}

      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Völker</h2>
          <VolkAnlegenDialog
            action={volkAnlegenMitBienenstand}
            brutraeume={brutraeume}
            klimadeckel={klimadeckel}
            koeniginAn={!aus.includes("koeniginnen")}
            freieKoeniginnen={freieKoeniginnen}
          />
        </div>

        {aktiveVoelker.length > 1 && (
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
            <span>Sortierung:</span>
            <div className="inline-flex overflow-hidden rounded-md border border-rand-ruhig">
              <form action={bienenstandVoelkerSortierungAktualisieren.bind(null, bienenstand.id, "CHRONOLOGISCH")}>
                <button
                  type="submit"
                  className={`px-4 py-2.5 text-sm font-medium ${
                    !nachStandposition ? "bg-accent text-accent-foreground" : "bg-card hover:bg-background"
                  }`}
                >
                  Chronologisch
                </button>
              </form>
              <form
                action={bienenstandVoelkerSortierungAktualisieren.bind(null, bienenstand.id, "STANDPOSITION")}
              >
                <button
                  type="submit"
                  className={`border-l border-border px-4 py-2.5 text-sm font-medium ${
                    nachStandposition ? "bg-accent text-accent-foreground" : "bg-card hover:bg-background"
                  }`}
                >
                  Standposition
                </button>
              </form>
            </div>
            {nachStandposition && <span>Mit den Pfeilen an jeder Kachel die Reihenfolge wie am Stand festlegen.</span>}
          </div>
        )}

        {aktiveVoelker.length > 0 && design !== "aktuell" ? (
          <div className={design === "wabe" ? "grid grid-cols-1 gap-3.5 md:grid-cols-2" : "border-t border-foreground"}>
            {design === "klar" && <KlarVolkKopf />}
            {aktiveVoelker.map((volk, index) => (
              <VolkNeu
                key={volk.id}
                volk={volk}
                aus={aus}
                design={design}
                fuettererAuf={fuettererAuf.has(volk.id)}
                verschieben={
                  nachStandposition ? { istErste: index === 0, istLetzte: index === aktiveVoelker.length - 1 } : undefined
                }
              />
            ))}
          </div>
        ) : aktiveVoelker.length === 0 ? (
          <Card className="text-center text-muted">
            Noch kein Volk an diesem Stand angelegt.
          </Card>
        ) : (
          // Ab PC-Breite zwei Kacheln nebeneinander: über die volle
          // Inhaltsbreite gezogen wären sie fast leer. Kopf, Karte und
          // Sammelknöpfe darüber bleiben in voller Breite.
          <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
            {aktiveVoelker.map((volk, index) => (
              <VolkVorschau
                aus={aus}
                key={volk.id}
                volk={volk}
                fuettererAuf={fuettererAuf.has(volk.id)}
                verschieben={
                  nachStandposition
                    ? { istErste: index === 0, istLetzte: index === aktiveVoelker.length - 1 }
                    : undefined
                }
              />
            ))}
          </div>
        )}

        {archivierteVoelker.length > 0 && (
          <div className="mt-2 flex flex-col gap-3">
            <h3 className="text-sm font-medium text-muted">Archivierte Völker</h3>
            {design !== "aktuell" ? (
              <div className={design === "wabe" ? "grid grid-cols-1 gap-3.5 md:grid-cols-2" : "border-t border-border"}>
                {archivierteVoelker.map((volk) => (
                  <VolkNeu key={volk.id} volk={volk} aus={aus} design={design} fuettererAuf={fuettererAuf.has(volk.id)} gedaempft />
                ))}
              </div>
            ) : (
            <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
              {archivierteVoelker.map((volk) => (
                <VolkVorschau
                aus={aus}
                  key={volk.id}
                  volk={volk}
                  fuettererAuf={fuettererAuf.has(volk.id)}
                  gedaempft
                />
              ))}
            </div>
            )}
          </div>
        )}
      </div>

      {!aus.includes("dokumente") && (
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">Dokumente</h2>
            <LinkKnopf href={`/dokumente/neu?standId=${bienenstand.id}`} variant="secondary">+ Dokument</LinkKnopf>
          </div>

          {bienenstand.dokumente.length === 0 ? (
            <Card className="text-center text-muted">
              Noch kein Dokument für diesen Stand hinterlegt (z.B. ein Gesundheitszeugnis).
            </Card>
          ) : (
            <Card>
              <DokumenteMiniListe
                dokumente={bienenstand.dokumente.map((dokument) => ({
                  id: dokument.id,
                  kategorieName: dokument.kategorie.name,
                  titel: dokument.titel,
                  datum: dokument.datum,
                  dateiname: dokument.dateiname,
                  mimeType: dokument.mimeType,
                  groesse: dokument.groesse,
                  loeschenAction: dokumentLoeschen.bind(null, dokument.id),
                }))}
              />
            </Card>
          )}
        </div>
      )}
    </div>
  );
}
