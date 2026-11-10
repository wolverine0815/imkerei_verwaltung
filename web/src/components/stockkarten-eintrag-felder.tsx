import { Label, Input, Textarea, Select } from "@/components/ui";
import { Aufklappbar } from "@/components/aufklappbar";
import { BewertungsSchieber } from "@/components/bewertungs-schieber";
import { ZahlStepper } from "@/components/zahl-stepper";
import { WabenAenderungFelder } from "@/components/waben-aenderung-felder";
import { GewichtFelder } from "@/components/gewicht-felder";
import { WIEGEMETHODE_OPTIONEN } from "@/lib/gewicht-summe";
import { VarroaBefall } from "@/components/varroa-befall";
import { Honigraum, type AufsatzVorgabe, type ErnteAnteilVorgabe } from "@/components/honigraum";
import type { OffenerAufsatz, WabenmassAuswahl, ZargeAuswahl } from "@/lib/honig";
import { IconHaus, IconWabenrahmen, IconVarroa, IconMedaille, IconHonigglas, IconTropfen, IconWaage } from "@/components/icons";

const FUETTERUNGS_ART_OPTIONEN = [
  { wert: "INVERTZUCKERSIRUP", label: "Invertzuckersirup" },
  { wert: "WEIZENSIRUP", label: "Weizensirup" },
  { wert: "ZUCKERWASSER_07_1", label: "Zuckerwasser 0,7:1" },
  { wert: "ZUCKERWASSER_1_1", label: "Zuckerwasser 1:1" },
  { wert: "ZUCKERWASSER_3_2", label: "Zuckerwasser 3:2" },
  { wert: "ZUCKERWASSER_2_1", label: "Zuckerwasser 2:1" },
  { wert: "FUTTERTEIG", label: "Futterteig" },
  { wert: "EIWEISSFUTTERTEIG", label: "Eiweißfutterteig" },
  { wert: "SONSTIGE", label: "Sonstige" },
];

// Beurteilung des Volkes: je Kriterium 6 benannte Stufen, gespeichert als
// Note von 1,0 (beste Stufe) bis 6,0 (schlechteste) in halben Schritten.
// Die halben Noten haben keinen eigenen Namen ("zwischen A und B").
// Reihenfolge der Listen: Note 1 zuerst. Auch für Verlauf, Stand-Kachel und
// Königinsbewertung exportiert.
export const VOLKSSTAERKE_STUFEN = ["Sehr stark", "Stark", "Gut", "Mittel", "Schwach", "Sehr schwach"];
export const FUTTERMENGE_STUFEN = ["Reichlich", "Gut versorgt", "Ausreichend", "Knapp", "Wenig", "Kaum Futter"];
export const SANFTMUT_STUFEN = ["Sehr sanft", "Sanft", "Ruhig", "Unruhig", "Stechlustig", "Aggressiv"];
export const WABENSITZ_STUFEN = ["Sehr ruhig", "Ruhig", "Leicht bewegt", "Unruhig", "Sehr unruhig", "Läuferisch"];
export const SCHWARMTRIEB_STUFEN = ["Keiner", "Spielnäpfchen", "Bestiftet", "Einzelne Larven", "Viele Larven", "Verdeckelt"];
// Brutflächen als Anhaltspunkt für die Legeleistung der Königin.
export const LEGELEISTUNG_STUFEN = ["Sehr groß", "Groß", "Normal", "Klein", "Lückig", "Kaum Brut"];
export const GESAMTEINDRUCK_STUFEN = ["Hervorragend", "Sehr gut", "Gut", "Befriedigend", "Mangelhaft", "Ungenügend"];

// Für die Beurteilungs-Schieberegler: ab welcher Note ein Wert gelb bzw. rot
// ist (sonst grün). Genutzt vom Schieberegler selbst (Farbe/Leuchten), von
// der Volk-Vorschau auf der Bienenstand-Seite und vom Speichern-Hinweis-Popup -
// dort zählen gelb und rot als "auffällig" (siehe istAuffaellig).
export type BeurteilungsFeld =
  | "volksstaerkeEinschaetzung"
  | "futtermengeEinschaetzung"
  | "sanftmut"
  | "schwarmtrieb"
  | "wabensitz"
  | "gesamteindruck"
  | "legeleistung";

