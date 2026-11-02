"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Button, Input, Label, Select } from "@/components/ui";
import { bitImportAusfuehren, type ImportErgebnis } from "@/lib/bit-import-actions";
import { stockkarteAusPdf } from "@/lib/bit-import/pdf-lesen";
import { datumDeutsch, istBrutentnahme, mittelSchluessel, planErstellen, STANDARD_OPTIONEN, type Optionen } from "@/lib/bit-import/plan";
import type { BitStockkarte } from "@/lib/bit-import/typen";

type Stand = { id: string; name: string; voelker: { id: string; name: string }[] };
type Medikament = { id: string; name: string };
type Benutzer = { id: string; name: string };

type Datei = {
  schluessel: string;
  name: string;
  status: "liest" | "fertig" | "fehler";
  fehler: string;
  karte: BitStockkarte | null;
  /// Id eines vorhandenen Volkes oder "neu".
  volk: string;
  neuerName: string;
  /// Id eines vorhandenen Bienenstands oder "neu".
  stand: string;
  neuerStand: string;
  optionen: Optionen;
  ergebnis: ImportErgebnis | null;
};

function regexSicher(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/// Welches Volk der App gehört zu dieser Stockkarte? Gleicher Standname und
/// eine Stocknummer, die am Ende des Volksnamens steht ("Stock 1", "1").
function vorschlagFuer(karte: BitStockkarte, staende: Stand[]) {
  const nummer = karte.stocknummer.trim();
  const stand = staende.find((s) => s.name.trim().toLowerCase() === karte.stand.trim().toLowerCase());
  if (stand) {
    const muster = new RegExp(`(^|[^0-9A-Za-z])0*${regexSicher(nummer)}$`, "i");
    const treffer = stand.voelker.filter((volk) => volk.name.trim().toLowerCase() === nummer.toLowerCase() || muster.test(volk.name.trim()));
    if (treffer.length === 1) return { volk: treffer[0].id, stand: stand.id };
  }
  return { volk: "neu", stand: stand ? stand.id : "neu" };
}

export function BitImportFormular({
  staende,
  medikamente,
  benutzer,
  adminName,
}: {
  staende: Stand[];
  medikamente: Medikament[];
  benutzer: Benutzer[];
  adminName: string;
}) {
  const [dateien, setDateien] = useState<Datei[]>([]);
  const [wer, setWer] = useState("admin");
  const [medikamentWahl, setMedikamentWahl] = useState<Record<string, string>>({});
  const [laeuft, setLaeuft] = useState(false);

  const aendern = (schluessel: string, teil: Partial<Datei>) =>
    setDateien((alle) => alle.map((datei) => (datei.schluessel === schluessel ? { ...datei, ...teil } : datei)));

  async function dateienWaehlen(liste: FileList | null) {
    if (!liste) return;
    const neue = Array.from(liste).filter((datei) => !dateien.some((vorhanden) => vorhanden.schluessel === schluesselVon(datei)));
    setDateien((alle) => [
      ...alle,
      ...neue.map<Datei>((datei) => ({
        schluessel: schluesselVon(datei),
        name: datei.name,
        status: "liest",
        fehler: "",
        karte: null,
        volk: "neu",
        neuerName: "",
        stand: "neu",
        neuerStand: "",
        optionen: { ...STANDARD_OPTIONEN },
        ergebnis: null,
      })),
    ]);
    for (const datei of neue) {
      try {
        const karte = await stockkarteAusPdf(datei);
        const vorschlag = vorschlagFuer(karte, staende);
        aendern(schluesselVon(datei), {
          status: "fertig",
          karte,
          volk: vorschlag.volk,
          stand: vorschlag.stand,
          neuerName: `Stock ${karte.stocknummer}`.slice(0, 40),
          neuerStand: karte.stand.slice(0, 40),
        });
        // Mittel, die es in der App schon gibt, vorauswählen.
        setMedikamentWahl((bisher) => {
          const neu = { ...bisher };
          for (const behandlung of karte.behandlungen) {
            const schluessel = mittelSchluessel(behandlung.mittel);
            if (!behandlung.mittel || schluessel in neu) continue;
            neu[schluessel] = medikamente.find((m) => mittelSchluessel(m.name) === schluessel)?.id ?? "neu";
          }
          return neu;
        });
      } catch {
        aendern(schluesselVon(datei), { status: "fehler", fehler: "Diese PDF konnte nicht gelesen werden." });
      }
    }
  }

  const bereit = dateien.filter((datei) => datei.status === "fertig" && datei.karte && !datei.ergebnis);
  const ungueltig = (datei: Datei) =>
    datei.volk === "neu" && (datei.neuerName.trim() === "" || (datei.stand === "neu" && datei.neuerStand.trim() === ""));

  const verschiedeneMittel: [string, string][] = [];
  for (const datei of bereit) {
    if (!datei.optionen.behandlungen || !datei.karte) continue;
    for (const behandlung of datei.karte.behandlungen) {
      if (!behandlung.mittel || istBrutentnahme(behandlung)) continue;
      const schluessel = mittelSchluessel(behandlung.mittel);
      if (!verschiedeneMittel.some(([vorhanden]) => vorhanden === schluessel)) verschiedeneMittel.push([schluessel, behandlung.mittel]);
    }
  }

  async function importieren() {
    setLaeuft(true);
    for (const datei of bereit) {
      if (!datei.karte || ungueltig(datei)) continue;
      aendern(datei.schluessel, { ergebnis: null });
      const ergebnis = await bitImportAusfuehren({
        karte: datei.karte,
        volk:
          datei.volk === "neu"
            ? {
                art: "neu",
                name: datei.neuerName,
                bienenstandId: datei.stand === "neu" ? null : datei.stand,
                neuerStandName: datei.neuerStand,
              }
            : { art: "vorhanden", volkId: datei.volk },
        wer,
        optionen: datei.optionen,
        medikamente: medikamentWahl,
      }).catch(() => ({ fehler: "Keine Verbindung zum Server. Bitte noch einmal versuchen." }) as ImportErgebnis);
      aendern(datei.schluessel, { ergebnis });
    }
    setLaeuft(false);
  }

  return (
    <div className="flex flex-col gap-5">
      <div>
        <Label htmlFor="bit-dateien">PDF-Stockkarten aus BeeInTouch</Label>
        <input
          id="bit-dateien"
          type="file"
          accept="application/pdf,.pdf"
          multiple
          onChange={(ereignis) => {
            void dateienWaehlen(ereignis.target.files);
            ereignis.target.value = "";
          }}
          className="block w-full text-sm file:mr-3 file:rounded-md file:border file:border-rand-ruhig file:bg-card file:px-4 file:py-2 file:text-sm file:font-medium"
        />
        <p className="mt-1 text-xs text-muted">
          Du kannst mehrere PDFs auf einmal wählen. Die Dateien werden nur in deinem Browser gelesen und nicht hochgeladen.
        </p>
      </div>

      {dateien.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label htmlFor="bit-wer">Wem sollen die Einträge zugeschrieben werden?</Label>
            <Select id="bit-wer" value={wer} onChange={(e) => setWer(e.target.value)}>
              <option value="admin">{adminName} (Admin)</option>
              {benutzer.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name} (Helfer)
                </option>
              ))}
            </Select>
            <p className="mt-1 text-xs text-muted">
              Der Name steht als Anwender bei Behandlungen und in der Historie. Die Stockkarten-Einträge selbst führen keinen
              Namen.
            </p>
          </div>
        </div>
      )}

      {verschiedeneMittel.length > 0 && (
        <div className="rounded-md border border-border p-3">
          <p className="mb-1 text-sm font-medium">Medikamente</p>
          <p className="mb-3 text-xs text-muted">
            Behandlungen brauchen ein Medikament aus der Liste der App. Wähle ein vorhandenes, oder die App legt ein neues
            an. Dort fehlen dann Lieferant, Beleg und Charge, die du später unter „Medikamente“ ergänzt.
          </p>
          <div className="flex flex-col gap-3">
            {verschiedeneMittel.map(([schluessel, name]) => (
              <div key={schluessel} className="grid items-center gap-2 sm:grid-cols-[1fr_1fr]">
                <span className="text-sm">{name}</span>
                <Select
                  aria-label={`Medikament für ${name}`}
                  value={medikamentWahl[schluessel] ?? "neu"}
                  onChange={(e) => setMedikamentWahl((bisher) => ({ ...bisher, [schluessel]: e.target.value }))}
                >
                  {medikamente.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                    </option>
                  ))}
                  <option value="neu">Neu anlegen</option>
                </Select>
              </div>
            ))}
          </div>
        </div>
      )}

      {dateien.map((datei) => (
        <DateiKarte key={datei.schluessel} datei={datei} staende={staende} aendern={aendern} ungueltig={ungueltig(datei)} />
      ))}

      {bereit.length > 0 && (
        <div className="flex flex-col gap-2">
          <p className="rounded-md border border-border bg-background px-3 py-2 text-xs text-muted">
            Behandlungen mit Medikament gehören zum Bestandsbuch: Sie lassen sich später nur stornieren, nicht ändern. Prüfe
            Mittel, Datum und Mengen darum vorher in der Vorschau.
          </p>
          <div>
            <Button type="button" onClick={importieren} disabled={laeuft || bereit.every((datei) => ungueltig(datei))}>
              {laeuft ? "Importiere ..." : bereit.length === 1 ? "Importieren" : `${bereit.length} Stockkarten importieren`}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function schluesselVon(datei: File): string {
  return `${datei.name}-${datei.size}-${datei.lastModified}`;
}

function DateiKarte({
  datei,
  staende,
  aendern,
  ungueltig,
}: {
  datei: Datei;
  staende: Stand[];
  aendern: (schluessel: string, teil: Partial<Datei>) => void;
  ungueltig: boolean;
}) {
  const karte = datei.karte;
  const plan = useMemo(() => (karte ? planErstellen(karte, datei.optionen) : null), [karte, datei.optionen]);
  const ergebnis = datei.ergebnis;

  return (
    <div className="rounded-xl border border-border p-4">
      <p className="text-xs text-muted">{datei.name}</p>
      {datei.status === "liest" && <p className="mt-1 text-sm">Wird gelesen ...</p>}
      {datei.status === "fehler" && (
        <p className="mt-2 rounded-md border border-gefahr-rand bg-gefahr-flaeche px-3 py-2 text-sm text-gefahr">{datei.fehler}</p>
      )}

      {karte && plan && (
        <div className="mt-1 flex flex-col gap-4">
          <div>
            <h2 className="text-lg font-semibold">
              Stock {karte.stocknummer}
              {karte.stand ? ` · ${karte.stand}` : ""}
            </h2>
            {karte.warnungen.map((warnung) => (
              <p key={warnung} className="mt-1 text-sm text-gefahr">
                {warnung}
              </p>
            ))}
          </div>

          {!ergebnis && (
            <>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <Label htmlFor={`volk-${datei.schluessel}`}>Volk in der App</Label>
                  <Select
                    id={`volk-${datei.schluessel}`}
                    value={datei.volk}
                    onChange={(e) => aendern(datei.schluessel, { volk: e.target.value })}
                  >
                    <option value="neu">Neues Volk anlegen</option>
                    {staende.map((stand) => (
                      <optgroup key={stand.id} label={stand.name}>
                        {stand.voelker.map((volk) => (
                          <option key={volk.id} value={volk.id}>
                            {volk.name}
                          </option>
                        ))}
                      </optgroup>
                    ))}
                  </Select>
                </div>
                {datei.volk === "neu" && (
                  <>
                    <div>
                      <Label htmlFor={`name-${datei.schluessel}`}>Name des neuen Volkes</Label>
                      <Input
                        id={`name-${datei.schluessel}`}
                        name="name"
                        value={datei.neuerName}
                        onChange={(e) => aendern(datei.schluessel, { neuerName: e.target.value })}
                      />
                    </div>
                    <div>
                      <Label htmlFor={`stand-${datei.schluessel}`}>Bienenstand</Label>
                      <Select
                        id={`stand-${datei.schluessel}`}
                        value={datei.stand}
                        onChange={(e) => aendern(datei.schluessel, { stand: e.target.value })}
                      >
                        {staende.map((stand) => (
                          <option key={stand.id} value={stand.id}>
                            {stand.name}
                          </option>
                        ))}
                        <option value="neu">Neuer Stand</option>
                      </Select>
                    </div>
                    {datei.stand === "neu" && (
                      <div>
                        <Label htmlFor={`neuerstand-${datei.schluessel}`}>Name des neuen Stands</Label>
                        <Input
                          id={`neuerstand-${datei.schluessel}`}
                          name="name"
                          value={datei.neuerStand}
                          onChange={(e) => aendern(datei.schluessel, { neuerStand: e.target.value })}
                        />
                      </div>
                    )}
                  </>
                )}
              </div>

              <div>
                <p className="mb-2 text-sm font-medium text-muted">Was soll übernommen werden?</p>
                <div className="grid gap-2 sm:grid-cols-2">
                  <Haken datei={datei} aendern={aendern} feld="durchschauen" text={`Durchschauen (${karte.durchschauen.length})`} />
                  <Haken datei={datei} aendern={aendern} feld="fuetterungen" text={`Fütterungen (${karte.fuetterungen.length})`} />
                  <Haken datei={datei} aendern={aendern} feld="behandlungen" text={`Behandlungen (${karte.behandlungen.length})`} />
                  <Haken datei={datei} aendern={aendern} feld="honigernten" text={`Honigernten (${karte.honigernten.length})`} />
                  <Haken datei={datei} aendern={aendern} feld="varroakontrollen" text={`Varroakontrollen (${karte.varroakontrollen.length})`} />
                  <Haken datei={datei} aendern={aendern} feld="koenigin" text="Königin aus dem Kopf der Karte" />
                </div>
              </div>

              <div className="text-sm">
                <p>
                  Es werden <b>{plan.eintraege.length}</b> Einträge, <b>{plan.behandlungen.length}</b> Behandlungen
                  {plan.verfahren.length > 0 ? `, ${plan.verfahren.length} Totale Brutentnahme` : ""}
                  {plan.koenigin ? " und eine Königin" : ""} angelegt.
                </p>
                {ungueltig && <p className="mt-1 text-gefahr">Bitte Namen für das neue Volk und den Stand angeben.</p>}
                <details className="mt-2">
                  <summary className="cursor-pointer text-muted">Vorschau ansehen</summary>
                  <div className="mt-2 max-h-80 overflow-auto rounded-md border border-border p-2 text-xs">
                    {plan.behandlungen.length > 0 && (
                      <ul className="mb-2 flex flex-col gap-1">
                        {plan.behandlungen.map((b) => (
                          <li key={b.schluessel}>
                            <b>{datumDeutsch(b.datum)}</b> Behandlung: {b.mittel}, {b.methode || "ohne Methode"}, {b.menge} {b.einheit}
                            {b.mengeFehlt ? " (Menge fehlt in der PDF)" : ""}
                          </li>
                        ))}
                      </ul>
                    )}
                    {plan.verfahren.map((v) => (
                      <p key={v.schluessel} className="mb-1">
                        <b>{datumDeutsch(v.datum)}</b> Totale Brutentnahme
                      </p>
                    ))}
                    <ul className="flex flex-col gap-1">
                      {plan.eintraege.map((eintrag) => (
                        <li key={eintrag.sendungId}>
                          <b>{datumDeutsch(eintrag.datum)}</b> {eintrag.kurz}
                        </li>
                      ))}
                    </ul>
                    {plan.uebersprungen.length > 0 && (
                      <ul className="mt-2 flex flex-col gap-1 text-muted">
                        {plan.uebersprungen.map((zeile) => (
                          <li key={zeile}>Nicht übernommen: {zeile}</li>
                        ))}
                      </ul>
                    )}
                  </div>
                </details>
              </div>
            </>
          )}

          {ergebnis && "fehler" in ergebnis && (
            <p className="rounded-md border border-gefahr-rand bg-gefahr-flaeche px-3 py-2 text-sm text-gefahr">{ergebnis.fehler}</p>
          )}
          {ergebnis && "ok" in ergebnis && (
            <div className="rounded-md border border-ok-rand bg-ok-flaeche px-3 py-2 text-sm text-ok">
              <p className="font-medium">
                Fertig{ergebnis.neuesVolk ? ` - Volk „${ergebnis.volkName}“ wurde neu angelegt` : ` für „${ergebnis.volkName}“`}.
              </p>
              <p className="mt-1">
                Angelegt: {ergebnis.angelegt.eintraege} Einträge, {ergebnis.angelegt.behandlungen} Behandlungen
                {ergebnis.angelegt.verfahren > 0 ? `, ${ergebnis.angelegt.verfahren} Totale Brutentnahme` : ""}
                {ergebnis.angelegt.koenigin ? ", die Königin" : ""}
                {ergebnis.angelegt.medikamente > 0 ? `, ${ergebnis.angelegt.medikamente} neue Medikamente` : ""}.
              </p>
              {ergebnis.vorhanden.eintraege + ergebnis.vorhanden.behandlungen + ergebnis.vorhanden.verfahren > 0 && (
                <p className="mt-1">
                  Schon vorhanden und nicht noch einmal angelegt: {ergebnis.vorhanden.eintraege} Einträge,{" "}
                  {ergebnis.vorhanden.behandlungen} Behandlungen.
                </p>
              )}
              {ergebnis.hinweise.map((hinweis) => (
                <p key={hinweis} className="mt-1">
                  {hinweis}
                </p>
              ))}
              <p className="mt-2">
                <Link href={`/voelker/${ergebnis.volkId}`} className="underline">
                  Zum Volk
                </Link>
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Haken({
  datei,
  aendern,
  feld,
  text,
}: {
  datei: Datei;
  aendern: (schluessel: string, teil: Partial<Datei>) => void;
  feld: keyof Optionen;
  text: string;
}) {
  return (
    <label className="flex items-start gap-2 text-sm">
      <input
        type="checkbox"
        checked={datei.optionen[feld]}
        onChange={(e) => aendern(datei.schluessel, { optionen: { ...datei.optionen, [feld]: e.target.checked } })}
        className="mt-0.5 h-4 w-4"
      />
      <span>{text}</span>
    </label>
  );
}
