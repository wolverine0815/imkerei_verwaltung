"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import {
  stockkartenEintragAnlegen,
  stockkartenEintraegeFuerStandAnlegen,
} from "@/lib/actions";
import { Button, Input, Label, Textarea } from "@/components/ui";
import {
  type LetzteBewertungen,
  type LetzteWabenzahlen,
  StockkartenEintragFelder,
} from "@/components/stockkarten-eintrag-felder";
import { type EintragSteuerung, StockkartenEintragFormular } from "@/components/stockkarten-eintrag-formular";
import { MassnahmeSendenFormular } from "@/components/massnahme-senden-formular";
import { FormularFehler } from "@/components/sicheres-formular";
import { entwurfLesen } from "@/lib/entwurf";
import { MassnahmeFelder } from "@/components/massnahme-felder";
import { FotoAuswahl } from "@/components/foto-auswahl";
import { IconBehandlung, IconMassnahmen, IconWabenrahmen } from "@/components/icons";
import type { OffenerAufsatz, WabenmassAuswahl, ZargeAuswahl } from "@/lib/honig";

type StandVolk = {
  id: string;
  name: string;
  systemId: string | null;
  /// Zeichenfarbe der Königin (Hex) - als Punkt im Volk-Knopf.
  koeniginFarbe: string | null;
  /// Wabenzahlen der letzten Durchsicht - graue Vorgabe in den Stellern.
  letzteDurchsicht?: LetzteWabenzahlen | null;
  /// Wertungen der letzten Durchsichten - als Ring am Bewertungs-Strahl.
  letzteBewertungen?: LetzteBewertungen | null;
};

// Symbol über dem Wort wie bei den Knöpfen der Volkskachel - so passt
// "Durchsicht erfassen" auch am Handy in eine Zeile. Beide Knöpfe gleich
// breit unter dem Kopfbanner des Stands.
// Schrift und Rand schrumpfen auf schmalen Handys mit, sonst bricht "Behandlung" um.
const KNOPF =
  "flex min-w-0 flex-col items-center justify-center gap-1 rounded-xl border border-border bg-card px-1.5 py-3 text-center text-[clamp(0.75rem,3.4vw,0.875rem)] font-medium sm:px-3 shadow-md transition-colors hover:border-accent hover:text-accent";

// Rahmen für beide Popups: erst die Völker wählen, dann - auf einer zweiten
// Seite im selben Dialog - das Formular. Das Formular bleibt dabei die ganze
// Zeit eingehängt (nur ausgeblendet), damit "Völker ändern" nichts von dem
// verliert, was schon eingetragen war. Die gewählten Völker gehen als
// versteckte "volkIds"-Felder mit dem Formular mit.
//
// "✕" und Escape fragen über vorDemSchliessen nach, ob schon Eingegebenes
// verworfen werden soll.
type DialogSteuerung = {
  /// Völker auswählen (beim Wiederherstellen eines Entwurfs).
  auswaehlen: (volkIds: string[]) => void;
  /// Zurück zur Völker-Auswahl, wenn keines gewählt ist.
  auswahlZeigenWennLeer: () => void;
};

// Fester Fuß unten im Dialog: "Abbrechen" und "Speichern" bleiben beim
// Scrollen durch das lange Formular immer in Reichweite. Steht im Formular
// (damit der Speichern-Knopf absendet) und reicht über dessen Ränder bis an
// den Dialogrand (-mx-5/-mb-5 gleichen das p-5 des Dialogs aus; -bottom-5,
// weil "sticky" sonst am Innenabstand des Dialogs hält und darunter ein
// Streifen Formular durchscheint).
// "Abbrechen" fragt wie "✕" nach, wenn schon etwas eingegeben ist.
function DialogFuss({
  vorDemSchliessen,
  children,
}: {
  vorDemSchliessen: () => Promise<boolean>;
  children: React.ReactNode;
}) {
  async function abbrechen(event: React.MouseEvent<HTMLButtonElement>) {
    const dialog = event.currentTarget.closest("dialog");
    if (await vorDemSchliessen()) dialog?.close();
  }
  return (
    <div className="sticky -bottom-5 z-10 -mx-5 -mb-5 flex gap-2 border-t border-border bg-card p-3">
      <Button type="button" variant="secondary" onClick={(event) => void abbrechen(event)}>
        Abbrechen
      </Button>
      {children}
    </div>
  );
}