export type BeurteilungsEinstufung = "rot" | "gelb" | "gruen";

export type BeurteilungsKriterium = {
  feld: BeurteilungsFeld;
  label: string;
  /** Namen der Noten 1 bis 6. */
  stufen: string[];
  /** Ab dieser Note gelb. */
  gelbAb: number;
  /** Ab dieser Note rot. */
  rotAb: number;
  /// Fließt in die Bewertung der Königin ein (Lebenslauf, Schulnoten,
  /// Gesamtnote)? Default true. Gesamteindruck und Futtermenge bewerten das
  /// Volk als Ganzes bzw. die Betriebsweise, nicht spezifisch die Genetik
  /// der Königin, deshalb hier ausgenommen - in der Stockkarte selbst
  /// bleiben sie unverändert erfasst.
  zaehltZurKoeniginsbewertung?: boolean;
};

export const BEURTEILUNGS_KRITERIEN: BeurteilungsKriterium[] = [
  { feld: "volksstaerkeEinschaetzung", label: "Volksstärke", stufen: VOLKSSTAERKE_STUFEN, gelbAb: 4, rotAb: 5 },
  {
    feld: "futtermengeEinschaetzung",
    label: "Futtermenge",
    stufen: FUTTERMENGE_STUFEN,
    gelbAb: 4,
    rotAb: 5,
    zaehltZurKoeniginsbewertung: false,
  },
  { feld: "sanftmut", label: "Sanftmut", stufen: SANFTMUT_STUFEN, gelbAb: 4, rotAb: 5 },
  { feld: "wabensitz", label: "Wabensitz", stufen: WABENSITZ_STUFEN, gelbAb: 4, rotAb: 5 },
  // Beim Schwarmtrieb muss schon früher gehandelt werden: bestiftete
  // Näpfchen sind gelb, Schwarmzellen mit Larven rot.
  { feld: "schwarmtrieb", label: "Schwarmtrieb", stufen: SCHWARMTRIEB_STUFEN, gelbAb: 3, rotAb: 4 },
  { feld: "legeleistung", label: "Legeleistung", stufen: LEGELEISTUNG_STUFEN, gelbAb: 4, rotAb: 5 },
  {
    feld: "gesamteindruck",
    label: "Gesamteindruck",
    stufen: GESAMTEINDRUCK_STUFEN,
    // Franks Vorgabe: beim Gesamteindruck schon ab 3,5 gelb.
    gelbAb: 3.5,
    rotAb: 5,
    zaehltZurKoeniginsbewertung: false,
  },
];

/// Der Gesamteindruck allein (Plakette, Kurzleiste, großer Strahl im Verlauf).
export const GESAMTEINDRUCK_KRITERIUM = BEURTEILUNGS_KRITERIEN.find(
  (kriterium) => kriterium.feld === "gesamteindruck"
) as BeurteilungsKriterium;

/// Nur die Kriterien, die in die Bewertung der Königin einfließen.
export const KOENIGINS_BEURTEILUNGS_KRITERIEN = BEURTEILUNGS_KRITERIEN.filter(
  (kriterium) => kriterium.zaehltZurKoeniginsbewertung !== false
);

export function kriteriumEinstufung(
  kriterium: Pick<BeurteilungsKriterium, "gelbAb" | "rotAb">,
  wert: number | null | undefined
): BeurteilungsEinstufung | null {
  if (wert === null || wert === undefined) return null;
  if (wert >= kriterium.rotAb) return "rot";
  if (wert >= kriterium.gelbAb) return "gelb";
  return "gruen";
}

export function istAuffaellig(einstufung: BeurteilungsEinstufung | null): boolean {
  return einstufung === "rot" || einstufung === "gelb";
}

/// Note mit deutschem Komma: 2.5 -> "2,5".
export function noteText(wert: number): string {
  return wert.toFixed(1).replace(".", ",");
}

/// Wortlaut zu einer Note: ganze Noten mit ihrem Namen, halbe als
/// "zwischen A und B".
export function stufeText(kriterium: Pick<BeurteilungsKriterium, "stufen">, wert: number): string {
  const unten = Math.floor(wert);
  const name = (note: number) => kriterium.stufen[Math.min(6, Math.max(1, note)) - 1] ?? "";
  if (wert === unten) return name(unten);
  return `zwischen ${name(unten)} und ${name(unten + 1)}`;
}

