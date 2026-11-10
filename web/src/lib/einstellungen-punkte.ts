import type { Bereich } from "@/lib/bereiche";
import {
  IconBrief,
  IconKacheln,
  IconKalender,
  IconLager,
  IconPalette,
  IconDesign,
  IconPerson,
  IconPersonen,
  IconQrCode,
  IconSchloss,
  IconStecknadel,
  IconVerlauf,
  IconAktualisieren,
  IconWabenrahmen,
  IconWaage,
} from "@/components/icons";

// Die Punkte der Einstellungen, nach Gruppen. Daraus entstehen die Liste auf
// /einstellungen (Handy, iPad hoch) und die Spalte links (ab lg). Jeder Punkt
// ist eine eigene Seite.
export type EinstellungsPunkt = {
  schluessel: string;
  href: string;
  label: string;
  icon: (props: { className?: string }) => React.ReactNode;
  // Nur sichtbar, wenn mindestens einer dieser Bereiche eingeschaltet ist.
  bereiche?: Bereich[];
  nurAdmin?: boolean;
  // Helfer (lib/nutzer.ts) sehen nur Punkte mit auchHelfer oder nurHelfer.
  auchHelfer?: boolean;
  nurHelfer?: boolean;
  // Nur auf der Instanz des Entwicklers (lib/hauptzugang.ts, entwicklerSeiten).
  nurEntwickler?: boolean;
  // In der öffentlichen Demo ausgeblendet (lib/demo.ts).
  nichtDemo?: boolean;
};

export type EinstellungsGruppe = { titel: string; nurAdmin?: boolean; punkte: EinstellungsPunkt[] };

export const EINSTELLUNGS_GRUPPEN: EinstellungsGruppe[] = [
  {
    titel: "Betrieb",
    punkte: [
      { schluessel: "bienenhalter", href: "/einstellungen/bienenhalter", label: "Bienenhalter", icon: IconPerson },
      { schluessel: "bereiche", href: "/einstellungen/bereiche", label: "Bereiche", icon: IconKacheln },
      { schluessel: "design", href: "/einstellungen/design", label: "Design", icon: IconDesign, auchHelfer: true },
      { schluessel: "passwort", href: "/einstellungen/passwort", label: "Passwort", icon: IconSchloss, nurHelfer: true },
    ],
  },
  {
    titel: "Ausstattung",
    punkte: [
      { schluessel: "beuten", href: "/einstellungen/beuten", label: "Beutensysteme", icon: IconWabenrahmen },
      { schluessel: "belegstellen", href: "/einstellungen/belegstellen", label: "Belegstellen", icon: IconStecknadel, bereiche: ["koeniginnen"] },
      { schluessel: "lager", href: "/einstellungen/lager", label: "Lager", icon: IconLager, bereiche: ["lager"] },
      { schluessel: "qr-codes", href: "/einstellungen/qr-codes", label: "QR-Codes", icon: IconQrCode, bereiche: ["scannen"] },
    ],
  },
  {
    titel: "Verbindungen",
    punkte: [
      { schluessel: "email", href: "/einstellungen/email", label: "E-Mail-Versand", icon: IconBrief, bereiche: ["dokumente", "velutina"], nichtDemo: true },
      { schluessel: "kalender", href: "/einstellungen/kalender", label: "Kalender-Abo", icon: IconKalender, nichtDemo: true },
      // Ohne `bereiche`: hier wird das Feature erst eingeschaltet. Nicht in der
      // Demo, dort sollen keine Zugangsdaten zu Wolf landen.
      { schluessel: "waagen", href: "/einstellungen/waagen", label: "Waagen", icon: IconWaage, nurAdmin: true, nichtDemo: true },
    ],
  },
  {
    titel: "Nur für dich",
    nurAdmin: true,
    punkte: [
      { schluessel: "helfer", href: "/einstellungen/helfer", label: "Helfer", icon: IconPerson, nurAdmin: true },
      { schluessel: "historie", href: "/einstellungen/historie", label: "Historie", icon: IconVerlauf, nurAdmin: true },
      { schluessel: "system", href: "/einstellungen/system", label: "System", icon: IconAktualisieren, nurAdmin: true },
      { schluessel: "testzugaenge", href: "/einstellungen/testzugaenge", label: "Testzugänge", icon: IconPersonen, nurAdmin: true, nurEntwickler: true },
      { schluessel: "styleguide", href: "/einstellungen/styleguide", label: "Styleguide", icon: IconPalette, nurAdmin: true, nurEntwickler: true },
    ],
  },
];

export function punktSichtbar(
  punkt: EinstellungsPunkt,
  aus: readonly string[],
  admin: boolean,
  helfer = false,
  entwickler = false,
  demo = false,
) {
  if (demo && punkt.nichtDemo) return false;
  if (helfer) return Boolean(punkt.auchHelfer || punkt.nurHelfer);
  if (punkt.nurHelfer) return false;
  if (punkt.nurEntwickler && !entwickler) return false;
  if (punkt.nurAdmin && !admin) return false;
  return !punkt.bereiche || punkt.bereiche.some((bereich) => !aus.includes(bereich));
}

// Gruppen nur mit den Punkten, die dieses Konto sehen darf; leere fallen weg.
export function sichtbareGruppen(
  aus: readonly string[],
  admin: boolean,
  helfer = false,
  entwickler = false,
  demo = false,
): EinstellungsGruppe[] {
  return EINSTELLUNGS_GRUPPEN.map((gruppe) => ({
    ...gruppe,
    punkte: gruppe.punkte.filter((punkt) => punktSichtbar(punkt, aus, admin, helfer, entwickler, demo)),
  })).filter((gruppe) => gruppe.punkte.length > 0);
}
