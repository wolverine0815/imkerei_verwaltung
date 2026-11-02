"use client";

import { useMemo, useState } from "react";
import type { DiagrammPunkt } from "@/lib/waagen";

const BREITE = 600;
const HOEHE = 160;
const RAND_OBEN = 8;
const RAND_UNTEN = 8;

const zeitFormat = new Intl.DateTimeFormat("de-DE", {
  day: "2-digit",
  month: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Europe/Berlin",
});
const tagFormat = new Intl.DateTimeFormat("de-DE", { day: "2-digit", month: "2-digit", timeZone: "Europe/Berlin" });

function zahl(wert: number, stellen: number) {
  return wert.toLocaleString("de-DE", { minimumFractionDigits: stellen, maximumFractionDigits: stellen });
}

// Linie einer Messgröße über die Zeit. Jede Größe bekommt ein eigenes Diagramm
// statt einer zweiten Achse. Ohne Wert (Beute abgehoben, Funkloch) reißt die
// Linie ab, statt die Lücke zu überbrücken.
export function WaagenDiagramm({
  titel,
  einheit,
  punkte,
  stellen = 1,
}: {
  titel: string;
  einheit: string;
  punkte: DiagrammPunkt[];
  stellen?: number;
}) {
  const [aktiv, setAktiv] = useState<number | null>(null);

  const skala = useMemo(() => {
    const werte = punkte.flatMap((p) => (p.w === null ? [] : [p.w]));
    if (werte.length === 0 || punkte.length < 2) return null;
    const min = Math.min(...werte);
    const max = Math.max(...werte);
    const spanne = max - min || 1;
    const t0 = punkte[0].t;
    const t1 = punkte[punkte.length - 1].t;
    const x = (t: number) => ((t - t0) / (t1 - t0 || 1)) * BREITE;
    const y = (w: number) => RAND_OBEN + (1 - (w - min) / spanne) * (HOEHE - RAND_OBEN - RAND_UNTEN);
    return { min, max, t0, t1, x, y };
  }, [punkte]);

  const pfad = useMemo(() => {
    if (!skala) return "";
    let d = "";
    let offen = false;
    for (const p of punkte) {
      if (p.w === null) {
        offen = false;
        continue;
      }
      d += `${offen ? "L" : "M"}${skala.x(p.t).toFixed(1)} ${skala.y(p.w).toFixed(1)}`;
      offen = true;
    }
    return d;
  }, [punkte, skala]);

  if (!skala) {
    return (
      <figure>
        <figcaption className="text-sm font-semibold">{titel}</figcaption>
        <p className="mt-1 text-sm text-muted">Noch keine Messwerte.</p>
      </figure>
    );
  }

  function zeigen(clientX: number, rahmen: DOMRect) {
    const anteil = Math.min(1, Math.max(0, (clientX - rahmen.left) / rahmen.width));
    const ziel = skala!.t0 + anteil * (skala!.t1 - skala!.t0);
    let beste = -1;
    let abstand = Infinity;
    punkte.forEach((p, i) => {
      if (p.w !== null && Math.abs(p.t - ziel) < abstand) {
        abstand = Math.abs(p.t - ziel);
        beste = i;
      }
    });
    setAktiv(beste >= 0 ? beste : null);
  }

  const punkt = aktiv === null ? null : punkte[aktiv];
  const anteil = punkt ? skala.x(punkt.t) / BREITE : 0;

  return (
    <figure>
      <figcaption className="flex items-baseline justify-between gap-2">
        <span className="text-sm font-semibold">{titel}</span>
        <span className="text-xs text-muted">
          {zahl(skala.min, stellen)} bis {zahl(skala.max, stellen)} {einheit}
        </span>
      </figcaption>
      <div
        className="relative mt-1 touch-pan-y"
        onPointerMove={(e) => zeigen(e.clientX, e.currentTarget.getBoundingClientRect())}
        onPointerDown={(e) => zeigen(e.clientX, e.currentTarget.getBoundingClientRect())}
        onPointerLeave={() => setAktiv(null)}
      >
        <svg
          viewBox={`0 0 ${BREITE} ${HOEHE}`}
          preserveAspectRatio="none"
          className="block h-36 w-full rounded-md border border-border"
          role="img"
          aria-label={`${titel}: ${zahl(skala.min, stellen)} bis ${zahl(skala.max, stellen)} ${einheit}`}
        >
          <path d={pfad} fill="none" stroke="var(--color-accent)" strokeWidth="2" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
          {punkt && punkt.w !== null && (
            <line
              x1={skala.x(punkt.t)}
              x2={skala.x(punkt.t)}
              y1="0"
              y2={HOEHE}
              stroke="var(--color-muted)"
              strokeWidth="1"
              vectorEffect="non-scaling-stroke"
            />
          )}
        </svg>
        {punkt && punkt.w !== null && (
          <div
            className="pointer-events-none absolute top-1 z-10 rounded-md border border-border bg-card px-2 py-1 text-xs whitespace-nowrap shadow-md"
            style={anteil > 0.6 ? { right: `${(1 - anteil) * 100}%` } : { left: `${anteil * 100}%` }}
          >
            <span className="font-semibold">
              {zahl(punkt.w, stellen)} {einheit}
            </span>
            <span className="ml-2 text-muted">{zeitFormat.format(punkt.t)}</span>
          </div>
        )}
      </div>
      <div className="mt-0.5 flex justify-between text-xs text-muted">
        <span>{tagFormat.format(skala.t0)}</span>
        <span>{tagFormat.format(skala.t1)}</span>
      </div>
    </figure>
  );
}
