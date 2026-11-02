import { notFound } from "next/navigation";
import { basisPrisma, prisma } from "@/lib/prisma";
import { aktuellesKonto, istAdmin } from "@/lib/konto";
import { Card } from "@/components/ui";
import { SeitenNavigation } from "@/components/seiten-navigation";
import { BitImportFormular } from "@/components/bit-import-formular";

// Übernahme aus BeeInTouch: Stockkarten-PDFs einlesen und als Einträge,
// Behandlungen und Fütterungen anlegen. Nur für den Admin.
export default async function ImportPage() {
  if (!(await istAdmin())) notFound();
  const konto = await aktuellesKonto();

  const [staende, medikamente, benutzer] = await Promise.all([
    prisma.bienenstand.findMany({
      where: { archiviert: false },
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        voelker: { where: { archiviert: false }, orderBy: { createdAt: "asc" }, select: { id: true, name: true } },
      },
    }),
    prisma.medikament.findMany({ where: { archiviert: false }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    basisPrisma.nutzer.findMany({ where: { aktiv: true }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <SeitenNavigation className="mb-2" />
        <h1 className="text-2xl font-semibold tracking-tight">Import aus BeeInTouch</h1>
        <p className="text-sm text-muted">
          Du lädst die Stockkarten als PDF hoch, eine je Volk. Die App liest daraus die Durchschauen, Fütterungen,
          Behandlungen und weitere Angaben und legt sie bei den Völkern an. Vorher siehst du, was angelegt wird.
        </p>
      </div>

      <Card>
        <BitImportFormular
          staende={staende}
          medikamente={medikamente}
          benutzer={benutzer}
          adminName={konto?.name || "Admin"}
        />
      </Card>
    </div>
  );
}
