"use client";

import { useMemo, useRef, useState } from "react";
import { knopfKlassen } from "@/components/ui";
import type { VerlaufZeile } from "@/lib/waagen";

// Verlauf einer Waage nach dem Vorbild der Wolf-Auswertung: drei Bereiche
// untereinander auf derselben Zeitachse. Oben teilen sich Temperatur, Feuchte
// und Regen einen Bereich, Temperatur mit Achse links, Feuchte rechts. Darunter
// das Gewicht, unten die stündliche Änderung als Balken. Die Legende ist immer
// da: Sie zeigt die Werte zur Mausposition samt Änderung des ganzen Tages, sonst
// die jüngsten, und weicht in die Ecke gegenüber der Maus aus. Der Tag unter der
// Maus ist hinterlegt. Ohne Wert reißt die Linie ab. Sichtbar sind 7 Tage, die
// übrigen erreicht man durch Ziehen; die Y-Achsen gelten für alle Daten, damit
// die Linien dabei nicht springen.

const BREITE = 600;
const STUNDE_MS = 60 * 60 * 1000;
const TAG_MS = 24 * STUNDE_MS;
const FENSTER_MS = 7 * TAG_MS;
const RAND = 6;

// Am 2.11.2026 mit dem Farbprüfer der Diagramm-Leitlinien geprüft (auch für
// Farbfehlsichtigkeit). Im dunklen Design ist der Kontrast knapp, die Werte
// stehen deshalb immer auch als Text in Legende und Tabelle.
const FARBE_TEMPERATUR = "#c8483c";
const FARBE_FEUCHTE = "#7a55d6";
const FARBE_REGEN = "#1a9a8a";

// Hebt die Diagrammfläche von der Karte ab: im dunklen Design etwas heller, im
// hellen etwas dunkler.
const FLAECHE = "color-mix(in srgb, var(--color-foreground) 7%, var(--color-card))";

type Schluessel = "gewicht" | "aenderung" | "temperatur" | "feuchte" | "regen";

type Reihe = {
  schluessel: Schluessel;
  label: string;
  einheit: string;
  farbe: string;
  stellen: number;
  balken?: boolean;
  // Skala schließt 0 ein, Werte mit Vorzeichen.
  mitNull?: boolean;
  // Fester Maßstab; sonst aus den Werten.
  min?: number;
  max?: number;
};

const BEREICHE: { hoehe: number; reihen: Reihe[] }[] = [
  {
    hoehe: 170,
    reihen: [
      { schluessel: "temperatur", label: "Temperatur", einheit: "°C", farbe: FARBE_TEMPERATUR, stellen: 1 },
      { schluessel: "feuchte", label: "Luftfeuchte", einheit: "%", farbe: FARBE_FEUCHTE, stellen: 0, min: 0, max: 100 },
      { schluessel: "regen", label: "Regen", einheit: "mm", farbe: FARBE_REGEN, stellen: 1, balken: true, min: 0 },
    ],
  },
  { hoehe: 130, reihen: [{ schluessel: "gewicht", label: "Gewicht", einheit: "kg", farbe: "var(--color-accent)", stellen: 2 }] },
  { hoehe: 100, reihen: [{ schluessel: "aenderung", label: "Änderung je Stunde", einheit: "kg", farbe: FARBE_REGEN, stellen: 2, balken: true, mitNull: true }] },
];

const ALLE_REIHEN = BEREICHE.flatMap((bereich) => bereich.reihen);

const zeitFormat = new Intl.DateTimeFormat("de-DE", {
  day: "2-digit",
  month: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Europe/Berlin",
});
const tagFormat = new Intl.DateTimeFormat("de-DE", { day: "2-digit", month: "2-digit", timeZone: "Europe/Berlin" });

function zahl(wert: number | null, stellen: number, vorzeichen = false) {
  if (wert === null) return "–";
  return wert.toLocaleString("de-DE", {
    minimumFractionDigits: stellen,
    maximumFractionDigits: stellen,
    signDisplay: vorzeichen ? "exceptZero" : "auto",
  });
}

// Runde Achsenschritte (1, 2, 5, 10, ...), der Maßstab reicht bis zum nächsten.
function runderSchritt(spanne: number, schritte: number) {
  const roh = spanne / schritte;
  const basis = 10 ** Math.floor(Math.log10(roh));
  const faktor = [1, 2, 5, 10].find((f) => f * basis >= roh) ?? 10;
  return faktor * basis;
}

