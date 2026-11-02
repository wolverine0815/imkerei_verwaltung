import Link from "next/link";
import { Card } from "@/components/ui";
import { GtsKarte } from "@/components/gts-karte";
import { SeitenNavigation } from "@/components/seiten-navigation";
import { WaagenVergleich, type AuswertungsWaage } from "@/components/waagen-vergleich";
import { bereichPflicht } from "@/lib/bereiche";
import { prisma } from "@/lib/prisma";
import { waagenVerlaufLaden } from "@/lib/waagen";

// Waagenauswertung: Vergleich der Waagen, darunter je Stand die GTS.
export default async function WaagenPage() {
  await bereichPflicht("waagen");

  const waagen = await prisma.waage.findMany({
    orderBy: { createdAt: "asc" },
    include: { volk: { select: { id: true, name: true, bienenstand: { select: { id: true, name: true } } } } },
  });
  const [verlaeufe, tageswerte] = await Promise.all([
    Promise.all(waagen.map((waage) => waagenVerlaufLaden(waage.id))),
    prisma.waagenTageswert.findMany({ orderBy: { tag: "asc" }, select: { waageId: true, tag: true, gewichtKg: true } }),
  ]);

  const auswertung: AuswertungsWaage[] = waagen.map((waage, i) => ({
    id: waage.id,
    name: waage.name || waage.kennung,
    wo: waage.volk ? `${waage.volk.name} · ${waage.volk.bienenstand.name}` : "keinem Volk zugeordnet",
    zeilen: verlaeufe[i].zeilen,
    tage: tageswerte.filter((t) => t.waageId === waage.id).map((t) => ({ t: t.tag.getTime(), w: t.gewichtKg })),
  }));

  const staende = new Map<string, { id: string; name: string }>();
  for (const waage of waagen) {
    if (waage.volk) staende.set(waage.volk.bienenstand.id, waage.volk.bienenstand);
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <SeitenNavigation className="mb-2" />
        <h1 className="text-2xl font-semibold tracking-tight">Waagen</h1>
        <p className="text-sm text-muted">Verlauf und Vergleich der Waagen, Grünlandtemperatursumme je Stand.</p>
      </div>

      {waagen.length === 0 && (
        <Card className="text-center text-muted">
          Noch keine Waage angelegt. Das geht unter{" "}
          <Link href="/einstellungen/waagen" className="text-accent hover:underline">Einstellungen → Waagen</Link>.
        </Card>
      )}

      {auswertung.length > 0 && (
        <Card>
          <WaagenVergleich waagen={auswertung} />
        </Card>
      )}

      {[...staende.values()].map((stand) => (
        <section key={stand.id} className="flex flex-col gap-3">
          <h2 className="text-xl font-semibold">
            <Link href={`/bienenstaende/${stand.id}`} className="hover:underline">{stand.name}</Link>
          </h2>
          <GtsKarte bienenstandId={stand.id} />
        </section>
      ))}
    </div>
  );
}
