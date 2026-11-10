import { bereichAn } from "@/lib/bereiche";
import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { volkAktualisieren, volkArchivieren, volkReaktivieren, volkLoeschen } from "@/lib/actions";
import { Card, Label, Input, Select, Textarea, Button } from "@/components/ui";
import { FormularFehler, SicheresFormular, SpeichernKnopf } from "@/components/sicheres-formular";
import { BrutraumAuswahl } from "@/components/brutraum-auswahl";
import { DeckelAuswahl } from "@/components/deckel-auswahl";
import { WabenStartFelder } from "@/components/waben-start-felder";
import { wabenbestandLaden, wabenSeitErfassungGeaendert } from "@/lib/wabenbestand";
import { kurzesDatum } from "@/lib/honig";
import { EinzelfotoAuswahl } from "@/components/einzelfoto-auswahl";
import { KoeniginSchnellangaben } from "@/components/koenigin-schnellangaben";
import { beutenStammdatenLaden } from "@/lib/beuten";
import { klimadeckelAuswahlListe } from "@/lib/lager";
import { LoeschenBestaetigen } from "@/components/loeschen-bestaetigen";
import { KoeniginStern } from "@/components/koenigin-stern";
import { behandlungenAmVolk, sperrtextVolk } from "@/lib/bestandsbuch-sperre";
import { SeitenNavigation } from "@/components/seiten-navigation";
import { WAAGEN_HERSTELLER_LABEL } from "@/lib/waagen";

