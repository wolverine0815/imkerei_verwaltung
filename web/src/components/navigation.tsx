"use client";

import Link from "next/link";
import { Fragment, useState } from "react";
import { usePathname } from "next/navigation";
import { ThemeUmschalter } from "@/components/theme-umschalter";
import { abmelden } from "@/lib/actions";
import type { Bereich } from "@/lib/bereiche";
import {
  IconHaus,
  IconMassnahmen,
  IconKrone,
  IconBehandlung,
  IconDokument,
  IconEinstellungen,
  IconLager,
  IconLogo,
  IconQrCode,
  IconHornisse,
  IconWaage,
  IconAnleitung,
  IconWabenrahmen,
  IconHonigglas,
  IconVerkauf,
  IconWinkelRechts,
} from "@/components/icons";

export type NavItem = {
  href: string;
  label: string;
  // Beschriftung mit weichen Trennstellen (\u00AD) für das schmale Handy-Raster:
  // Lange Wörter brechen dort bei Bedarf um, statt abgeschnitten zu werden.
  handyLabel?: string;
  icon: (props: { className?: string }) => React.ReactNode;
  // Prüft, ob ein Pfad zu diesem Menüpunkt gehört - auch für Unterseiten wie
  // /voelker/[id], die zu "Bienenstände" zählen, obwohl der Pfad anders lautet.
  istAktiv: (pfad: string) => boolean;
  // Gehört zu einem abschaltbaren Bereich (Einstellungen -> Bereiche).
  bereich?: Bereich;
  badge?: number;
  badgeTitel?: (anzahl: number) => string;
  // Menüpunkt öffnet erst ein Untermenü (Lager: Material oder Erzeugnisse),
  // statt direkt eine Seite.
  unterpunkte?: Unterpunkt[];
  // Nebenpunkt (Einstellungen, Anleitung): steht unten, abgesetzt vom
  // Hauptmenü und etwas kleiner.
  neben?: boolean;
};

export type Unterpunkt = {
  href: string;
  label: string;
  // Kurz, was drin ist - nur im Untermenü am Handy, wo Platz dafür ist.
  inhalt: string;
  icon: (props: { className?: string }) => React.ReactNode;
};

const LAGER_UNTERPUNKTE: Unterpunkt[] = [
  { href: "/lager/material", label: "Material", inhalt: "Zargen, Klimadeckel, Zubehör", icon: IconWabenrahmen },
  { href: "/lager/erzeugnisse", label: "Erzeugnisse", inhalt: "Honig, Wachs, Gläser", icon: IconHonigglas },
  { href: "/lager/verkaeufe", label: "Verkäufe", inhalt: "Erlös, Völker, Königinnen", icon: IconVerkauf },
];

