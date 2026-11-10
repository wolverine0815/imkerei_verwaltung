import { prisma } from "@/lib/prisma";
import { istAdmin } from "@/lib/konto";
import { istDemo } from "@/lib/demo";
import { entwicklerSeiten } from "@/lib/hauptzugang";
import { mailKonfigLaden } from "@/lib/mail";
import { BEREICHE, abgeschalteteBereiche } from "@/lib/bereiche";
import { BUNDESLAENDER } from "@/lib/bundeslaender";
import { aktuellesDesign } from "@/lib/design";
import { DESIGN_NAMEN } from "@/lib/design-namen";
import { sichtbareGruppen } from "@/lib/einstellungen-punkte";
import { AuswahlListe } from "@/components/auswahl-liste";
import { SeitenNavigation } from "@/components/seiten-navigation";
import { BienenhalterInhalt } from "./_teile/bienenhalter";

function anzahl(n: number, eins: string, mehr: string, keins: string) {
  return n === 0 ? keins : `${n} ${n === 1 ? eins : mehr}`;
}

// Einstieg in die Einstellungen. Handy und iPad hoch: Liste aller Punkte nach
// Gruppen, je mit kurzem Stand. Ab lg steht die Liste als Spalte links
// (layout.tsx), rechts gleich der erste Punkt, der Bienenhalter.
export default async function EinstellungenPage() {
  const [betrieb, mailKonfig, aus, admin, anzahlSysteme, anzahlZargen, anzahlBelegstellen, anzahlLagerorte, anzahlSorten, anzahlGebinde, design] =
    await Promise.all([
      prisma.betrieb.findUnique({ where: { id: "standard" } }),
      mailKonfigLaden(),
      abgeschalteteBereiche(),
      istAdmin(),
      prisma.beutensystem.count(),
      prisma.zarge.count(),
      prisma.belegstelle.count({ where: { archiviert: false } }),
      prisma.lagerort.count(),
      prisma.sorte.count(),
      prisma.gebinde.count(),
      aktuellesDesign(),
    ]);

  const land = BUNDESLAENDER.find((eintrag) => eintrag.kuerzel === betrieb?.bundesland)?.name;
  const an = BEREICHE.filter((bereich) => !aus.includes(bereich.schluessel)).length;
  const stand: Record<string, { text: string; fehlt?: boolean }> = {
    bienenhalter: betrieb?.halterName
      ? { text: [betrieb.halterName, land].filter(Boolean).join(" · ") }
      : { text: "Noch nicht eingetragen", fehlt: true },
    bereiche: { text: an === BEREICHE.length ? "Alle eingeschaltet" : `${an} von ${BEREICHE.length} eingeschaltet` },
    beuten: {
      text:
        anzahlSysteme === 0
          ? "Noch nichts angelegt"
          : `${anzahl(anzahlSysteme, "System", "Systeme", "")}, ${anzahl(anzahlZargen, "Zargengröße", "Zargengrößen", "keine Zargengröße")}`,
      fehlt: anzahlSysteme === 0,
    },
    belegstellen: { text: anzahl(anzahlBelegstellen, "Belegstelle", "Belegstellen", "Noch keine angelegt") },
    lager: {
      text: [
        anzahl(anzahlSorten, "Sorte", "Sorten", "keine Sorten"),
        anzahl(anzahlGebinde, "Gebinde", "Gebinde", "keine Gebinde"),
        anzahl(anzahlLagerorte, "Lagerort", "Lagerorte", "keine Lagerorte"),
      ].join(", "),
    },
    "qr-codes": { text: "Bogen erzeugen und drucken" },
    email: mailKonfig
      ? { text: mailKonfig.getestetAm ? `Eingerichtet, getestet am ${mailKonfig.getestetAm.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "Europe/Berlin" })}` : "Eingerichtet" }
      : { text: "Nicht eingerichtet" },
    waagen: { text: aus.includes("waagen") ? "Ausgeschaltet" : "Eingeschaltet" },
    kalender: betrieb?.kalenderToken
      ? { text: "Adresse zum Abonnieren bereit" }
      : { text: "Erst Bienenhalter speichern", fehlt: true },
    design: { text: DESIGN_NAMEN[design] },
    helfer: { text: "Mitarbeit an deinen Daten" },
    historie: { text: "Wer hat was geändert" },
    testzugaenge: { text: "Tester einladen und verwalten" },
    styleguide: { text: "Farben und Bausteine" },
  };

  const gruppen = sichtbareGruppen(aus, admin, false, entwicklerSeiten(), istDemo()).map((gruppe) => ({
    titel: gruppe.titel,
    zusatz: gruppe.nurAdmin ? "nur du" : undefined,
    zeilen: gruppe.punkte.map((punkt) => ({
      href: punkt.href,
      label: punkt.label,
      icon: punkt.icon,
      stand: stand[punkt.schluessel]?.text,
      fehlt: stand[punkt.schluessel]?.fehlt,
    })),
  }));

  return (
    <>
      <div className="flex flex-col gap-5 lg:hidden">
        <div>
          <SeitenNavigation className="mb-2" />
          <h1 className="text-2xl font-semibold tracking-tight">Einstellungen</h1>
        </div>
        <AuswahlListe gruppen={gruppen} />
      </div>
      <div className="hidden lg:block">
        <BienenhalterInhalt />
      </div>
    </>
  );
}
