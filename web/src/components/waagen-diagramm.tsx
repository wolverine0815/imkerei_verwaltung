"use client";

import { useMemo, useRef, useState, useSyncExternalStore } from "react";
import { IconAuge } from "@/components/icons";
import { knopfKlassen } from "@/components/ui";
import type { VerlaufZeile } from "@/lib/waagen";

// Verlauf einer Waage nach dem Vorbild der Wolf-Auswertung: drei Bereiche
// untereinander auf derselben Zeitachse. Oben teilen sich Temperatur, Feuchte
// und Regen einen Bereich, Temperatur mit Achse links, Feuchte rechts. Darunter
// die Gewichtsänderung: je Stunde als Balken (Achse links), aufsummiert ab dem
// linken Rand als Linie (Achse rechts). Das Gesamtgewicht steht in der Legende,
// denn die Waage gleicht Arbeiten am Volk nur in der Änderung aus. Die Legende ist immer
// da: Sie zeigt die Werte zur Mausposition, sonst
// die jüngsten, und weicht in die Ecke gegenüber der Maus aus. Der Tag unter der
// Maus ist hinterlegt. Unten im Diagramm steht je Tag die Gesamtänderung, im
// Vergleich zweier Waagen stattdessen in der Legende. Am Handy deckt die Legende das Diagramm zu und ist deshalb
// erst aus, ein Knopf schaltet sie. Ohne Wert reißt die Linie ab. Sichtbar sind 7 Tage, am Handy 3, die
// übrigen erreicht man durch Ziehen; die Y-Achsen gelten für alle Daten, damit
// die Linien dabei nicht springen. Nur die Summe hängt vom sichtbaren Zeitraum ab.
//
// Mit `zweite` zeigt es zwei Waagen A und B: gleiche Größen teilen sich die Achse,
// B ist gestrichelt und in eigener Farbe, Balken stehen nebeneinander.

const BREITE = 600;
const STUNDE_MS = 60 * 60 * 1000;
const TAG_MS = 24 * STUNDE_MS;
const FENSTER_MS = 7 * TAG_MS;
// Am Handy reicht die Breite für 7 Tage nicht.
const FENSTER_SCHMAL_MS = 3 * TAG_MS;
const RAND = 6;

// Am 2.11.2026 mit dem Farbprüfer der Diagramm-Leitlinien geprüft (auch für
// Farbfehlsichtigkeit). Im dunklen Design ist der Kontrast knapp, die Werte
// stehen deshalb immer auch als Text in Legende und Tabelle.
const FARBE_TEMPERATUR = "#c8483c";
const FARBE_FEUCHTE = "#7a55d6";
const FARBE_REGEN = "#2f8fe0";
// Die beiden Grüntöne wie bei Wolf. Sie liegen dicht beieinander, Balken und Linie
// unterscheiden sich aber schon durch die Form.
const FARBE_AENDERUNG = "#3dbd8f";
const FARBE_SUMME = "#7c9a0e";
// Waage B im Vergleich.
const FARBE_TEMPERATUR_B = "#c97420";
const FARBE_FEUCHTE_B = "#b0479e";
const FARBE_REGEN_B = "#1fa8bf";
const FARBE_AENDERUNG_B = "#c23f7a";
const FARBE_SUMME_B = "#2f7fb5";

// Hebt die Diagrammfläche von der Karte ab: im dunklen Design etwas heller, im
// hellen etwas dunkler.
export const FLAECHE = "color-mix(in srgb, var(--color-foreground) 7%, var(--color-card))";

type Wert = "aenderung" | "summe" | "temperatur" | "feuchte" | "regen";
type Schluessel = Wert | `${Wert}B`;

// Eine Zeit mit den Werten von Waage A und, im Vergleich, Waage B.
type Zeile = { t: number; gewicht: number | null; gewichtB: number | null; tagesAenderung: number | null; tagesAenderungB: number | null } & Record<Schluessel, number | null>;