export function navItems(faellig: number, velutina: number, aus: readonly string[]): NavItem[] {
  const alle: NavItem[] = [
    {
      href: "/",
      label: "Bienenstände",
      handyLabel: "Bienen\u00ADstände",
      icon: IconHaus,
      istAktiv: (pfad) => pfad === "/" || pfad.startsWith("/bienenstaende") || pfad.startsWith("/voelker"),
    },
    {
      href: "/scannen",
      bereich: "scannen",
      label: "Scannen",
      icon: IconQrCode,
      istAktiv: (pfad) => pfad.startsWith("/scannen"),
    },
    {
      href: "/massnahmen",
      label: "Maßnahmen",
      icon: IconMassnahmen,
      istAktiv: (pfad) => pfad.startsWith("/massnahmen"),
      badge: faellig,
      badgeTitel: (anzahl) => `${anzahl} ${anzahl === 1 ? "Maßnahme ist" : "Maßnahmen sind"} fällig`,
    },
    {
      href: "/koeniginnen",
      bereich: "koeniginnen",
      label: "Königinnen",
      icon: IconKrone,
      istAktiv: (pfad) => pfad.startsWith("/koeniginnen") && !pfad.startsWith("/koeniginnen/zuchtkarten"),
    },
    {
      href: "/waagen",
      bereich: "waagen",
      label: "Waagen",
      icon: IconWaage,
      istAktiv: (pfad) => pfad.startsWith("/waagen"),
    },
    {
      href: "/behandlungen",
      bereich: "behandlungen",
      label: "Behandlungen",
      handyLabel: "Behand\u00ADlungen",
      icon: IconBehandlung,
      istAktiv: (pfad) => pfad.startsWith("/behandlungen") || pfad.startsWith("/medikamente"),
    },
    {
      href: "/dokumente",
      bereich: "dokumente",
      label: "Dokumente",
      icon: IconDokument,
      // Zuchtkarten drucken gehört zu den Dokumenten, die Adresse liegt aber
      // weiter unter /koeniginnen (Lesezeichen, Links von der Königin).
      istAktiv: (pfad) => pfad.startsWith("/dokumente") || pfad.startsWith("/koeniginnen/zuchtkarten"),
    },
    {
      href: "/lager",
      bereich: "lager",
      label: "Lager",
      icon: IconLager,
      istAktiv: (pfad) => pfad.startsWith("/lager"),
      unterpunkte: LAGER_UNTERPUNKTE,
    },
    {
      href: "/velutina",
      bereich: "velutina",
      label: "Velutina",
      icon: IconHornisse,
      istAktiv: (pfad) => pfad.startsWith("/velutina"),
      badge: velutina,
      badgeTitel: (anzahl) =>
        `${anzahl} ${anzahl === 1 ? "neue Meldung" : "neue Meldungen"} der Asiatischen Hornisse nahe deinen Ständen`,
    },
    {
      href: "/einstellungen",
      label: "Einstellungen",
      handyLabel: "Einstel\u00ADlungen",
      icon: IconEinstellungen,
      istAktiv: (pfad) => pfad.startsWith("/einstellungen"),
      neben: true,
    },
    {
      href: "/anleitung",
      label: "Anleitung",
      icon: IconAnleitung,
      istAktiv: (pfad) => pfad.startsWith("/anleitung"),
      neben: true,
    },
  ];
  return alle.filter((item) => !item.bereich || !aus.includes(item.bereich));
}

// Teilt die Menüpunkte in Hauptmenü und Nebenpunkte (unten, kleiner).
export function nachRang(items: NavItem[]) {
  return { haupt: items.filter((item) => !item.neben), neben: items.filter((item) => item.neben) };
}

// Menüpunkt, zu dem ein Pfad gehört (für den Sprung zum Menüpunkt in der
// Seitennavigation über der Überschrift, siehe seiten-navigation.tsx).
export function menuepunktZuPfad(pfad: string) {
  const item = navItems(0, 0, []).find((eintrag) => eintrag.istAktiv(pfad));
  return item ? { href: item.href, label: item.label, icon: item.icon } : null;
}

export function Abzeichen({ anzahl, titel }: { anzahl: number; titel?: (anzahl: number) => string }) {
  if (anzahl <= 0) return null;
  return (
    <span
      className="absolute -right-1.5 -top-1.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-gefahr-voll px-1 text-xs font-semibold text-gefahr-voll-text"
      title={titel?.(anzahl)}
    >
      {anzahl}
    </span>
  );
}

// Kennzeichnung für Tester: so ist immer klar, dass man in der Testinstanz
// mit eigenen Daten arbeitet.
function TestzugangHinweis({ name }: { name: string }) {
  return (
    <span
      title="Testversion zum Ausprobieren. Keine Garantie für die Daten."
      className="inline-block max-w-32 shrink-0 self-start truncate rounded-full sm:max-w-48 border border-warnung-rand bg-warnung-flaeche px-2 py-0.5 text-xs font-medium text-warnung"
    >
      {/* Am Handy kürzer, sonst rutschen Hell/Dunkel und Abmelden in eine eigene Zeile. */}
      <span className="sm:hidden">Test</span>
      <span className="hidden sm:inline">Testzugang</span>&nbsp;· {name}
    </span>
  );
}