/// Kurzform für Plaketten: ganze Noten mit Namen, halbe als "A–B".
export function stufeKurz(kriterium: Pick<BeurteilungsKriterium, "stufen">, wert: number): string {
  const unten = Math.floor(wert);
  if (wert === unten) return stufeText(kriterium, wert);
  return `${stufeText(kriterium, unten)}–${stufeText(kriterium, unten + 1)}`;
}

/// Die gespeicherten Werte sind bereits Noten (1 sehr gut - 6 ungenügend),
/// auch der Schnitt über mehrere Durchsichten.
export function kriteriumAlsSchulnote(_kriterium: unknown, wert: number): number {
  return wert;
}

export const FUETTERUNGS_ART_LABEL: Record<string, string> = Object.fromEntries(
  FUETTERUNGS_ART_OPTIONEN.map((option) => [option.wert, option.label])
);
export const WIEGEMETHODE_LABEL: Record<string, string> = Object.fromEntries(
  WIEGEMETHODE_OPTIONEN.map((option) => [option.wert, option.label])
);

// Einfache Ja/Nein-Checkbox statt Dropdown mit drei Optionen - für die
// Sichtungen im Brutraum reicht nur Ja oder Nein, ohne "unbekannt" als
// dritte Möglichkeit. Nicht angehakt (Preset) zählt als "nein". Unchecked
// wird beim Absenden gar nicht mitgeschickt, daher liest actions.ts jedes
// Fehlen dieses Feldes ebenfalls als "nein".
function JaNeinCheckbox({
  name,
  label,
  defaultValue,
}: {
  name: string;
  label: string;
  defaultValue?: boolean | null;
}) {
  return (
    <label
      htmlFor={name}
      className="flex cursor-pointer items-center gap-2 rounded-md border border-rand-ruhig bg-card px-3 py-2 text-sm"
    >
      <input
        id={name}
        name={name}
        type="checkbox"
        value="ja"
        defaultChecked={defaultValue === true}
        className="h-5 w-5 shrink-0 accent-accent"
      />
      {label}
    </label>
  );
}

function ZahlFeld({
  name,
  label,
  defaultValue,
  kommazahl = false,
}: {
  name: string;
  label: string;
  defaultValue?: number | null;
  /** Für Mengen wie kg, die auch Nachkommastellen haben können. */
  kommazahl?: boolean;
}) {
  // Nachkommazahlen als Text statt <input type="number">: Zahlenfelder
  // akzeptieren als Dezimaltrennzeichen nur den Punkt, auch bei deutscher
  // Spracheinstellung - ein mit Komma getipptes Gewicht wie "42,5" landete
  // dadurch stillschweigend als "425" im Feld (das Komma wurde beim Tippen
  // verworfen, keine Fehlermeldung). Die Auswertung als Zahl übernimmt
  // `zahlOderNull` in actions.ts, die beide Trennzeichen versteht.
  return (
    <div>
      <Label htmlFor={name}>{label}</Label>
      <Input
        id={name}
        name={name}
        type={kommazahl ? "text" : "number"}
        inputMode={kommazahl ? "decimal" : "numeric"}
        min={kommazahl ? undefined : "0"}
        step={kommazahl ? undefined : "1"}
        defaultValue={
          defaultValue == null ? "" : kommazahl ? defaultValue.toString().replace(".", ",") : defaultValue
        }
      />
    </div>
  );
}