// Kennung des Knopfs "Durchsicht erfassen" auf der Volk-Seite - darüber
// öffnet der Leer-Zustand des Verlaufs denselben Dialog (siehe
// ErsteDurchsichtKnopf).
const DURCHSICHT_KNOPF_ID = "durchsicht-erfassen";

/// Titel in der Warteschlange: "Durchsicht Volk 1, Volk 2 und 3 weitere".
function durchsichtTitel(gewaehlt: StandVolk[]): string {
  const namen = gewaehlt.map((volk) => volk.name);
  if (namen.length <= 3) return `Durchsicht ${namen.join(", ")}`;
  return `Durchsicht ${namen.slice(0, 2).join(", ")} und ${namen.length - 2} weitere`;
}

function SammelDialog({
  titel,
  knopf,
  knopfId,
  voelker,
  vorgewaehlt,
  koeniginAn = true,
  vorDemSchliessen,
  entwurfSchluessel,
  formular,
}: {
  titel: string;
  knopf: React.ReactNode;
  knopfId?: string;
  voelker: StandVolk[];
  /// Auf der Volk-Seite: dieses Volk ist fest gewählt - der Dialog öffnet
  /// gleich mit dem Formular, ohne die Völker-Auswahl.
  vorgewaehlt?: string;
  /// Bereich "Königinnen" eingeschaltet? Sonst keine Zeichenfarben-Punkte.
  koeniginAn?: boolean;
  /// Liefert false, wenn der Dialog offen bleiben soll.
  vorDemSchliessen?: () => Promise<boolean>;
  /// Liegt dazu ein Entwurf auf dem Gerät, öffnet der Dialog gleich beim
  /// Formular - dort steht der Hinweis zum Weiter-Ausfüllen.
  entwurfSchluessel?: string;
  formular: (gewaehlt: StandVolk[], volkIdFelder: React.ReactNode, steuerung: DialogSteuerung) => React.ReactNode;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [gewaehlt, setGewaehlt] = useState<Set<string>>(() => new Set(vorgewaehlt ? [vorgewaehlt] : []));
  const ohneAuswahl = vorgewaehlt !== undefined;
  const [schritt, setSchritt] = useState<"auswahl" | "formular">(ohneAuswahl ? "formular" : "auswahl");

  const gewaehlteVoelker = voelker.filter((volk) => gewaehlt.has(volk.id));
  const alleGewaehlt = gewaehlt.size === voelker.length;

  function umschalten(volkId: string) {
    setGewaehlt((vorher) => {
      const neu = new Set(vorher);
      if (neu.has(volkId)) neu.delete(volkId);
      else neu.add(volkId);
      return neu;
    });
  }

  function oeffnen() {
    const mitEntwurf = entwurfSchluessel !== undefined && entwurfLesen(entwurfSchluessel) !== null;
    setSchritt(ohneAuswahl || mitEntwurf ? "formular" : "auswahl");
    dialogRef.current?.showModal();
  }

  async function schliessen() {
    if (vorDemSchliessen && !(await vorDemSchliessen())) return;
    dialogRef.current?.close();
  }

  const steuerung: DialogSteuerung = {
    auswaehlen: (volkIds) => {
      const bekannt = volkIds.filter((volkId) => voelker.some((volk) => volk.id === volkId));
      if (!ohneAuswahl && bekannt.length > 0) setGewaehlt(new Set(bekannt));
    },
    auswahlZeigenWennLeer: () => {
      if (!ohneAuswahl && gewaehlt.size === 0) setSchritt("auswahl");
    },
  };

  const volkIdFelder = gewaehlteVoelker.map((volk) => (
    <input key={volk.id} type="hidden" name="volkIds" value={volk.id} />
  ));

  return (
    <>
      <button type="button" data-schreibt id={knopfId} onClick={oeffnen} className={KNOPF}>
        {knopf}
      </button>

      <dialog
        ref={dialogRef}
        onCancel={(event) => {
          // Escape: erst nachfragen, statt sofort alles zu verwerfen.
          if (!vorDemSchliessen) return;
          event.preventDefault();
          void schliessen();
        }}
        // Für die Auswahl reicht ein schmales Popup, das Formular braucht Platz.
        className={`m-auto w-[calc(100%-2rem)] ${schritt === "auswahl" ? "max-w-lg" : "max-w-2xl"} rounded-xl border border-border bg-card p-0 text-foreground shadow-lg backdrop:bg-black/50`}
      >
        <div className="flex max-h-[85vh] flex-col gap-4 overflow-y-auto p-5">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">{titel}</h2>
            <button
              type="button"
              onClick={() => void schliessen()}
              aria-label="Schließen"
              className="flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-full text-xl text-muted hover:text-accent"
            >
              ✕
            </button>
          </div>

          {schritt === "auswahl" ? (
            <div className="flex flex-col gap-4">
              <div className="flex items-end justify-between gap-3">
                <p className="text-3xl font-bold leading-none tracking-tight">
                  {gewaehlt.size}
                  <span className="ml-1.5 text-sm font-medium tracking-normal text-muted">
                    von {voelker.length} {voelker.length === 1 ? "Volk" : "Völkern"}
                  </span>
                </p>
                <button
                  type="button"
                  onClick={() => setGewaehlt(alleGewaehlt ? new Set() : new Set(voelker.map((volk) => volk.id)))}
                  className="cursor-pointer rounded-full border-[1.5px] border-dashed border-accent px-3.5 py-2.5 text-sm font-semibold text-accent"
                >
                  {alleGewaehlt ? "Keine" : "Alle wählen"}
                </button>
              </div>

              {/* Die Völker als runde Knöpfe in der Reihenfolge der Stand-
                  Seite (nach Standposition, wenn so sortiert) - gewählte
                  sind gefüllt. Der Punkt ist die Zeichenfarbe der Königin. */}
              <div className="flex flex-wrap gap-2">
                {voelker.map((volk) => {
                  const an = gewaehlt.has(volk.id);
                  return (
                    <button
                      key={volk.id}
                      type="button"
                      onClick={() => umschalten(volk.id)}
                      aria-pressed={an}
                      className={`inline-flex cursor-pointer items-center gap-2 rounded-full border-[1.5px] py-2 pl-3 pr-4 text-[15px] font-medium ${
                        an ? "border-accent bg-accent text-accent-foreground" : "border-border bg-background"
                      }`}
                    >
                      {koeniginAn && volk.koeniginFarbe && (
                        <span
                          aria-hidden="true"
                          className={`h-3.5 w-3.5 shrink-0 rounded-full border ${an ? "border-white/70" : "border-rand-bedienung"}`}
                          style={{ background: volk.koeniginFarbe }}
                        />
                      )}
                      {volk.name}
                    </button>
                  );
                })}
              </div>

              {koeniginAn && voelker.some((volk) => volk.koeniginFarbe) && (
                <p className="text-xs text-muted">Punkt = Zeichenfarbe der Königin</p>
              )}

              <Button
                type="button"
                className="w-full py-3"
                disabled={gewaehlt.size === 0}
                onClick={() => setSchritt("formular")}
              >
                {gewaehlt.size === 0
                  ? "Erst ein Volk wählen"
                  : `Weiter mit ${gewaehlt.size} ${gewaehlt.size === 1 ? "Volk" : "Völkern"}`}
              </Button>
            </div>
          ) : ohneAuswahl ? null : (
            <div className="flex items-start justify-between gap-3 rounded-md border border-border bg-background px-3 py-2 text-sm">
              <p>
                <span className="text-muted">Für: </span>
                {gewaehlteVoelker.map((volk) => volk.name).join(", ")}
              </p>
              <button
                type="button"
                onClick={() => setSchritt("auswahl")}
                className="shrink-0 text-accent hover:underline"
              >
                ändern
              </button>
            </div>
          )}

          <div className={schritt === "formular" ? "" : "hidden"}>{formular(gewaehlteVoelker, volkIdFelder, steuerung)}</div>
        </div>
      </dialog>
    </>
  );
}

/// Das Volk, auf dessen Seite die Knöpfe stehen - mit allem, was nur der
/// Einzel-Eintrag kennt (Rückfrage zur Königin, aufgesetzte Honigräume,
/// Lagerbuchung nach der Ernte).
type EinzelVolk = {
  id: string;
  koeniginKennung: string | null;
  offeneAufsaetze: OffenerAufsatz[];
  /// Liegt gerade ein Fütterer auf dem Volk?
  fuettererAuf: boolean;
};

// Die zwei Knöpfe unter der Karte auf der Stand-Seite: ein Stockkarten-
// Eintrag bzw. eine Maßnahme für mehrere Völker des Stands auf einmal. Beide
// nutzen dasselbe Formular wie beim einzelnen Volk; gespeichert wird je
// ausgewähltem Volk ein eigener Eintrag bzw. eine eigene Maßnahme, die dann
// im Verlauf des Volkes chronologisch einsortiert erscheint.
//
// Auf der Volk-Seite stehen dieselben Knöpfe, fest für dieses Volk: ohne
// Völker-Auswahl, gleich das Formular - beim Stockkarten-Eintrag der gewohnte
// Einzel-Eintrag (mit Königin-Frage, Honigräumen und Lagerbuchung).
// Gespeichert wird zurück auf die Volk-Seite.
//
// Die `key`-Werte kommen von der Seite und steigen mit jedem Speichern -
// das erzwingt einen frischen Dialog (geschlossen, leer, keine Auswahl).
export function StandSammelAktionen({
  bienenstandId,
  voelker,
  honigraeume,
  wabenmasse,
  jetzt,
  eintragKey,
  massnahmeKey,
  einzelVolk,
  aus = [],
}: {
  bienenstandId: string;
  voelker: StandVolk[];
  honigraeume: ZargeAuswahl[];
  wabenmasse: WabenmassAuswahl[];
  /// Vorbelegung fürs Datum, auf dem Server berechnet - wie auf der Volk-Seite.
  jetzt: string;
  eintragKey: number;
  massnahmeKey: number;
  einzelVolk?: EinzelVolk;
  /// Abgeschaltete Bereiche (Einstellungen -> Bereiche).
  aus?: readonly string[];
}) {
  const eintragSteuerung = useRef<EintragSteuerung>(null);
  const eintragSchliessenPruefen = () => eintragSteuerung.current?.schliessenPruefen() ?? Promise.resolve(true);
  if (voelker.length === 0) return null;

  const eintragAnlegen = stockkartenEintraegeFuerStandAnlegen.bind(null, bienenstandId);
  // Entwurf auf dem Gerät: je Volk bzw. je Stand (Sammel-Eintrag).
  const entwurfSchluessel = einzelVolk ? `entwurf:eintrag:${einzelVolk.id}` : `entwurf:sammel:${bienenstandId}`;
  const zurueckFeld = einzelVolk && <input type="hidden" name="zurueckZuVolk" value={einzelVolk.id} />;

  // Auf der Volk-Seite kommt "Behandlung" als dritter Knopf dazu - die
  // Behandlung selbst wird auf eigener Seite erfasst (Nachweispflicht).
  const behandlungKnopf = !!einzelVolk && !aus.includes("behandlungen");

  return (
    <div className={`grid gap-3 ${behandlungKnopf ? "grid-cols-3" : "grid-cols-2"}`}>
      <SammelDialog
        koeniginAn={!aus.includes("koeniginnen")}
        key={`eintrag-${eintragKey}`}
        titel="Durchsicht erfassen"
        knopfId={einzelVolk ? DURCHSICHT_KNOPF_ID : undefined}
        knopf={
          <>
            <IconWabenrahmen className="h-5 w-5 shrink-0 text-accent" />
            Durchsicht erfassen
          </>
        }
        voelker={voelker}
        vorgewaehlt={einzelVolk?.id}
        vorDemSchliessen={eintragSchliessenPruefen}
        entwurfSchluessel={entwurfSchluessel}
        formular={(gewaehlt, volkIdFelder, dialog) => {
          // Vorgabe aus der letzten Durchsicht nur, wenn es um genau ein Volk
          // geht - bei mehreren Völkern passt keine einzelne Zahl.
          const letzteDurchsicht = gewaehlt.length === 1 ? (gewaehlt[0].letzteDurchsicht ?? null) : null;
          const letzteBewertungen = gewaehlt.length === 1 ? (gewaehlt[0].letzteBewertungen ?? null) : null;
          if (einzelVolk && gewaehlt.length === 1 && gewaehlt[0].id === einzelVolk.id) {
            return (
              <StockkartenEintragFormular
                action={stockkartenEintragAnlegen.bind(null, einzelVolk.id)}
                warteschlange={{ art: "eintrag", ziel: einzelVolk.id, titel: `Durchsicht ${gewaehlt[0].name}` }}
                koeniginKennung={einzelVolk.koeniginKennung}
                istNeuerEintrag
                lagerAn={!aus.includes("lager")}
                className="flex flex-col gap-4"
                entwurfSchluessel={entwurfSchluessel}
                steuerung={eintragSteuerung}
              >
                {(entwurf) => (
                  <>
                    <div>
                      <Label htmlFor="sammel-datum">Datum</Label>
                      <Input
                        id="sammel-datum"
                        name="datum"
                        type="datetime-local"
                        defaultValue={entwurf?.datum ?? jetzt}
                        required
                      />
                    </div>

                    <StockkartenEintragFelder
                      werte={entwurf?.werte}
                      honigraeume={honigraeume}
                      wabenmasse={wabenmasse}
                      offeneAufsaetze={einzelVolk.offeneAufsaetze}
                      eigenesSystemId={gewaehlt[0].systemId}
                      behandlungenAn={!aus.includes("behandlungen")}
                      fuettererAuf={entwurf ? entwurf.fuettererAuf : einzelVolk.fuettererAuf}
                      neu
                      letzteDurchsicht={letzteDurchsicht}
                      letzteBewertungen={letzteBewertungen}
                    />

                    <div>
                      <Label htmlFor="sammel-massnahmenText">Maßnahmen (eine pro Zeile, optional)</Label>
                      <Textarea
                        id="sammel-massnahmenText"
                        name="massnahmenText"
                        rows={2}
                        defaultValue={entwurf?.massnahmenText ?? ""}
                        placeholder={"z.B.\nVarroa-Behandlung durchführen\nFutterwabe nachlegen"}
                      />
                      <p className="mt-1 text-xs text-muted">
                        Termine setzen und einzeln abhaken kannst du danach beim Bearbeiten dieses Eintrags.
                      </p>
                    </div>

                    <div>
                      <p className="mb-1 block text-sm font-medium text-muted">Fotos</p>
                      <FotoAuswahl />
                    </div>

                    <FormularFehler />
                    <DialogFuss vorDemSchliessen={eintragSchliessenPruefen}>
                      <Button type="submit" className="flex-1">
                        Durchsicht speichern
                      </Button>
                    </DialogFuss>
                  </>
                )}
              </StockkartenEintragFormular>
            );
          }

          // Haben alle gewählten Völker dasselbe Beutensystem, stehen dessen
          // Zargen in den Honigraum-Listen oben - wie beim einzelnen Volk.
          const systeme = new Set(gewaehlt.map((volk) => volk.systemId));
          const eigenesSystemId = systeme.size === 1 ? [...systeme][0] : null;
          return (
            // Ohne Königin-Frage und ohne Lagerbuchung: beides hängt am
            // einzelnen Volk (welche Königin, wie viel Honig genau) und wird
            // dort beim Bearbeiten des Eintrags nachgetragen.
            <StockkartenEintragFormular
              action={eintragAnlegen}
              warteschlange={{ art: "sammel", ziel: bienenstandId, titel: durchsichtTitel(gewaehlt) }}
              className="flex flex-col gap-4"
              entwurfSchluessel={entwurfSchluessel}
              steuerung={eintragSteuerung}
              beiWiederherstellen={(entwurf) => dialog.auswaehlen(entwurf.volkIds)}
              beiVerwerfen={dialog.auswahlZeigenWennLeer}
            >
              {(entwurf) => (
                <>
                  {volkIdFelder}
                  {zurueckFeld}
                  <div>
                    <Label htmlFor="sammel-datum">Datum</Label>
                    <Input
                      id="sammel-datum"
                      name="datum"
                      type="datetime-local"
                      defaultValue={entwurf?.datum ?? jetzt}
                      required
                    />
                  </div>

                  <StockkartenEintragFelder
                    werte={entwurf?.werte}
                    honigraeume={honigraeume}
                    wabenmasse={wabenmasse}
                    eigenesSystemId={eigenesSystemId}
                    behandlungenAn={!aus.includes("behandlungen")}
                    fuettererAuf={entwurf?.fuettererAuf}
                    fuettererModus="nurAufsetzen"
                    neu
                    letzteDurchsicht={letzteDurchsicht}
                    letzteBewertungen={letzteBewertungen}
                  />

                  <div>
                    <Label htmlFor="sammel-massnahmenText">Maßnahmen (eine pro Zeile, optional)</Label>
                    <Textarea
                      id="sammel-massnahmenText"
                      name="massnahmenText"
                      rows={2}
                      defaultValue={entwurf?.massnahmenText ?? ""}
                      placeholder={"z.B.\nVarroa-Behandlung durchführen\nFutterwabe nachlegen"}
                    />
                  </div>

                  <div>
                    <p className="mb-1 block text-sm font-medium text-muted">Fotos</p>
                    <FotoAuswahl />
                  </div>

                  <FormularFehler />
                  <DialogFuss vorDemSchliessen={eintragSchliessenPruefen}>
                    <Button type="submit" className="flex-1" disabled={gewaehlt.length === 0}>
                      {gewaehlt.length === 1 ? "Durchsicht speichern" : `${gewaehlt.length} Durchsichten speichern`}
                    </Button>
                  </DialogFuss>
                </>
              )}
            </StockkartenEintragFormular>
          );
        }}
      />

      <SammelDialog
        koeniginAn={!aus.includes("koeniginnen")}
        key={`massnahme-${massnahmeKey}`}
        titel="Neue Maßnahme"
        knopf={
          <>
            <IconMassnahmen className="h-5 w-5 shrink-0 text-accent" />
            Maßnahme
          </>
        }
        voelker={voelker}
        vorgewaehlt={einzelVolk?.id}
        formular={(gewaehlt, volkIdFelder) => (
          <MassnahmeSendenFormular className="flex flex-col gap-3">
            {volkIdFelder}
            <MassnahmeFelder idPraefix="sammel" />
            <div>
              <Button type="submit" disabled={gewaehlt.length === 0}>
                {gewaehlt.length === 1 ? "Maßnahme anlegen" : `${gewaehlt.length} Maßnahmen anlegen`}
              </Button>
            </div>
          </MassnahmeSendenFormular>
        )}
      />

      {behandlungKnopf && (
        <Link href={`/behandlungen/neu?volk=${einzelVolk.id}`} className={KNOPF}>
          <IconBehandlung className="h-5 w-5 shrink-0 text-accent" />
          {"Behand\u00ADlung"}
        </Link>
      )}
    </div>
  );
}

// Leer-Zustand im Verlauf der Volk-Seite: öffnet denselben Dialog wie der
// Knopf "Durchsicht erfassen" darüber - mit Entwurf, Rückfragen und allem,
// statt ein zweites Formular einzuhängen.
export function ErsteDurchsichtKnopf() {
  return (
    <Button type="button" data-schreibt onClick={() => document.getElementById(DURCHSICHT_KNOPF_ID)?.click()}>
      Erste Durchsicht erfassen
    </Button>
  );
}