function massstab(zeilen: VerlaufZeile[], reihe: Reihe, schritte: number) {
  const werte = zeilen.flatMap((z) => (z[reihe.schluessel] === null ? [] : [z[reihe.schluessel] as number]));
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
  zeilen: VerlaufZeile[];
  alle: VerlaufZeile[];
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
        const { min, max } = massstab(alle, reihe, schrittzahl(hoehe));
        const y = (w: number) => yAnteil(w, min, max, hoehe);
        if (reihe.balken) {
          const nulllinie = y(Math.max(min, 0));
          const breite = Math.max(1.5, (BREITE / zeilen.length) * 0.7);
          return zeilen.map((z) => {
            const w = z[reihe.schluessel];
            if (!w) return null;
            return <rect key={`${reihe.schluessel}-${z.t}`} x={x(z.t) - breite / 2} y={Math.min(y(w), nulllinie)} width={breite} height={Math.abs(nulllinie - y(w))} fill={reihe.farbe} />;
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
        return <path key={reihe.schluessel} d={d} fill="none" stroke={reihe.farbe} strokeWidth="2" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />;
      })}
      {aktivT !== null && (
        <line x1={x(aktivT)} x2={x(aktivT)} y1="0" y2={hoehe} stroke="var(--color-muted)" strokeWidth="1" vectorEffect="non-scaling-stroke" />
      )}
    </svg>
  );
}

// Beschriftung einer Y-Achse; ohne Reihe bleibt die Spalte leer.
function YAchse({ zeilen, hoehe, reihe, ausrichtung }: { zeilen: VerlaufZeile[]; hoehe: number; reihe?: Reihe; ausrichtung: "links" | "rechts" }) {
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
function tagesWechsel(zeilen: VerlaufZeile[]) {
  const wechsel: number[] = [];
  zeilen.forEach((zeile, i) => {
    if (i > 0 && tagFormat.format(zeile.t) !== tagFormat.format(zeilen[i - 1].t)) wechsel.push(zeile.t);
  });
  return wechsel;
}

export function WaagenDiagramm({ titel, zeilen }: { titel: string; zeilen: VerlaufZeile[] }) {
  const [maus, setMaus] = useState<{ x: number; y: number } | null>(null);
  // Rechter Rand des Fensters, null = immer die neuesten Werte.
  const [ende, setEnde] = useState<number | null>(null);
  const ziehen = useRef<{ x: number; ende: number; bewegt: boolean } | null>(null);

  const erste = zeilen[0]?.t ?? 0;
  const letzte = zeilen[zeilen.length - 1]?.t ?? 0;
  const spanne = Math.min(FENSTER_MS, letzte - erste || 1);
  const ziehbar = letzte - erste > FENSTER_MS;
  const bis = Math.min(letzte, Math.max(erste + spanne, ende ?? letzte));
  const von = bis - spanne;

  const alleTage = useMemo(() => tagesWechsel(zeilen), [zeilen]);
  const tage = useMemo(() => alleTage.filter((t) => t > von && t < bis), [alleTage, von, bis]);
  // Je eine Stunde mehr, damit die Linie bis an den Rand reicht.
  const sicht = useMemo(() => zeilen.filter((z) => z.t >= von - STUNDE_MS && z.t <= bis + STUNDE_MS), [zeilen, von, bis]);

  const aktiv = useMemo(() => {
    const innen = sicht.filter((z) => z.t >= von && z.t <= bis);
    if (innen.length === 0) return null;
    if (!maus) return innen.findLast((z) => z.gewicht !== null) ?? innen[innen.length - 1];
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

  return (
    <figure>
      <figcaption className="flex flex-wrap items-baseline justify-between gap-x-3 text-sm">
        <span className="font-semibold">{titel}</span>
        <span className="text-xs text-muted tabular-nums">
          {tagFormat.format(von)} bis {tagFormat.format(bis)}
          {ziehbar && " · zum Verschieben ziehen"}
        </span>
      </figcaption>
      <ul className="mt-1 mb-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted">
        {ALLE_REIHEN.map((reihe) => (
          <li key={reihe.schluessel} className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: reihe.farbe }} aria-hidden="true" />
            {reihe.label} ({reihe.einheit})
          </li>
        ))}
      </ul>

      <div className="grid grid-cols-[2.25rem_minmax(0,1fr)_2rem]">
        <div className="flex flex-col gap-1">
          {BEREICHE.map((bereich) => (
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
          {BEREICHE.map((bereich) => (
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

          <dl
            className="pointer-events-none absolute z-10 grid grid-cols-[auto_auto] gap-x-3 rounded-md border border-border bg-card/90 px-2.5 py-1.5 text-xs shadow-md"
            style={{ [maus && maus.x > 0.5 ? "left" : "right"]: 6, [maus && maus.y < 0.5 ? "bottom" : "top"]: 6 }}
          >
            <dt className="col-span-2 mb-0.5 font-semibold">{zeitFormat.format(aktiv.t)}</dt>
            {ALLE_REIHEN.map((reihe) => (
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
            <dd className="mt-0.5 border-t border-border pt-0.5 font-semibold">Änderung Tag</dd>
            <dd className="mt-0.5 border-t border-border pt-0.5 text-right font-semibold tabular-nums">{zahl(aktiv.tagesAenderung, 2, true)} kg</dd>
          </dl>
        </div>

        <div className="flex flex-col gap-1">
          {BEREICHE.map((bereich) => (
            <YAchse
              key={bereich.reihen[0].schluessel}
              zeilen={zeilen}
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
          <button type="button" className={knopfKlassen("leise", "mittel")} disabled={bis >= letzte} onClick={() => setEnde(null)}>
            Neueste
          </button>
        </div>
      )}
    </figure>
  );
}
