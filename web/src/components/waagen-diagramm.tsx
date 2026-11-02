"use client";

import { useMemo, useState } from "react";
import type { VerlaufZeile } from "@/lib/waagen";

// Verlauf einer Waage nach dem Vorbild der Wolf-Auswertung: drei Bereiche
// untereinander auf derselben Zeitachse. Oben teilen sich Temperatur, Feuchte
// und Regen einen Bereich, jede Größe mit eigenem Maßstab, darunter Wind, unten
// das Gewicht. Die Legende mit den Werten zur Mausposition weicht in die Ecke
// gegenüber der Maus aus. Ohne Wert reißt die Linie ab.

const BREITE = 600;

// Am 2.11.2026 mit dem Farbprüfer der Diagramm-Leitlinien geprüft (auch für
// Farbfehlsichtigkeit). Im dunklen Design ist der Kontrast knapp, die Werte
// stehen deshalb immer auch als Text in Legende und Tabelle.
const FARBE_TEMPERATUR = "#c8483c";
const FARBE_FEUCHTE = "#7a55d6";
const FARBE_REGEN = "#1a9a8a";

type Schluessel = "gewicht" | "temperatur" | "feuchte" | "regen" | "wind";

type Reihe = {
  schluessel: Schluessel;
  label: string;
  einheit: string;
  farbe: string;
  stellen: number;
  balken?: boolean;
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
  { hoehe: 70, reihen: [{ schluessel: "wind", label: "Wind", einheit: "km/h", farbe: "var(--color-accent)", stellen: 1, min: 0 }] },
  { hoehe: 130, reihen: [{ schluessel: "gewicht", label: "Gewicht", einheit: "kg", farbe: "var(--color-accent)", stellen: 2 }] },
];

const zeitFormat = new Intl.DateTimeFormat("de-DE", {
  day: "2-digit",
  month: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Europe/Berlin",
});
const tagFormat = new Intl.DateTimeFormat("de-DE", { day: "2-digit", month: "2-digit", timeZone: "Europe/Berlin" });

function zahl(wert: number | null, stellen: number) {
  if (wert === null) return "–";
  return wert.toLocaleString("de-DE", { minimumFractionDigits: stellen, maximumFractionDigits: stellen });
}

function spanne(zeilen: VerlaufZeile[], reihe: Reihe) {
  const werte = zeilen.flatMap((z) => (z[reihe.schluessel] === null ? [] : [z[reihe.schluessel] as number]));
  const min = reihe.min ?? (werte.length ? Math.min(...werte) : 0);
  const max = reihe.max ?? (werte.length ? Math.max(...werte) : 1);
  return { min, max: max > min ? max : min + 1, leer: werte.length === 0 };
}

function BereichGrafik({ zeilen, hoehe, reihen, aktivT }: { zeilen: VerlaufZeile[]; hoehe: number; reihen: Reihe[]; aktivT: number | null }) {
  const t0 = zeilen[0].t;
  const t1 = zeilen[zeilen.length - 1].t;
  const x = (t: number) => ((t - t0) / (t1 - t0 || 1)) * BREITE;

  return (
    <svg viewBox={`0 0 ${BREITE} ${hoehe}`} preserveAspectRatio="none" className="block w-full rounded-md border border-border" style={{ height: hoehe }} aria-hidden="true">
      {reihen.map((reihe) => {
        const { min, max } = spanne(zeilen, reihe);
        const y = (w: number) => 6 + (1 - (w - min) / (max - min)) * (hoehe - 12);
        if (reihe.balken) {
          const breite = Math.max(1.5, (BREITE / zeilen.length) * 0.7);
          return zeilen.map((z) => {
            const w = z[reihe.schluessel];
            return w ? <rect key={`${reihe.schluessel}-${z.t}`} x={x(z.t) - breite / 2} y={y(w)} width={breite} height={hoehe - 6 - y(w)} fill={reihe.farbe} /> : null;
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

export function WaagenDiagramm({ titel, zeilen }: { titel: string; zeilen: VerlaufZeile[] }) {
  const [maus, setMaus] = useState<{ x: number; y: number } | null>(null);

  const aktiv = useMemo(() => {
    if (!maus || zeilen.length < 2) return null;
    const t0 = zeilen[0].t;
    const ziel = t0 + maus.x * (zeilen[zeilen.length - 1].t - t0);
    return zeilen.reduce((beste, z) => (Math.abs(z.t - ziel) < Math.abs(beste.t - ziel) ? z : beste));
  }, [maus, zeilen]);

  if (zeilen.length < 2) {
    return (
      <figure>
        <figcaption className="text-sm font-semibold">{titel}</figcaption>
        <p className="mt-1 text-sm text-muted">Noch keine Messwerte.</p>
      </figure>
    );
  }

  function bewegen(e: React.PointerEvent<HTMLDivElement>) {
    const rahmen = e.currentTarget.getBoundingClientRect();
    setMaus({
      x: Math.min(1, Math.max(0, (e.clientX - rahmen.left) / rahmen.width)),
      y: Math.min(1, Math.max(0, (e.clientY - rahmen.top) / rahmen.height)),
    });
  }

  const alleReihen = BEREICHE.flatMap((bereich) => bereich.reihen);

  return (
    <figure>
      <figcaption className="text-sm font-semibold">{titel}</figcaption>
      <ul className="mt-1 mb-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted">
        {alleReihen.map((reihe) => {
          const { min, max, leer } = spanne(zeilen, reihe);
          return (
            <li key={reihe.schluessel} className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full" style={{ background: reihe.farbe }} aria-hidden="true" />
              {reihe.label}
              {!leer && !reihe.max && ` ${zahl(min, reihe.stellen)} bis ${zahl(max, reihe.stellen)} ${reihe.einheit}`}
            </li>
          );
        })}
      </ul>

      <div className="relative flex touch-pan-y flex-col gap-1" onPointerMove={bewegen} onPointerDown={bewegen} onPointerLeave={() => setMaus(null)}>
        {BEREICHE.map((bereich) => (
          <BereichGrafik key={bereich.reihen[0].schluessel} zeilen={zeilen} hoehe={bereich.hoehe} reihen={bereich.reihen} aktivT={aktiv?.t ?? null} />
        ))}

        {aktiv && maus && (
          <dl
            className="pointer-events-none absolute z-10 grid grid-cols-[auto_auto] gap-x-3 rounded-md border border-border bg-card px-2.5 py-1.5 text-xs shadow-md"
            style={{ [maus.x > 0.5 ? "left" : "right"]: 6, [maus.y > 0.5 ? "top" : "bottom"]: 6 }}
          >
            <dt className="col-span-2 mb-0.5 font-semibold">{zeitFormat.format(aktiv.t)}</dt>
            {alleReihen.map((reihe) => (
              <div key={reihe.schluessel} className="contents">
                <dd className="flex items-center gap-1.5 text-muted">
                  <span className="h-2 w-2 rounded-full" style={{ background: reihe.farbe }} aria-hidden="true" />
                  {reihe.label}
                </dd>
                <dd className="text-right font-medium tabular-nums">
                  {zahl(aktiv[reihe.schluessel], reihe.stellen)} {reihe.einheit}
                </dd>
              </div>
            ))}
          </dl>
        )}
      </div>

      <div className="mt-0.5 flex justify-between text-xs text-muted">
        <span>{tagFormat.format(zeilen[0].t)}</span>
        <span>{tagFormat.format(zeilen[zeilen.length - 1].t)}</span>
      </div>
    </figure>
  );
}