type Reihe = {
  schluessel: Schluessel;
  label: string;
  einheit: string;
  farbe: string;
  stellen: number;
  balken?: boolean;
  // Skala schließt 0 ein, Werte mit Vorzeichen.
  mitNull?: boolean;
  // Maßstab nur aus dem sichtbaren Zeitraum.
  fenster?: boolean;
  // Waage B im Vergleich.
  zweite?: boolean;
  // Diese Reihen teilen sich einen Maßstab (A und B derselben Größe).
  skala?: Schluessel[];
  // Balken: Versatz in Balkenbreiten, damit A und B nebeneinander stehen.
  versatz?: number;
  // Fester Maßstab; sonst aus den Werten.
  min?: number;
  max?: number;
};

type Bereich = { hoehe: number; reihen: Reihe[] };

const BEREICHE: Bereich[] = [
  {
    hoehe: 170,
    reihen: [
      { schluessel: "temperatur", label: "Temperatur", einheit: "°C", farbe: FARBE_TEMPERATUR, stellen: 1 },
      { schluessel: "feuchte", label: "Luftfeuchte", einheit: "%", farbe: FARBE_FEUCHTE, stellen: 0, min: 0, max: 100 },
      { schluessel: "regen", label: "Regen", einheit: "mm", farbe: FARBE_REGEN, stellen: 1, balken: true, min: 0 },
    ],
  },
  {
    hoehe: 170,
    reihen: [
      { schluessel: "aenderung", label: "Änderung je Stunde", einheit: "kg", farbe: FARBE_AENDERUNG, stellen: 2, balken: true, mitNull: true },
      { schluessel: "summe", label: "Summe im Zeitraum", einheit: "kg", farbe: FARBE_SUMME, stellen: 2, mitNull: true, fenster: true },
    ],
  },
];

const FARBEN_B: Record<Wert, string> = {
  temperatur: FARBE_TEMPERATUR_B,
  feuchte: FARBE_FEUCHTE_B,
  regen: FARBE_REGEN_B,
  aenderung: FARBE_AENDERUNG_B,
  summe: FARBE_SUMME_B,
};

// Dieselben Bereiche mit den Reihen beider Waagen.
const BEREICHE_ZWEI: Bereich[] = BEREICHE.map((bereich) => ({
  ...bereich,
  reihen: [
    ...bereich.reihen.map((reihe) => ({
      ...reihe,
      label: `A ${reihe.label}`,
      skala: [reihe.schluessel, `${reihe.schluessel}B` as Schluessel],
      versatz: reihe.balken ? -0.5 : undefined,
    })),
    ...bereich.reihen.map((reihe) => ({
      ...reihe,
      schluessel: `${reihe.schluessel}B` as Schluessel,
      label: `B ${reihe.label}`,
      farbe: FARBEN_B[reihe.schluessel as Wert],
      zweite: true,
      skala: [reihe.schluessel, `${reihe.schluessel}B` as Schluessel],
      versatz: reihe.balken ? 0.5 : undefined,
    })),
  ],
}));

const LEER: Record<Schluessel, null> = {
  temperatur: null,
  feuchte: null,
  regen: null,
  aenderung: null,
  summe: null,
  temperaturB: null,
  feuchteB: null,
  regenB: null,
  aenderungB: null,
  summeB: null,
};

// Führt beide Waagen nach der Zeit zusammen und summiert die Änderung.
function zeilenBauen(a: VerlaufZeile[], b: VerlaufZeile[] | undefined): Zeile[] {
  const nachZeit = new Map<number, Zeile>();
  const zeile = (t: number) => {
    const vorhanden = nachZeit.get(t);
    if (vorhanden) return vorhanden;
    const neu: Zeile = { t, gewicht: null, gewichtB: null, tagesAenderung: null, tagesAenderungB: null, ...LEER };
    nachZeit.set(t, neu);
    return neu;
  };
  for (const z of a) Object.assign(zeile(z.t), z);
  for (const z of b ?? []) {
    Object.assign(zeile(z.t), {
      gewichtB: z.gewicht,
      tagesAenderungB: z.tagesAenderung,
      temperaturB: z.temperatur,
      feuchteB: z.feuchte,
      regenB: z.regen,
      aenderungB: z.aenderung,
    });
  }
  const liste = [...nachZeit.values()].sort((x, y) => x.t - y.t);
  let summe = 0;
  let summeB = 0;
  for (const z of liste) {
    summe += z.aenderung ?? 0;
    summeB += z.aenderungB ?? 0;
    z.summe = summe;
    z.summeB = b ? summeB : null;
  }
  return liste;
}