// Deutlich größere Tippfläche als beim Topbar-Link (mehr Innenabstand,
// größere Schrift/Symbol) - auf dem iPad im Querformat (Sidebar) ist der
// Finger weniger präzise als eine Maus, dafür ist hier auch mehr Platz als
// in der schmalen Topbar-Zeile auf dem Smartphone.
function SidebarLink({ item, pathname }: { item: NavItem; pathname: string }) {
  const aktiv = item.istAktiv(pathname);
  if (item.unterpunkte) return <SidebarGruppe item={item} unterpunkte={item.unterpunkte} pathname={pathname} />;
  return (
    <Link
      href={item.href}
      className={`flex items-center gap-3 rounded-md px-3 py-3 text-base font-medium ${
        aktiv ? "bg-accent/10 text-accent" : "text-muted hover:bg-background hover:text-foreground"
      }`}
    >
      <span className="relative inline-flex shrink-0">
        <item.icon className="h-5 w-5" />
        {item.badge !== undefined && <Abzeichen anzahl={item.badge} titel={item.badgeTitel} />}
      </span>
      {item.label}
    </Link>
  );
}

// Menüpunkt mit Untermenü in der Seitenleiste: klappt beim Antippen auf, die
// Unterpunkte stehen eingerückt darunter. Solange man auf einer seiner Seiten
// ist, bleibt er offen - so ist der Wechsel zwischen den Unterseiten ein Klick.
// Von Hand auf- oder zugeklappt gilt nur für die Seite, auf der man gerade ist.
// Auch von den Designs Wabe und Klar genutzt (navigation-wabe/-klar.tsx).
export function useGruppeOffen(aktiv: boolean, pathname: string) {
  const [wahl, setWahl] = useState<{ pfad: string; offen: boolean } | null>(null);
  const offen = wahl?.pfad === pathname ? wahl.offen : aktiv;
  return [offen, () => setWahl({ pfad: pathname, offen: !offen })] as const;
}