// Werte eines vorhandenen Eintrags (zum Vorausfüllen beim Bearbeiten) -
// beim Neuanlegen einfach weglassen, dann sind alle Felder leer.
export type StockkartenEintragDefaults = {
  /** Datum des Eintrags - bestimmt, welche Varroa-Schadschwelle gilt. */
  datum?: Date | null;
  koeniginGesehen?: boolean | null;
  stifteGesehen?: boolean | null;
  larvenGesehen?: boolean | null;
  verdeckelteBrutGesehen?: boolean | null;
  weiselzellenGesehen?: boolean | null;
  volksstaerke?: number | null;
  bebrueteteWaben?: number | null;
  leerwaben?: number | null;
  mittelwaende?: number | null;
  brutwaben?: number | null;
  futterwaben?: number | null;
  baurahmenDrohnenrahmen?: number | null;
  varroaZaehlweise?: string | null;
  varroaAnzahl?: number | null;
  varroaGemuellTage?: number | null;
  varroaBienenprobeGramm?: number | null;
  drohnenbrutGeschnitten?: boolean | null;
  biotechnischeMassnahmen?: string | null;
  volksstaerkeEinschaetzung?: number | null;
  futtermengeEinschaetzung?: number | null;
  sanftmut?: number | null;
  schwarmtrieb?: number | null;
  wabensitz?: number | null;
  gesamteindruck?: number | null;
  legeleistung?: number | null;
  bienenAngeflogen?: boolean | null;
  abgeschwaermt?: boolean | null;
  drohnenbruetig?: boolean | null;
  honigGeerntet?: boolean | null;
  honigRaehmchenAnzahl?: number | null;
  honigSchaetzungKg?: number | null;
  honigertragKg?: number | null;
  /// Stand des Korrektur-Schiebers in Prozent - nur aus einem Entwurf auf
  /// dem Gerät; beim Bearbeiten ergibt er sich aus Schätzung und Ertrag.
  honigKorrekturProzent?: number | null;
  honigart?: string | null;
  honigernteAnteile?: ErnteAnteilVorgabe[];
  /// Honigräume, die dieser Eintrag aufgesetzt hat (beim Bearbeiten).
  aufgesetzteHonigraeume?: AufsatzVorgabe[];
  /// Honigräume, die dieser Eintrag geerntet hat (beim Bearbeiten).
  geernteteAufsatzIds?: string[];
  fuetterungArt?: string | null;
  fuetterungMenge?: number | null;
  fuetterungEinheit?: string | null;
  gewichtKg?: number | null;
  wiegemethode?: string | null;
  notizen?: string | null;
};

/// Besetzte Wabengassen und bebrütete Waben der letzten Durchsicht, in der
/// sie erfasst wurden (siehe lib/letzte-durchsicht.ts).
export type LetzteWabenzahlen = {
  volksstaerke: number | null;
  bebrueteteWaben: number | null;
};

/// Je Bewertungs-Kriterium die letzte gesetzte Wertung samt Datum (siehe
/// lib/letzte-durchsicht.ts) - nur zum Ansehen am Regler, nie vorbelegt.
export type LetzteBewertungen = Partial<Record<BeurteilungsFeld, { note: number; datum: Date }>>;

// Prüft, ob für einen Abschnitt schon etwas eingetragen ist - dann macht es
// Sinn, ihn beim Bearbeiten direkt aufgeklappt zu zeigen statt versteckt.
function hatWert(...werte: Array<string | number | boolean | null | undefined>): boolean {
  return werte.some((wert) => wert !== null && wert !== undefined && wert !== "");
}