const zeitFormat = new Intl.DateTimeFormat("de-DE", {
  day: "2-digit",
  month: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Europe/Berlin",
});
const tagFormat = new Intl.DateTimeFormat("de-DE", { day: "2-digit", month: "2-digit", timeZone: "Europe/Berlin" });

const SCHMAL = "(max-width: 767px)";

function schmalBeobachten(melden: () => void) {
  const abfrage = window.matchMedia(SCHMAL);
  abfrage.addEventListener("change", melden);
  return () => abfrage.removeEventListener("change", melden);
}

// Beim Server-Rendern ist die Breite unbekannt, dann gilt erst die breite Ansicht.
function useSchmal() {
  return useSyncExternalStore(schmalBeobachten, () => window.matchMedia(SCHMAL).matches, () => false);
}

// Legende ein oder aus: von Hand gewählt, sonst nach Bildschirmbreite.
export function useLegende() {
  const schmal = useSchmal();
  const [wahl, setWahl] = useState<boolean | null>(null);
  const an = wahl ?? !schmal;
  return { an, umschalten: () => setWahl(!an) };
}

export function LegendenKnopf({ an, umschalten }: { an: boolean; umschalten: () => void }) {
  return (
    <button
      type="button"
      aria-pressed={an}
      aria-label={an ? "Legende ausblenden" : "Legende einblenden"}
      title={an ? "Legende ausblenden" : "Legende einblenden"}
      className={`${knopfKlassen(an ? "primary" : "secondary", "symbol")}`}
      onClick={umschalten}
    >
      <IconAuge className="h-5 w-5" />
    </button>
  );
}

export function zahl(wert: number | null, stellen: number, vorzeichen = false) {
  if (wert === null) return "–";
  return wert.toLocaleString("de-DE", {
    minimumFractionDigits: stellen,
    maximumFractionDigits: stellen,
    signDisplay: vorzeichen ? "exceptZero" : "auto",
  });
}

// Runde Achsenschritte (1, 2, 5, 10, ...), der Maßstab reicht bis zum nächsten.
export function runderSchritt(spanne: number, schritte: number) {
  const roh = spanne / schritte;
  const basis = 10 ** Math.floor(Math.log10(roh));
  const faktor = [1, 2, 5, 10].find((f) => f * basis >= roh) ?? 10;
  return faktor * basis;
}

function massstab(zeilen: Zeile[], reihe: Reihe, schritte: number) {
  const werte = zeilen.flatMap((z) => (reihe.skala ?? [reihe.schluessel]).flatMap((s) => (z[s] === null ? [] : [z[s] as number])));
  const grenzen = reihe.mitNull ? [...werte, 0] : werte;
  const roh = {
    min: reihe.min ?? (grenzen.length ? Math.min(...grenzen) : 0),
    max: reihe.max ?? (grenzen.length ? Math.max(...grenzen) : 1),
  };
  const schritt = runderSchritt(roh.max > roh.min ? roh.max - roh.min : 1, schritte);
  const min = reihe.min ?? Math.floor(roh.min / schritt) * schritt;
  const max = Math.max(reihe.max ?? Math.ceil(roh.max / schritt) * schritt, min + schritt);
  const marken: number[] = [];
  for (let wert = min; wert <= max + schritt / 2; wert += schritt) marken.push(Number(wert.toFixed(6)));
  return { min, max, marken, leer: werte.length === 0, roh };
}