export function SidebarGruppe({ item, unterpunkte, pathname }: { item: NavItem; unterpunkte: Unterpunkt[]; pathname: string }) {
  const aktiv = item.istAktiv(pathname);
  const [offen, umschalten] = useGruppeOffen(aktiv, pathname);
  const listeId = `untermenue-${item.href.slice(1)}`;
  return (
    <div className="flex flex-col">
      <button
        type="button"
        aria-expanded={offen}
        aria-controls={listeId}
        onClick={umschalten}
        className={`flex cursor-pointer items-center gap-3 rounded-md px-3 py-3 text-left text-base font-medium ${
          aktiv ? "bg-accent/10 text-accent" : "text-muted hover:bg-background hover:text-foreground"
        }`}
      >
        <span className="relative inline-flex shrink-0">
          <item.icon className="h-5 w-5" />
        </span>
        {item.label}
        <IconWinkelRechts className={`ml-auto h-4 w-4 shrink-0 ${offen ? "-rotate-90" : "rotate-90"}`} />
      </button>
      {offen && (
        <div id={listeId} className="mb-1 ml-5 mt-1 flex flex-col gap-0.5 border-l-2 border-border pl-3">
          {unterpunkte.map((unter) => {
            const unterAktiv = pathname.startsWith(unter.href);
            return (
              <Link
                key={unter.href}
                href={unter.href}
                aria-current={unterAktiv ? "page" : undefined}
                className={`flex items-center gap-2.5 rounded-md px-3 py-2.5 text-[0.95rem] font-medium ${
                  unterAktiv ? "bg-accent/10 text-accent" : "text-muted hover:bg-background hover:text-foreground"
                }`}
              >
                <unter.icon className="h-[18px] w-[18px] shrink-0" />
                {unter.label}
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

// Feste Seitenleiste links (auf breiten Monitoren direkt am Inhalt, siehe
// layout.tsx; Desktop und iPad im Querformat, ab der
// Tailwind-Breite "lg" = 1024px - das trifft bei allen gängigen iPads genau
// die Querformat-Breite, im Hochformat bleiben sie darunter).
export function Sidebar({
  faellig,
  velutina,
  aus,
  testerName,
  name,
}: {
  faellig: number;
  velutina: number;
  aus: readonly string[];
  testerName: string | null;
  /// Name neben dem Logo (lib/menue-name.ts).
  name: string;
}) {
  const pathname = usePathname();
  const { haupt, neben } = nachRang(navItems(faellig, velutina, aus));

  return (
    <aside className="hidden shrink-0 flex-col border-r border-border bg-card lg:sticky lg:top-0 lg:flex lg:h-screen lg:w-64 print:hidden">
      {/* Eigener Scrollbereich nur für Logo/Navigation (min-h-0 + overflow-y-auto):
          wächst die Menüliste über die Bildschirmhöhe hinaus (viele Menüpunkte,
          kleines iPad-Fenster), scrollt nur dieser Teil - der Umschalter darunter
          bleibt als fester Abschluss der Seitenleiste immer im sichtbaren
          Bereich, statt erst nach Herunterscrollen der ganzen Seite aufzutauchen. */}
      <div className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto p-5">
        <Link href="/" className="flex items-center gap-2.5 text-base font-semibold tracking-tight">
          <IconLogo className="h-6 w-6 shrink-0 text-accent" />
          {/* Lange Namen brechen auf höchstens zwei Zeilen um. */}
          <span className="line-clamp-2 min-w-0 break-words hyphens-auto">{name}</span>
        </Link>
        {testerName !== null && <TestzugangHinweis name={testerName} />}
        <nav className="flex flex-col gap-1">
          {haupt.map((item) => (
            <SidebarLink key={item.href} item={item} pathname={pathname} />
          ))}
        </nav>
      </div>
      <nav aria-label="Weiteres" className="flex shrink-0 flex-col gap-0.5 border-t border-border px-5 py-3">
        {neben.map((item) => {
          const aktiv = item.istAktiv(pathname);
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={aktiv ? "page" : undefined}
              className={`flex min-h-10 items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium ${
                aktiv ? "bg-accent/10 text-accent" : "text-muted hover:bg-background hover:text-foreground"
              }`}
            >
              <item.icon className="h-4 w-4 shrink-0" />
              {item.label}
            </Link>
          );
        })}
      </nav>
      <div className="flex shrink-0 items-center justify-between gap-2 border-t border-border p-5">
        <ThemeUmschalter />
        <form action={abmelden}>
          <button type="submit" className="inline-flex min-h-11 items-center px-3 text-xs text-muted hover:text-accent hover:underline">
            Abmelden
          </button>
        </form>
      </div>
    </aside>
  );
}

// Smartphone (unter "sm" = 640px): die Hauptmenüpunkte als Raster aus
// höchstens 5 × 2 Kacheln (Einstellungen und Anleitung klein darunter) mit großem Symbol und Beschriftung darunter. Nur Symbole
// waren zu klein und nicht eindeutig; ein "Mehr"-Menü hätte dagegen die
// Hälfte der Punkte versteckt. Jede Kachel ist mindestens 56 px hoch und
// ein Fünftel der Breite breit, also noch gut mit dem Daumen zu treffen.
function HandyLink({
  item,
  pathname,
  offen,
  umschalten,
}: {
  item: NavItem;
  pathname: string;
  // Nur bei Menüpunkten mit Untermenü: ist es gerade aufgeklappt?
  offen?: boolean;
  umschalten?: () => void;
}) {
  const aktiv = item.istAktiv(pathname);
  const klassen = `flex min-h-14 flex-col items-center justify-start gap-0.5 rounded-lg px-0 py-1 text-center text-xs leading-tight ${
    aktiv
      ? "bg-accent/15 font-semibold text-accent ring-1 ring-accent/40"
      : offen
        ? "bg-accent/15 font-semibold text-accent"
        : "font-medium text-foreground/80 hover:bg-background"
  }`;
  const inhalt = (
    <>
      <span className="relative inline-flex shrink-0">
        <item.icon className="h-6 w-6" />
        {item.badge !== undefined && <Abzeichen anzahl={item.badge} titel={item.badgeTitel} />}
      </span>
      <span className="w-full">{item.handyLabel ?? item.label}</span>
    </>
  );
  if (item.unterpunkte) {
    return (
      <button
        type="button"
        aria-expanded={offen}
        aria-controls="untermenue-handy"
        aria-current={aktiv ? "page" : undefined}
        onClick={umschalten}
        className={`cursor-pointer ${klassen}`}
      >
        {inhalt}
      </button>
    );
  }
  return (
    <Link href={item.href} aria-current={aktiv ? "page" : undefined} className={klassen}>
      {inhalt}
    </Link>
  );
}

// Untermenü am Handy: schiebt sich als volle Zeile direkt unter die
// Kachelreihe des Menüpunkts, ein Zipfel zeigt auf dessen Kachel. Liegt nicht
// über dem Inhalt, sondern schiebt ihn nach unten.
function HandyUntermenue({ unterpunkte, spalte, spalten }: { unterpunkte: Unterpunkt[]; spalte: number; spalten: number }) {
  return (
    <div
      id="untermenue-handy"
      className="relative col-span-full mx-1.5 mb-1 mt-1.5 grid grid-cols-2 gap-2 rounded-xl border border-accent/35 bg-accent/10 p-2"
    >
      <span
        aria-hidden="true"
        className="absolute -top-[7px] h-3 w-3 rotate-45 border-l border-t border-accent/35 bg-card"
        style={{ left: `calc(${((spalte + 0.5) / spalten) * 100}% - 6px)` }}
      >
        <span className="absolute inset-0 bg-accent/10" />
      </span>
      {unterpunkte.map((unter) => (
        <Link
          key={unter.href}
          href={unter.href}
          className="flex min-h-13 items-center gap-2.5 rounded-lg border border-rand-ruhig bg-card px-2.5 py-2"
        >
          <unter.icon className="h-6 w-6 shrink-0 text-accent" />
          <span className="min-w-0">
            <span className="block text-sm font-semibold">{unter.label}</span>
            <span className="block text-xs leading-snug text-muted">{unter.inhalt}</span>
          </span>
        </Link>
      ))}
    </div>
  );
}

function TopbarLink({
  item,
  pathname,
  offen,
  umschalten,
}: {
  item: NavItem;
  pathname: string;
  offen?: boolean;
  umschalten?: () => void;
}) {
  const aktiv = item.istAktiv(pathname);
  const klassen = `flex items-center gap-2 rounded-md px-2.5 py-2 text-sm font-medium ${
    aktiv || offen ? "bg-accent/10 text-accent" : "text-muted hover:bg-background hover:text-foreground"
  }`;
  const inhalt = (
    <>
      <span className="relative inline-flex shrink-0">
        <item.icon className="h-5 w-5" />
        {item.badge !== undefined && <Abzeichen anzahl={item.badge} titel={item.badgeTitel} />}
      </span>
      {item.label}
    </>
  );
  if (item.unterpunkte) {
    return (
      <button
        type="button"
        aria-expanded={offen}
        aria-controls="untermenue-tablet"
        aria-current={aktiv ? "page" : undefined}
        onClick={umschalten}
        className={`cursor-pointer ${klassen}`}
      >
        {inhalt}
        <IconWinkelRechts className={`h-4 w-4 shrink-0 ${offen ? "-rotate-90" : "rotate-90"}`} />
      </button>
    );
  }
  return (
    <Link href={item.href} aria-current={aktiv ? "page" : undefined} className={klassen}>
      {inhalt}
    </Link>
  );
}

// Kopfzeile oben (Smartphone und iPad im Hochformat, unterhalb von "lg").
// Auf dem Smartphone Kachelraster (siehe HandyLink), auf dem iPad im
// Hochformat Symbol und Beschriftung nebeneinander.
export function Topbar({
  faellig,
  velutina,
  aus,
  testerName,
  name,
}: {
  faellig: number;
  velutina: number;
  aus: readonly string[];
  testerName: string | null;
  /// Name neben dem Logo (lib/menue-name.ts).
  name: string;
}) {
  const pathname = usePathname();
  const { haupt: items, neben } = nachRang(navItems(faellig, velutina, aus));
  // Aufgeklapptes Untermenü (Lager) - gilt nur auf der Seite, auf der es
  // geöffnet wurde, nach dem Antippen eines Unterpunkts ist es wieder zu.
  const [offenAuf, setOffenAuf] = useState<string | null>(null);
  const offen = offenAuf === pathname;
  const umschalten = () => setOffenAuf(offen ? null : pathname);
  const gruppe = items.find((item) => item.unterpunkte);

  // Handy-Raster: höchstens fünf Spalten, auf zwei Reihen gleichmäßig
  // verteilt (acht Punkte = 4 × 2). Das Untermenü kommt direkt nach der
  // Reihe, in der sein Menüpunkt steht.
  const spalten = items.length <= 5 ? items.length : Math.min(5, Math.ceil(items.length / 2));
  const gruppenIndex = gruppe ? items.indexOf(gruppe) : -1;
  const reihenEnde = Math.min(items.length - 1, Math.floor(gruppenIndex / spalten) * spalten + spalten - 1);

  return (
    <header className="border-b border-border bg-card lg:hidden print:hidden">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 sm:px-6">
        <Link href="/" className="flex min-w-0 items-center gap-2 text-base font-semibold tracking-tight">
          <IconLogo className="h-6 w-6 shrink-0 text-accent" />
          <span className="truncate">{name}</span>
        </Link>
        {testerName !== null && <TestzugangHinweis name={testerName} />}
        <nav className="order-last hidden w-full flex-wrap items-center gap-1 sm:flex">
          {items.map((item) => (
            <TopbarLink
              key={item.href}
              item={item}
              pathname={pathname}
              offen={item.unterpunkte ? offen : undefined}
              umschalten={item.unterpunkte ? umschalten : undefined}
            />
          ))}
          {offen && gruppe?.unterpunkte && (
            <div id="untermenue-tablet" className="flex w-full flex-wrap gap-2 border-t border-border pt-2">
              {gruppe.unterpunkte.map((unter) => (
                <Link
                  key={unter.href}
                  href={unter.href}
                  className="flex items-center gap-2 rounded-md border border-rand-ruhig px-3 py-2 text-sm font-medium hover:bg-background"
                >
                  <unter.icon className="h-5 w-5 shrink-0 text-accent" />
                  {gruppe.label} · {unter.label}
                </Link>
              ))}
            </div>
          )}
          {neben.length > 0 && <span aria-hidden="true" className="mx-1 h-6 w-px bg-border" />}
          {neben.map((item) => {
            const aktiv = item.istAktiv(pathname);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={aktiv ? "page" : undefined}
                className={`flex items-center gap-1.5 rounded-md px-2 py-2 text-xs font-medium ${
                  aktiv ? "bg-accent/10 text-accent" : "text-muted hover:bg-background hover:text-foreground"
                }`}
              >
                <item.icon className="h-4 w-4 shrink-0" />
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="ml-auto flex items-center gap-3">
          <ThemeUmschalter />
          <form action={abmelden}>
            <button type="submit" className="inline-flex min-h-11 items-center px-3 text-xs text-muted hover:text-accent hover:underline">
              Abmelden
            </button>
          </form>
        </div>
      </div>
      <nav
        className="grid gap-0.5 px-0.5 pb-2 sm:hidden"
        style={{ gridTemplateColumns: `repeat(${spalten}, minmax(0, 1fr))` }}
      >
        {items.map((item, index) => (
          <Fragment key={item.href}>
            <HandyLink
              item={item}
              pathname={pathname}
              offen={item.unterpunkte ? offen : undefined}
              umschalten={item.unterpunkte ? umschalten : undefined}
            />
            {offen && gruppe?.unterpunkte && index === reihenEnde && (
              <HandyUntermenue unterpunkte={gruppe.unterpunkte} spalte={gruppenIndex % spalten} spalten={spalten} />
            )}
          </Fragment>
        ))}
      </nav>
      {neben.length > 0 && (
        <nav aria-label="Weiteres" className="flex justify-center gap-1 border-t border-border px-2 py-1 sm:hidden">
          {neben.map((item) => {
            const aktiv = item.istAktiv(pathname);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={aktiv ? "page" : undefined}
                className={`flex min-h-10 items-center gap-1.5 rounded-md px-3 text-xs font-medium ${
                  aktiv ? "bg-accent/15 font-semibold text-accent" : "text-muted hover:bg-background"
                }`}
              >
                <item.icon className="h-4 w-4 shrink-0" />
                {item.label}
              </Link>
            );
          })}
        </nav>
      )}
    </header>
  );
}