// Alle Felder einer Stockkarten-Beobachtung, in Abschnitte gegliedert wie bei
// einer klassischen Bienenkontrolle: Brutraum -> Waben genommen/gegeben ->
// Varroa -> Gesamtbeurteilung -> Ernte/Fütterung/Gewicht -> freie Notizen.
// Wird identisch beim Anlegen und beim Bearbeiten eines Eintrags verwendet.
export function StockkartenEintragFelder({
  werte = {},
  honigraeume = [],
  wabenmasse = [],
  offeneAufsaetze = [],
  eigenesSystemId = null,
  behandlungenAn = true,
  fuettererAuf = false,
  fuettererModus = "zustand",
  neu = false,
  letzteDurchsicht = null,
  letzteBewertungen = null,
  wabenBestand,
  wabenNachtragenHref,
}: {
  werte?: StockkartenEintragDefaults;
  /// Honigraumgrößen und Wabenmaße aus den Einstellungen - Grundlage der
  /// Ertragsschätzung bei der Ernte.
  honigraeume?: ZargeAuswahl[];
  wabenmasse?: WabenmassAuswahl[];
  /// Honigräume, die gerade auf dem Volk sitzen.
  offeneAufsaetze?: OffenerAufsatz[];
  /// Beutensystem des Volkes - dessen Zargen stehen in den Listen oben.
  eigenesSystemId?: string | null;
  /// Bereich "Behandlungen" eingeschaltet? Sonst entfällt der Hinweis darauf.
  behandlungenAn?: boolean;
  /// Liegt (nach diesem Eintrag) ein Fütterer auf dem Volk? Belegt den Haken vor.
  fuettererAuf?: boolean;
  /// "zustand": Haken weg = Fütterer abgenommen. "nurAufsetzen" (Sammel-
  /// Eintrag für mehrere Völker): Haken weg = keine Angabe.
  fuettererModus?: "zustand" | "nurAufsetzen";
  /// Neue Durchsicht: Brutraum und Bewertung starten aufgeklappt (die füllst
  /// du fast immer aus), der Rest bleibt zu.
  neu?: boolean;
  /// Wabenzahlen der letzten Durchsicht - als graue Vorgabe in den Stellern.
  letzteDurchsicht?: LetzteWabenzahlen | null;
  /// Wertungen der letzten Durchsichten - als Ring am Bewertungs-Strahl.
  letzteBewertungen?: LetzteBewertungen | null;
  /// Waben in der Beute vor dieser Durchsicht (null = beim Volk noch nicht
  /// erfasst, weglassen = keine Angabe), siehe WabenAenderungFelder.
  wabenBestand?: number | null;
  /// Wohin der Hinweis "Waben nachtragen" führt.
  wabenNachtragenHref?: string;
}) {
  // Beim Bearbeiten: um wie viel Prozent der gespeicherte Ertrag von der
  // damaligen Schätzung abweicht - damit der Schieberegler wieder dort steht,
  // wo er beim Speichern stand.
  const korrekturProzent =
    werte.honigKorrekturProzent ??
    (werte.honigSchaetzungKg && werte.honigertragKg
      ? Math.round((werte.honigertragKg / werte.honigSchaetzungKg) * 100)
      : null);

  return (
    <>
      <Aufklappbar
        titel="Brutraum"
        symbol={<IconHaus className="h-4 w-4" />}
        hinweis="Der Brutnestbefund dieser Durchsicht: was du gesehen hast."
        startOffen={
          neu ||
          werte.koeniginGesehen === true ||
          werte.stifteGesehen === true ||
          werte.larvenGesehen === true ||
          werte.verdeckelteBrutGesehen === true ||
          werte.weiselzellenGesehen === true ||
          werte.drohnenbruetig === true ||
          hatWert(werte.volksstaerke, werte.bebrueteteWaben)
        }
      >
        <p className="text-xs text-muted">Sichtung</p>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <JaNeinCheckbox name="koeniginGesehen" label="Königin gesehen" defaultValue={werte.koeniginGesehen} />
          <JaNeinCheckbox name="stifteGesehen" label="Stifte" defaultValue={werte.stifteGesehen} />
          <JaNeinCheckbox name="larvenGesehen" label="Larven" defaultValue={werte.larvenGesehen} />
          <JaNeinCheckbox
            name="verdeckelteBrutGesehen"
            label="Verdeckelte Brut"
            defaultValue={werte.verdeckelteBrutGesehen}
          />
          <JaNeinCheckbox
            name="weiselzellenGesehen"
            label="Weiselzellen"
            defaultValue={werte.weiselzellenGesehen}
          />
          <JaNeinCheckbox name="drohnenbruetig" label="Drohnenbrütig" defaultValue={werte.drohnenbruetig} />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          {/* Das Feld heißt weiter "volksstaerke", angezeigt wird es so, wie
              du am Stand zählst: in Wabengassen. */}
          <ZahlStepper
            name="volksstaerke"
            label="Besetzte Wabengassen"
            defaultValue={werte.volksstaerke}
            letzterWert={letzteDurchsicht?.volksstaerke}
          />
          <ZahlStepper
            name="bebrueteteWaben"
            label="Bebrütete Waben"
            defaultValue={werte.bebrueteteWaben}
            letzterWert={letzteDurchsicht?.bebrueteteWaben}
          />
        </div>
      </Aufklappbar>

      <Aufklappbar
        titel="Waben"
        symbol={<IconWabenrahmen className="h-4 w-4" />}
        hinweis="Waben, die du dem Volk bei dieser Durchsicht gegeben (+) oder entnommen (−) hast, je Art getrennt."
        startOffen={hatWert(
          werte.leerwaben,
          werte.mittelwaende,
          werte.brutwaben,
          werte.futterwaben,
          werte.baurahmenDrohnenrahmen
        )}
      >
        {/* Stepper statt Zahlenfeld: am Stand ohne Tastatur, mit Handschuhen. */}
        <WabenAenderungFelder werte={werte} bestand={wabenBestand} nachtragenHref={wabenNachtragenHref} />
      </Aufklappbar>

      <Aufklappbar
        titel="Varroa"
        symbol={<IconVarroa className="h-4 w-4" />}
        hinweis="Befallskontrolle: Zählweise und gefundene Milben. Die App rechnet daraus den Befall und vergleicht ihn mit der Schadschwelle der Jahreszeit. Dazu biotechnische Eingriffe."
        startOffen={werte.drohnenbrutGeschnitten === true || hatWert(
          werte.varroaZaehlweise,
          werte.varroaAnzahl,
          werte.biotechnischeMassnahmen
        )}
      >
        <VarroaBefall
          zaehlweise={werte.varroaZaehlweise}
          anzahl={werte.varroaAnzahl}
          gemuellTage={werte.varroaGemuellTage}
          bienenprobeGramm={werte.varroaBienenprobeGramm}
          datum={werte.datum}
        />
        <p className="text-xs text-muted">Biotechnik</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <JaNeinCheckbox
            name="drohnenbrutGeschnitten"
            label="Drohnenbrut geschnitten"
            defaultValue={werte.drohnenbrutGeschnitten}
          />
        </div>
        <div>
          <Label htmlFor="biotechnischeMassnahmen">Biotechnische Maßnahmen</Label>
          <Input
            id="biotechnischeMassnahmen"
            name="biotechnischeMassnahmen"
            defaultValue={werte.biotechnischeMassnahmen ?? ""}
            placeholder="z.B. Brutwabe entnommen"
          />
          {behandlungenAn && (
            <p className="mt-1 text-xs text-muted">
              Tierarzneimittel erfasst du nicht hier, sondern unter{" "}
              <a href="/behandlungen" className="text-accent hover:underline">Behandlungen</a>. Dort
              entsteht der gesetzlich vorgeschriebene Nachweis.
            </p>
          )}
        </div>
      </Aufklappbar>

      <Aufklappbar
        titel="Bewertung des Volkes"
        symbol={<IconMedaille className="h-4 w-4" />}
        hinweis="Dein Eindruck vom Volk: links die beste Stufe, rechts die schlechteste, dazwischen Zwischenstufen. Tipp nur an, was du wirklich beurteilt hast. Graue Regler bleiben leer und werden nicht gespeichert."
        startOffen={
          neu ||
          werte.bienenAngeflogen === true ||
          werte.abgeschwaermt === true ||
          hatWert(
          werte.volksstaerkeEinschaetzung,
          werte.futtermengeEinschaetzung,
          werte.sanftmut,
          werte.schwarmtrieb,
          werte.wabensitz,
          werte.legeleistung,
          werte.gesamteindruck
          )
        }
      >
        <div className="grid gap-x-8 gap-y-5 sm:grid-cols-2">
          {BEURTEILUNGS_KRITERIEN.map((kriterium) => (
            <BewertungsSchieber
              key={kriterium.feld}
              name={kriterium.feld}
              kriterium={kriterium}
              defaultValue={werte[kriterium.feld]}
              vorwert={letzteBewertungen?.[kriterium.feld] ?? null}
            />
          ))}
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <JaNeinCheckbox
            name="bienenAngeflogen"
            label="Bienen haben mich angeflogen"
            defaultValue={werte.bienenAngeflogen}
          />
          <JaNeinCheckbox name="abgeschwaermt" label="Abgeschwärmt" defaultValue={werte.abgeschwaermt} />
        </div>
      </Aufklappbar>

      <Aufklappbar
        titel="Honigraum & Ernte"
        symbol={<IconHonigglas className="h-4 w-4" />}
        hinweis="Was du aufgesetzt und was du abgenommen hast. Aufgesetzte Honigräume merkt sich die App am Volk, beim Ernten hakst du sie nur noch ab. Die Kilogramm schätzt sie aus deinen Durchschnittswerten, mit dem Schieberegler korrigierst du nach."
        startOffen={
          werte.honigGeerntet === true ||
          (werte.aufgesetzteHonigraeume ?? []).length > 0 ||
          hatWert(werte.honigRaehmchenAnzahl, werte.honigertragKg, werte.honigart)
        }
      >
        <Honigraum
          honigraeume={honigraeume}
          wabenmasse={wabenmasse}
          offeneAufsaetze={offeneAufsaetze}
          eigenesSystemId={eigenesSystemId}
          aufgesetzt={werte.aufgesetzteHonigraeume}
          geerntet={werte.honigGeerntet}
          geernteteAufsatzIds={werte.geernteteAufsatzIds}
          anteile={werte.honigernteAnteile}
          korrekturProzent={korrekturProzent}
          honigertragKg={werte.honigertragKg}
          honigart={werte.honigart}
        />
        {werte.honigRaehmchenAnzahl !== null && werte.honigRaehmchenAnzahl !== undefined && (
          <p className="text-xs text-muted">
            Aus einer früheren Fassung dieses Eintrags: {werte.honigRaehmchenAnzahl} Rähmchen.
            Die Angabe wird nicht mehr gepflegt. Erfasse die Ernte oben neu. Der Hinweis bleibt
            auch nach dem Speichern stehen, hat aber keine Wirkung.
          </p>
        )}
      </Aufklappbar>

      <Aufklappbar
        titel="Fütterung"
        symbol={<IconTropfen className="h-4 w-4" />}
        hinweis="Was das Volk bekommen hat: Futterart und Menge in Litern oder Kilogramm. Bei Zuckerwasser in Kilogramm gilt die Zuckermenge (Trockenmasse)."
        startOffen={fuettererAuf || hatWert(werte.fuetterungArt, werte.fuetterungMenge)}
      >
        <div>
          <input type="hidden" name="fuettererModus" value={fuettererModus} />
          <div className="grid gap-3 sm:grid-cols-2">
            <JaNeinCheckbox name="fuettererAuf" label="Fütterer aufgesetzt" defaultValue={fuettererAuf} />
          </div>
          <p className="mt-1 text-xs text-muted">
            {fuettererModus === "zustand"
              ? "Haken setzen = Fütterer aufgesetzt, Haken wegnehmen = Fütterer abgenommen. Beides steht mit Datum und Uhrzeit im Verlauf."
              : "Haken setzen = Fütterer aufgesetzt. Abnehmen bitte am einzelnen Volk eintragen."}
          </p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label htmlFor="fuetterungArt">Futterart</Label>
            <Select id="fuetterungArt" name="fuetterungArt" defaultValue={werte.fuetterungArt ?? ""}>
              <option value="">keine Auswahl</option>
              {FUETTERUNGS_ART_OPTIONEN.map((option) => (
                <option key={option.wert} value={option.wert}>
                  {option.label}
                </option>
              ))}
            </Select>
          </div>
          <div className="grid grid-cols-[minmax(0,1fr)_7rem] items-end gap-2">
            <ZahlFeld name="fuetterungMenge" label="Menge" defaultValue={werte.fuetterungMenge} kommazahl />
            <div>
              <Label htmlFor="fuetterungEinheit">Einheit</Label>
              <Select id="fuetterungEinheit" name="fuetterungEinheit" defaultValue={werte.fuetterungEinheit ?? "LITER"}>
                <option value="LITER">Liter</option>
                <option value="KG">kg</option>
              </Select>
            </div>
          </div>
        </div>
      </Aufklappbar>

      <Aufklappbar
        titel="Gewicht"
        symbol={<IconWaage className="h-4 w-4" />}
        hinweis="Das Stockgewicht und wie es ermittelt wurde (einseitig angekippt oder vollständig gewogen). Ergänzt die Werte der Stockwaage an Ständen ohne Waage."
        startOffen={hatWert(werte.gewichtKg, werte.wiegemethode)}
      >
        <GewichtFelder wiegemethode={werte.wiegemethode} gewichtKg={werte.gewichtKg} />
      </Aufklappbar>

      <div>
        <Label htmlFor="notizen">Notizen</Label>
        <Textarea id="notizen" name="notizen" rows={2} defaultValue={werte.notizen ?? ""} />
      </div>
    </>
  );
}