function yAnteil(wert: number, min: number, max: number, hoehe: number) {
  return RAND + (1 - (wert - min) / (max - min)) * (hoehe - 2 * RAND);
}

function schrittzahl(hoehe: number) {
  return hoehe < 100 ? 2 : 4;
}

function BereichGrafik({
  zeilen,
  alle,
  von,
  bis,
  hoehe,
  reihen,
  aktivT,
  tage,
  band,
}: {
  zeilen: Zeile[];
  alle: Zeile[];
  von: number;
  bis: number;
  hoehe: number;
  reihen: Reihe[];
  aktivT: number | null;
  tage: number[];
  band: [number, number] | null;
}) {
  const x = (t: number) => ((t - von) / (bis - von || 1)) * BREITE;
  const achse = massstab(alle, reihen[0], schrittzahl(hoehe));

  return (
    <svg viewBox={`0 0 ${BREITE} ${hoehe}`} preserveAspectRatio="none" className="block w-full rounded-md border border-border" style={{ height: hoehe, background: FLAECHE }} aria-hidden="true">
      {band && <rect x={x(band[0])} y="0" width={x(band[1]) - x(band[0])} height={hoehe} fill="var(--color-muted)" opacity="0.14" />}
      {achse.marken.map((marke) => {
        const y = yAnteil(marke, achse.min, achse.max, hoehe);
        return <line key={marke} x1="0" x2={BREITE} y1={y} y2={y} stroke="var(--color-muted)" strokeOpacity="0.22" strokeWidth="1" vectorEffect="non-scaling-stroke" />;
      })}
      {tage.map((t) => (
        <line key={t} x1={x(t)} x2={x(t)} y1="0" y2={hoehe} stroke="var(--color-muted)" strokeOpacity="0.45" strokeWidth="1" vectorEffect="non-scaling-stroke" />
      ))}
      {reihen.map((reihe) => {
        const { min, max } = massstab(reihe.fenster ? zeilen : alle, reihe, schrittzahl(hoehe));
        const y = (w: number) => yAnteil(w, min, max, hoehe);
        if (reihe.balken) {
          const nulllinie = y(Math.max(min, 0));
          const breite = Math.max(1.5, (BREITE / zeilen.length) * (reihe.versatz ? 0.4 : 0.7));
          return zeilen.map((z) => {
            const w = z[reihe.schluessel];
            if (!w) return null;
            return <rect key={`${reihe.schluessel}-${z.t}`} x={x(z.t) - breite / 2 + breite * (reihe.versatz ?? 0)} y={Math.min(y(w), nulllinie)} width={breite} height={Math.abs(nulllinie - y(w))} fill={reihe.farbe} />;
          });
        }
        let d = "";
        let offen = false;
        for (const z of zeilen) {
          const w = z[reihe.schluessel];
          if (w === null) {
            offen = false;
            continue;
          }
          d += `${offen ? "L" : "M"}${x(z.t).toFixed(1)} ${y(w).toFixed(1)}`;
          offen = true;
        }
        return <path key={reihe.schluessel} d={d} fill="none" stroke={reihe.farbe} strokeWidth="2" strokeDasharray={reihe.zweite ? "6 3" : undefined} strokeLinejoin="round" vectorEffect="non-scaling-stroke" />;
      })}
      {aktivT !== null && (
        <line x1={x(aktivT)} x2={x(aktivT)} y1="0" y2={hoehe} stroke="var(--color-muted)" strokeWidth="1" vectorEffect="non-scaling-stroke" />
      )}
    </svg>
  );
}

// Beschriftung einer Y-Achse; ohne Reihe bleibt die Spalte leer.
function YAchse({ zeilen, hoehe, reihe, ausrichtung }: { zeilen: Zeile[]; hoehe: number; reihe?: Reihe; ausrichtung: "links" | "rechts" }) {
  const achse = reihe ? massstab(zeilen, reihe, schrittzahl(hoehe)) : null;
  return (
    <div className="relative text-[11px] leading-none text-muted tabular-nums" style={{ height: hoehe }}>
      {reihe && achse?.marken.map((marke) => (
        <span
          key={marke}
          className={`absolute -translate-y-1/2 ${ausrichtung === "links" ? "right-1" : "left-1"}`}
          style={{ top: yAnteil(marke, achse.min, achse.max, hoehe) }}
        >
          {marke.toLocaleString("de-DE", { maximumFractionDigits: 2 })}
        </span>
      ))}
    </div>
  );
}