export default async function VolkBearbeitenPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ von?: string }>;
}) {
  const { id } = await params;
  const koeniginAn = await bereichAn("koeniginnen");
  // Aufgerufen über den Stift auf der Volkskachel der Standübersicht - dann
  // führen Zurück, Speichern und Archivieren wieder dorthin.
  const vomStand = (await searchParams).von === "stand";

  const volk = await prisma.volk.findUnique({
    where: { id },
    include: {
      bienenstand: true,
      koenigin: {
        select: { id: true, kennung: true, jahrgang: true, zeichenFarbe: true, zeichenNummer: true, stern: true },
      },
      _count: { select: { eintraege: true } },
    },
  });

  if (!volk) {
    notFound();
  }

  const [{ brutraeume }, klimadeckel] = await Promise.all([
    beutenStammdatenLaden(),
    klimadeckelAuswahlListe(),
  ]);
  // Für den Standortwechsel - alle Stände außer archivierten, den aktuellen
  // eingeschlossen, damit die Auswahl nie den eigenen Stand vermissen lässt.
  const alleBienenstaende = await prisma.bienenstand.findMany({
    where: { OR: [{ archiviert: false }, { id: volk.bienenstandId }] },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });

  // Wabenbestand: erfasst oder nicht, und ob sich seitdem etwas getan hat -
  // dann passt die Aufteilung je Art nicht mehr und wird beim Korrigieren
  // nicht vorbelegt.
  const wabenStandAm = volk.wabenStandAm;
  const [wabenBestand, wabenGeaendert] = wabenStandAm
    ? await Promise.all([wabenbestandLaden(volk.id), wabenSeitErfassungGeaendert(volk.id, wabenStandAm)])
    : [null, false];
  const wabenVorgabe = wabenStandAm && !wabenGeaendert
    ? {
        wabenBrut: volk.wabenBrut,
        wabenFutter: volk.wabenFutter,
        wabenLeer: volk.wabenLeer,
        wabenMittelwaende: volk.wabenMittelwaende,
      }
    : {};
  const waagenAn = await bereichAn("waagen");
  const waagen = waagenAn
    ? await prisma.waage.findMany({ orderBy: { createdAt: "asc" }, include: { volk: { select: { name: true } } } })
    : [];

  const aktualisieren = volkAktualisieren.bind(null, volk.id);
  const archivieren = volkArchivieren.bind(null, volk.id);
  const reaktivieren = volkReaktivieren.bind(null, volk.id);
  const behandlungen = await behandlungenAmVolk(volk.id);
  const loeschen = volkLoeschen.bind(null, volk.id);
  const zurueckFeld = vomStand && <input type="hidden" name="zurueck" value="stand" />;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <SeitenNavigation pfad={[
            { href: `/bienenstaende/${volk.bienenstandId}`, label: volk.bienenstand.name },
            { href: `/voelker/${volk.id}`, label: volk.name },
          ]} className="mb-2" />
        <h1 className="text-2xl font-semibold tracking-tight">Volk bearbeiten</h1>
      </div>

      <Card>
        <SicheresFormular action={aktualisieren} className="flex flex-col gap-4">
          {zurueckFeld}
          <div>
            <Label htmlFor="name">Name / Stocknummer</Label>
            <Input id="name" name="name" required defaultValue={volk.name} />
          </div>
          <div>
            <Label htmlFor="rasse">Rasse</Label>
            <Input id="rasse" name="rasse" defaultValue={volk.rasse ?? ""} />
          </div>
          {koeniginAn && (
            <>
          <KoeniginSchnellangaben
            jahrgang={volk.koenigin?.jahrgang ?? null}
            zeichenFarbe={volk.koenigin?.zeichenFarbe ?? null}
            zeichenNummer={volk.koenigin?.zeichenNummer ?? null}
          />
          {volk.koenigin ? (
            // Die Felder ändern die Königin, die jetzt drinsitzt. Wer sie hier
            // für eine neue überschreibt, verfälscht Lebenslauf und Bewertungen
            // der alten - deshalb der Weg zum Umweiseln gleich daneben.
            <p className="-mt-1 text-xs text-muted">
              Nur zum Korrigieren der jetzigen Königin{" "}
              <Link href={`/koeniginnen/${volk.koenigin.id}`} className="text-accent hover:underline">{volk.koenigin.kennung}</Link>
              {volk.koenigin.stern && <> <KoeniginStern className="h-7 w-7" /></>}. Neue Königin im Volk?{" "}
              <Link href={`/voelker/${volk.id}`} className="font-semibold text-accent hover:underline">
                Auf der Volk-Seite „Umweiseln“ wählen
              </Link>
              .
            </p>
          ) : (
            <p className="-mt-1 text-xs text-muted">
              Schnellangaben zur Königin. Abstammung, Begattung und Verbleib stehen auf ihrer eigenen Seite.
            </p>
          )}
            </>
          )}
          <div>
            <Label htmlFor="bienenstandId">Bienenstand</Label>
            <Select id="bienenstandId" name="bienenstandId" defaultValue={volk.bienenstandId}>
              {alleBienenstaende.map((stand) => (
                <option key={stand.id} value={stand.id}>
                  {stand.name}
                </option>
              ))}
            </Select>
            <p className="mt-1 text-xs text-muted">
              Anderen Stand wählen, wenn das Volk umzieht. Es erscheint dann mit der ganzen
              Stockkarte dort.
            </p>
          </div>
          {waagenAn && (
            <div>
              <Label htmlFor="waageId">Waage</Label>
              <Select id="waageId" name="waageId" defaultValue={waagen.find((w) => w.volkId === volk.id)?.id ?? ""}>
                <option value="">Keine Waage</option>
                {waagen.map((waage) => (
                  <option key={waage.id} value={waage.id}>
                    {WAAGEN_HERSTELLER_LABEL[waage.hersteller]} {waage.name || waage.kennung}
                    {waage.volk && waage.volkId !== volk.id ? ` (jetzt bei ${waage.volk.name})` : ""}
                  </option>
                ))}
              </Select>
              <p className="mt-1 text-xs text-muted">Neue Waagen legst du unter Einstellungen → Waagen an.</p>
            </div>
          )}
          <BrutraumAuswahl
            brutraeume={brutraeume}
            zargeId={volk.brutraumZargeId}
            zargenAnzahl={volk.brutraumZargenAnzahl}
          />
          <fieldset id="waben" className="flex scroll-mt-24 flex-col gap-2">
            <legend className="mb-1 text-sm font-medium">Waben im Brutraum</legend>
            {wabenStandAm === null ? (
              <>
                <p className="rounded-md border border-warnung-rand bg-warnung-flaeche p-3 text-sm text-warnung">
                  Noch nicht erfasst. Trag ein, was jetzt im Brutraum hängt. Erst dann kann die Durchsicht
                  prüfen, ob genug Waben zum Entnehmen da sind.
                </p>
                <WabenStartFelder brutraeume={brutraeume} />
              </>
            ) : (
              <>
                <p className="-mt-1 text-sm text-muted">
                  Jetzt <span className="font-semibold text-foreground">{wabenBestand} Waben</span> in der Beute.
                  Erfasst am {kurzesDatum(wabenStandAm)}
                  {wabenGeaendert ? ", seitdem mit den Durchsichten verrechnet." : "."}
                </p>
                <details className="group rounded-md border border-border p-3" open={!wabenGeaendert}>
                  <summary className="cursor-pointer text-sm font-medium text-accent">
                    {wabenGeaendert ? "Ist-Stand neu erfassen" : "Waben korrigieren"}
                  </summary>
                  <p className="mb-3 mt-2 text-xs text-muted">
                    {wabenGeaendert
                      ? "Trag ein, was jetzt im Brutraum hängt. Leer lassen ändert nichts."
                      : "Die Werte vom Erfassen. Ändern und speichern setzt den Stand neu."}
                  </p>
                  <WabenStartFelder brutraeume={brutraeume} werte={wabenVorgabe} />
                </details>
              </>
            )}
          </fieldset>
          <DeckelAuswahl klimadeckel={klimadeckel} klimadeckelId={volk.klimadeckelId} />
          <EinzelfotoAuswahl
            name="beuteFoto"
            label="Foto der Beute"
            bestehendeUrl={volk.beuteFotoDateiname ? `/bilder/${volk.beuteFotoDateiname}` : null}
            entfernenName="beuteFotoEntfernen"
          />
          <div>
            <Label htmlFor="notizen">Notizen</Label>
            <Textarea id="notizen" name="notizen" rows={3} defaultValue={volk.notizen ?? ""} />
          </div>
          <FormularFehler />
          <div>
            <SpeichernKnopf>Speichern</SpeichernKnopf>
          </div>
        </SicheresFormular>
      </Card>

      <Card>
        <h2 className="mb-2 text-lg font-semibold">
          {volk.archiviert ? "Volk ist archiviert" : "Volk archivieren"}
        </h2>
        <p className="mb-3 text-sm text-muted">
          {volk.archiviert
            ? "Dieses Volk erscheint nicht mehr in der Übersicht des Bienenstands. Die Stockkarte bleibt vollständig erhalten."
            : "Verschwindet aus der Völkerliste. Die Stockkarte mit Verlauf und Fotos bleibt erhalten, das Volk lässt sich jederzeit wiederherstellen. Sinnvoll z.B., wenn ein Volk eingegangen ist oder abgegeben wurde."}
        </p>
        <form action={volk.archiviert ? reaktivieren : archivieren}>
          {zurueckFeld}
          <Button type="submit" variant="secondary">
            {volk.archiviert ? "Wiederherstellen" : "Archivieren"}
          </Button>
        </form>
      </Card>

      <Card className="border-gefahr-rand">
        <h2 className="mb-2 text-lg font-semibold">Endgültig löschen</h2>
        {behandlungen > 0 ? (
          <p role="alert" className="text-sm">
            <strong>Löschen nicht möglich.</strong>{" "}
            {sperrtextVolk(behandlungen).replace("Löschen nicht möglich. ", "")}
          </p>
        ) : (
        <>
        <p className="mb-3 text-sm text-muted">
          Nur nötig, wenn die Daten wirklich unwiderruflich weg sollen. In fast allen Fällen reicht
          Archivieren oben.
        </p>
        <LoeschenBestaetigen
          action={loeschen}
          knopfText="Volk endgültig löschen"
          frage={`Volk "${volk.name}" wirklich löschen?`}
          hinweis={
            volk._count.eintraege > 0
              ? `Das Volk wird mit ${
                  volk._count.eintraege === 1
                    ? "dem 1 Stockkarten-Eintrag"
                    : `den ${volk._count.eintraege} Stockkarten-Einträgen`
                } und deren Fotos unwiderruflich gelöscht.`
              : "Das Volk wird unwiderruflich gelöscht."
          }
        />
        </>
        )}
      </Card>
    </div>
  );
}
