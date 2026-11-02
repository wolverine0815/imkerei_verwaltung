import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { bereichAn } from "@/lib/bereiche";
import { wetterWaageLaden } from "@/lib/waagen";
import { bienenstandAktualisieren, bienenstandArchivieren, bienenstandReaktivieren } from "@/lib/actions";
import { Card, Label, Input, Select, Textarea, Button } from "@/components/ui";
import { FormularFehler, SicheresFormular, SpeichernKnopf } from "@/components/sicheres-formular";
import { StandortKarte } from "@/components/standort-karte";
import { EinzelfotoAuswahl } from "@/components/einzelfoto-auswahl";
import { StandtypAuswahl } from "@/components/standtyp";
import { SeitenNavigation } from "@/components/seiten-navigation";

export default async function BienenstandBearbeitenPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const bienenstand = await prisma.bienenstand.findUnique({
    where: { id },
    include: { _count: { select: { voelker: true } } },
  });

  if (!bienenstand) {
    notFound();
  }

  const { waagen } = (await bereichAn("waagen")) ? await wetterWaageLaden(bienenstand.id) : { waagen: [] };

  const aktualisieren = bienenstandAktualisieren.bind(null, bienenstand.id);
  const archivieren = bienenstandArchivieren.bind(null, bienenstand.id);
  const reaktivieren = bienenstandReaktivieren.bind(null, bienenstand.id);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <SeitenNavigation pfad={[{ href: `/bienenstaende/${bienenstand.id}`, label: bienenstand.name }]} className="mb-2" />
        <h1 className="text-2xl font-semibold tracking-tight">Bienenstand bearbeiten</h1>
      </div>

      <Card>
        <SicheresFormular action={aktualisieren} className="flex flex-col gap-4">
          <div>
            <Label htmlFor="name">Name</Label>
            <Input id="name" name="name" required defaultValue={bienenstand.name} />
          </div>
          <StandtypAuswahl standardwert={bienenstand.standtyp} />
          <StandortKarte
            initialStrasse={bienenstand.strasse ?? ""}
            initialOrt={bienenstand.ort ?? ""}
            initialBreitengrad={bienenstand.breitengrad}
            initialLaengengrad={bienenstand.laengengrad}
          />
          {waagen.length > 1 && (
            <div>
              <Label htmlFor="wetterWaageId">Waage für die GTS</Label>
              <Select id="wetterWaageId" name="wetterWaageId" defaultValue={bienenstand.wetterWaageId ?? ""}>
                <option value="">Automatisch (zuerst angelegte Waage)</option>
                {waagen.map((waage) => (
                  <option key={waage.id} value={waage.id}>
                    {waage.name || waage.kennung}
                    {waage.volk ? ` (${waage.volk.name})` : ""}
                  </option>
                ))}
              </Select>
            </div>
          )}
          <div>
            <Label htmlFor="notizen">Notizen</Label>
            <Textarea id="notizen" name="notizen" rows={3} defaultValue={bienenstand.notizen ?? ""} />
          </div>
          <EinzelfotoAuswahl
            name="standortFoto"
            label="Foto des Standorts"
            bestehendeUrl={bienenstand.standortFotoDateiname ? `/bilder/${bienenstand.standortFotoDateiname}` : null}
            entfernenName="standortFotoEntfernen"
          />
          <FormularFehler />
          <div>
            <SpeichernKnopf>Speichern</SpeichernKnopf>
          </div>
        </SicheresFormular>
      </Card>

      <Card>
        <h2 className="mb-2 text-lg font-semibold">
          {bienenstand.archiviert ? "Bienenstand ist archiviert" : "Bienenstand archivieren"}
        </h2>
        <p className="mb-3 text-sm text-muted">
          {bienenstand.archiviert
            ? "Dieser Bienenstand erscheint nicht mehr in der Übersicht. Alle Daten sind weiterhin vorhanden."
            : "Verschwindet aus der Übersicht. Alle Völker und Stockkarten bleiben erhalten, du kannst den Stand jederzeit wiederherstellen."}
        </p>
        <form action={bienenstand.archiviert ? reaktivieren : archivieren}>
          <Button type="submit" variant="secondary">
            {bienenstand.archiviert ? "Wiederherstellen" : "Archivieren"}
          </Button>
        </form>
      </Card>

      <Card className="border-gefahr-rand">
        <h2 className="mb-2 text-lg font-semibold">Endgültig löschen</h2>
        <p className="mb-3 text-sm text-muted">
          Nur nötig, wenn die Daten wirklich unwiderruflich weg sollen. In fast allen Fällen reicht
          Archivieren oben.
        </p>
        <Link
          href={`/bienenstaende/${bienenstand.id}/loeschen`}
          className="inline-flex items-center justify-center rounded-md border border-gefahr px-4 py-2 text-sm font-medium text-gefahr transition-colors hover:bg-gefahr-flaeche"
        >
          Zur endgültigen Löschung
        </Link>
      </Card>
    </div>
  );
}