// Mitternacht je Tag im Bereich (Berlin), für Gitter und Zeitachse.
function tagesWechsel(zeilen: { t: number }[]) {
  const wechsel: number[] = [];
  zeilen.forEach((zeile, i) => {
    if (i > 0 && tagFormat.format(zeile.t) !== tagFormat.format(zeilen[i - 1].t)) wechsel.push(zeile.t);
  });
  return wechsel;
}

export function WaagenDiagramm({ titel, zeilen: quelle, zweite }: { titel: string; zeilen: VerlaufZeile[]; zweite?: VerlaufZeile[] }) {
  const [maus, setMaus] = useState<{ x: number; y: number } | null>(null);
  // Rechter Rand des Fensters, null = immer die neuesten Werte.
  const [ende, setEnde] = useState<number | null>(null);
  const ziehen = useRef<{ x: number; ende: number; bewegt: boolean } | null>(null);
  const legende = useLegende();

  const bereiche = zweite ? BEREICHE_ZWEI : BEREICHE;
  const alleReihen = bereiche.flatMap((bereich) => bereich.reihen);
  const zeilen = useMemo(() => zeilenBauen(quelle, zweite), [quelle, zweite]);

  const erste = zeilen[0]?.t ?? 0;
  const letzte = zeilen[zeilen.length - 1]?.t ?? 0;
  const fenster = useSchmal() ? FENSTER_SCHMAL_MS : FENSTER_MS;
  const spanne = Math.min(fenster, letzte - erste || 1);
  const ziehbar = letzte - erste > fenster;
  const bis = Math.min(letzte, Math.max(erste + spanne, ende ?? letzte));
  const von = bis - spanne;

  const alleTage = useMemo(() => tagesWechsel(zeilen), [zeilen]);
  const tage = useMemo(() => alleTage.filter((t) => t > von && t < bis), [alleTage, von, bis]);
  // Je eine Stunde mehr, damit die Linie bis an den Rand reicht. Die Summe beginnt
  // am linken Rand bei 0.
  const sicht = useMemo(() => {
    const davor = zeilen.findLast((z) => z.t < von);
    const relativ = (wert: number | null, basis: number | null | undefined) => (wert === null ? null : wert - (basis ?? 0));
    return zeilen
      .filter((z) => z.t >= von - STUNDE_MS && z.t <= bis + STUNDE_MS)
      .map((z) => ({ ...z, summe: relativ(z.summe, davor?.summe), summeB: relativ(z.summeB, davor?.summeB) }));
  }, [zeilen, von, bis]);

  const aktiv = useMemo(() => {
    const innen = sicht.filter((z) => z.t >= von && z.t <= bis);
    if (innen.length === 0) return null;
    if (!maus) return innen.findLast((z) => z.gewicht !== null || z.gewichtB !== null) ?? innen[innen.length - 1];
    const ziel = von + maus.x * (bis - von);
    return innen.reduce((beste, z) => (Math.abs(z.t - ziel) < Math.abs(beste.t - ziel) ? z : beste));
  }, [maus, sicht, von, bis]);

  if (zeilen.length < 2 || !aktiv) {
    return (
      <figure>
        <figcaption className="text-sm font-semibold">{titel}</figcaption>
        <p className="mt-1 text-sm text-muted">Noch keine Messwerte.</p>
      </figure>
    );
  }

  function zeigen(e: React.PointerEvent<HTMLDivElement>) {
    const rahmen = e.currentTarget.getBoundingClientRect();
    setMaus({
      x: Math.min(1, Math.max(0, (e.clientX - rahmen.left) / rahmen.width)),
      y: Math.min(1, Math.max(0, (e.clientY - rahmen.top) / rahmen.height)),
    });
  }

  function druecken(e: React.PointerEvent<HTMLDivElement>) {
    e.currentTarget.setPointerCapture(e.pointerId);
    ziehen.current = { x: e.clientX, ende: bis, bewegt: false };
    zeigen(e);
  }

  function bewegen(e: React.PointerEvent<HTMLDivElement>) {
    const zug = ziehen.current;
    if (zug && ziehbar) {
      const weg = e.clientX - zug.x;
      if (Math.abs(weg) > 4) zug.bewegt = true;
      if (zug.bewegt) {
        // Nach rechts ziehen holt ältere Tage ins Bild.
        setEnde(zug.ende - (weg / e.currentTarget.getBoundingClientRect().width) * spanne);
        setMaus(null);
        return;
      }
    }
    zeigen(e);
  }

  function loslassen() {
    ziehen.current = null;
  }

  // Der Tag unter der Maus, begrenzt durch die Tageswechsel.
  const band: [number, number] | null = maus
    ? [alleTage.findLast((t) => t <= aktiv.t) ?? von, alleTage.find((t) => t > aktiv.t) ?? bis]
    : null;

  // Je sichtbarem Tag die Gesamtänderung. Ein Tag, von dem am Rand nur ein Stück zu
  // sehen ist, bekommt keine: Das Fähnchen stünde abgeschnitten am Rand.
  const grenzen = [von, ...tage, bis];
  const fahnen = zweite
    ? []
    : grenzen.slice(1).flatMap((tagesEnde, i) => {
        const tagesAnfang = grenzen[i];
        const zeile = sicht.find((z) => z.t >= tagesAnfang && z.t < tagesEnde);
        if (tagesEnde - tagesAnfang < TAG_MS * 0.4 || !zeile) return [];
        return [{ mitte: (tagesAnfang + tagesEnde) / 2, wert: zeile.tagesAenderung }];
      });

  return (
    <figure>
      <figcaption className="flex items-center justify-between gap-3 text-sm">
        <span className="min-w-0">
          <span className="block font-semibold">{titel}</span>
          <span className="block text-xs text-muted tabular-nums">
            {tagFormat.format(von)} bis {tagFormat.format(bis)}
            {ziehbar && " · zum Verschieben ziehen"}
          </span>
        </span>
        <LegendenKnopf an={legende.an} umschalten={legende.umschalten} />
      </figcaption>
      <ul className="mt-1 mb-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted">
        {alleReihen.map((reihe) => (
          <li key={reihe.schluessel} className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: reihe.farbe }} aria-hidden="true" />
            {reihe.label} ({reihe.einheit})
          </li>
        ))}
      </ul>

      <div className="grid grid-cols-[2.25rem_minmax(0,1fr)_2rem]">
        <div className="flex flex-col gap-1">
          {bereiche.map((bereich) => (
            <YAchse key={bereich.reihen[0].schluessel} zeilen={zeilen} hoehe={bereich.hoehe} reihe={bereich.reihen[0]} ausrichtung="links" />
          ))}
        </div>

        <div
          className={`relative flex touch-pan-y flex-col gap-1 select-none ${ziehbar ? "cursor-grab active:cursor-grabbing" : ""}`}
          onPointerDown={druecken}
          onPointerMove={bewegen}
          onPointerUp={loslassen}
          onPointerCancel={loslassen}
          onPointerLeave={() => {
            if (!ziehen.current) setMaus(null);
          }}
        >
          {bereiche.map((bereich) => (
            <BereichGrafik
              key={bereich.reihen[0].schluessel}
              zeilen={sicht}
              alle={zeilen}
              von={von}
              bis={bis}
              hoehe={bereich.hoehe}
              reihen={bereich.reihen}
              aktivT={maus ? aktiv.t : null}
              tage={tage}
              band={band}
            />
          ))}

          {fahnen.map((fahne) => (
            <span
              key={fahne.mitte}
              className="pointer-events-none absolute bottom-1.5 -translate-x-1/2 rounded border border-border bg-card/90 px-1 py-px text-[11px] leading-tight font-medium whitespace-nowrap tabular-nums"
              style={{ left: `${((fahne.mitte - von) / (bis - von || 1)) * 100}%` }}
            >
              {zahl(fahne.wert, 2, true)} kg
            </span>
          ))}

          {legende.an && <dl
            className="pointer-events-none absolute z-10 grid grid-cols-[auto_auto] gap-x-3 rounded-md border border-border bg-card/90 px-2.5 py-1.5 text-xs shadow-md"
            style={{ [maus && maus.x > 0.5 ? "left" : "right"]: 6, [maus && maus.y < 0.5 ? "bottom" : "top"]: 6 }}
          >
            <dt className="col-span-2 mb-0.5 font-semibold">{zeitFormat.format(aktiv.t)}</dt>
            {alleReihen.map((reihe) => (
              <div key={reihe.schluessel} className="contents">
                <dd className="flex items-center gap-1.5 text-muted">
                  <span className="h-2 w-2 rounded-full" style={{ background: reihe.farbe }} aria-hidden="true" />
                  {reihe.label}
                </dd>
                <dd className="text-right font-medium tabular-nums">
                  {zahl(aktiv[reihe.schluessel], reihe.stellen, reihe.mitNull)} {reihe.einheit}
                </dd>
              </div>
            ))}
            <dd className="text-muted">{zweite ? "A Gewicht" : "Gewicht"}</dd>
            <dd className="text-right font-medium tabular-nums">{zahl(aktiv.gewicht, 2)} kg</dd>
            {zweite && (
              <>
                <dd className="text-muted">B Gewicht</dd>
                <dd className="text-right font-medium tabular-nums">{zahl(aktiv.gewichtB, 2)} kg</dd>
                <dd className="mt-0.5 border-t border-border pt-0.5 font-semibold">A Änderung Tag</dd>
                <dd className="mt-0.5 border-t border-border pt-0.5 text-right font-semibold tabular-nums">{zahl(aktiv.tagesAenderung, 2, true)} kg</dd>
                <dd className="font-semibold">B Änderung Tag</dd>
                <dd className="text-right font-semibold tabular-nums">{zahl(aktiv.tagesAenderungB, 2, true)} kg</dd>
              </>
            )}
          </dl>}
        </div>

        <div className="flex flex-col gap-1">
          {bereiche.map((bereich) => (
            <YAchse
              key={bereich.reihen[0].schluessel}
              zeilen={bereich.reihen[1]?.fenster ? sicht : zeilen}
              hoehe={bereich.hoehe}
              reihe={bereich.reihen[1]?.balken ? undefined : bereich.reihen[1]}
              ausrichtung="rechts"
            />
          ))}
        </div>

        <div className="relative col-start-2 mt-1 h-4 overflow-hidden text-[11px] text-muted">
          {tage.map((t) => (
            <span key={t} className="absolute -translate-x-1/2 tabular-nums" style={{ left: `${((t - von) / (bis - von || 1)) * 100}%` }}>
              {tagFormat.format(t)}
            </span>
          ))}
        </div>
      </div>

      {ziehbar && (
        <div className="mt-2 flex flex-wrap gap-2">
          <button type="button" className={knopfKlassen("secondary", "mittel")} disabled={von <= erste} onClick={() => setEnde(bis - TAG_MS)}>
            Einen Tag zurück
          </button>
          <button type="button" className={knopfKlassen("secondary", "mittel")} disabled={bis >= letzte} onClick={() => setEnde(bis + TAG_MS)}>
            Einen Tag vor
          </button>
          <button type="button" className={knopfKlassen("secondary", "mittel")} disabled={bis >= letzte} onClick={() => setEnde(null)}>
            Neueste
          </button>
        </div>
      )}
    </figure>
  );
}
