"use client";

import { useMemo, useState } from "react";
import { knopfKlassen } from "@/components/ui";
import { LegendenKnopf, runderSchritt, useLegende, zahl, FLAECHE } from "@/components/waagen-diagramm";

// Gewicht mehrerer Waagen in einem Diagramm, aus den dauerhaft gespeicherten
// Tageswerten. Die Farbe hängt an der Waage, nicht an der Position in der
// Auswahl. Ohne Wert reißt die Linie ab, eine Waage beginnt dort, wo sie misst.

export const MAX_VERGLEICH = 6;

// Mit dem Farbprüfer der Diagramm-Leitlinien geprüft. Im dunklen Design ist der
// Kontrast knapp, die Namen stehen deshalb immer auch als Text in der Legende.
export const WAAGEN_FARBEN = ["#2f8fe0", "#c97420", "#2fa66b", "#c23f7a", "#7a55d6", "#8c8c1e"];

const TAG_MS = 24 * 60 * 60 * 1000;
const BREITE = 800;
const HOEHE = 320;
const RAND = 8;

const ZEITRAEUME = [
  { label: "1 Monat", tage: 31 },
  { label: "3 Monate", tage: 92 },
  { label: "Alles", tage: null },
];

const tagFormat = new Intl.DateTimeFormat("de-DE", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "UTC" });
const monatFormat = new Intl.DateTimeFormat("de-DE", { month: "short", timeZone: "UTC" });

export type VergleichsWaage = { id: string; name: string; farbe: string; tage: { t: number; w: number | null }[] };

function monatsWechsel(von: number, bis: number) {
  const wechsel: number[] = [];
  const datum = new Date(von);
  datum.setUTCDate(1);
  for (datum.setUTCMonth(datum.getUTCMonth() + 1); datum.getTime() < bis; datum.setUTCMonth(datum.getUTCMonth() + 1)) {
    wechsel.push(datum.getTime());
  }
  return wechsel;
}

export function WaagenGewichtsvergleich({ waagen }: { waagen: VergleichsWaage[] }) {
  const [tage, setTage] = useState<number | null>(null);
  const [maus, setMaus] = useState<{ x: number; y: number } | null>(null);
  const legende = useLegende();

  const alleZeiten = useMemo(() => waagen.flatMap((w) => w.tage.map((p) => p.t)), [waagen]);
  const bis = alleZeiten.length ? Math.max(...alleZeiten) : 0;
  const frueheste = alleZeiten.length ? Math.min(...alleZeiten) : 0;
  const von = tage === null ? frueheste : Math.max(frueheste, bis - tage * TAG_MS);

  const reihen = useMemo(
    () => waagen.map((w) => ({ ...w, tage: w.tage.filter((p) => p.t >= von && p.t <= bis) })),
    [waagen, von, bis],
  );
  const werte = reihen.flatMap((r) => r.tage.flatMap((p) => (p.w === null ? [] : [p.w])));

  if (werte.length === 0) {
    return <p className="text-sm text-muted">Für diese Waagen gibt es noch keine Tageswerte.</p>;
  }

  const roh = { min: Math.min(...werte), max: Math.max(...werte) };
  const schritt = runderSchritt(roh.max > roh.min ? roh.max - roh.min : 1, 6);
  const min = Math.floor(roh.min / schritt) * schritt;
  const max = Math.max(Math.ceil(roh.max / schritt) * schritt, min + schritt);
  const marken: number[] = [];
  for (let wert = min; wert <= max + schritt / 2; wert += schritt) marken.push(Number(wert.toFixed(6)));

  const x = (t: number) => ((t - von) / (bis - von || 1)) * BREITE;
  const y = (w: number) => RAND + (1 - (w - min) / (max - min)) * (HOEHE - 2 * RAND);
  const monate = monatsWechsel(von, bis);

  const aktivT = maus ? Math.round((von + maus.x * (bis - von)) / TAG_MS) * TAG_MS : bis;
  const zeile = reihen.map((r) => ({
    ...r,
    wert: r.tage.find((p) => Math.abs(p.t - aktivT) < TAG_MS / 2)?.w ?? null,
  }));

  function zeigen(e: React.PointerEvent<HTMLDivElement>) {
    const rahmen = e.currentTarget.getBoundingClientRect();
    setMaus({
      x: Math.min(1, Math.max(0, (e.clientX - rahmen.left) / rahmen.width)),
      y: Math.min(1, Math.max(0, (e.clientY - rahmen.top) / rahmen.height)),
    });
  }

  function pfad(punkte: { t: number; w: number | null }[]) {
    let d = "";
    let vorher: number | null = null;
    for (const p of punkte) {
      if (p.w === null) {
        vorher = null;
        continue;
      }
      const anschluss = vorher !== null && p.t - vorher <= TAG_MS * 1.5;
      d += `${anschluss ? "L" : "M"}${x(p.t).toFixed(1)} ${y(p.w).toFixed(1)}`;
      vorher = p.t;
    }
    return d;
  }

  return (
    <figure>
      <figcaption className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-sm font-semibold">Gewichtsvergleich</span>
        <span className="flex flex-wrap items-center gap-1.5">
          <LegendenKnopf an={legende.an} umschalten={legende.umschalten} />
          {ZEITRAEUME.map((z) => (
            <button
              key={z.label}
              type="button"
              aria-pressed={tage === z.tage}
              className={knopfKlassen(tage === z.tage ? "primary" : "secondary", "mittel")}
              onClick={() => setTage(z.tage)}
            >
              {z.label}
            </button>
          ))}
        </span>
      </figcaption>
      <ul className="mt-2 mb-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted">
        {reihen.map((r) => (
          <li key={r.id} className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: r.farbe }} aria-hidden="true" />
            {r.name}
          </li>
        ))}
      </ul>

      <div className="grid grid-cols-[2.25rem_minmax(0,1fr)]">
        <div className="relative text-[11px] leading-none text-muted tabular-nums" style={{ height: HOEHE }}>
          {marken.map((marke) => (
            <span key={marke} className="absolute right-1 -translate-y-1/2" style={{ top: y(marke) }}>
              {marke.toLocaleString("de-DE", { maximumFractionDigits: 1 })}
            </span>
          ))}
        </div>

        <div className="relative touch-pan-y select-none" onPointerDown={zeigen} onPointerMove={zeigen} onPointerLeave={() => setMaus(null)}>
          <svg
            viewBox={`0 0 ${BREITE} ${HOEHE}`}
            preserveAspectRatio="none"
            className="block w-full rounded-md border border-border"
            style={{ height: HOEHE, background: FLAECHE }}
            role="img"
            aria-label={`Gewicht von ${reihen.map((r) => r.name).join(", ")}`}
          >
            {marken.map((marke) => (
              <line key={marke} x1="0" x2={BREITE} y1={y(marke)} y2={y(marke)} stroke="var(--color-muted)" strokeOpacity="0.22" strokeWidth="1" vectorEffect="non-scaling-stroke" />
            ))}
            {monate.map((t) => (
              <line key={t} x1={x(t)} x2={x(t)} y1="0" y2={HOEHE} stroke="var(--color-muted)" strokeOpacity="0.45" strokeWidth="1" vectorEffect="non-scaling-stroke" />
            ))}
            {reihen.map((r) => (
              <path key={r.id} d={pfad(r.tage)} fill="none" stroke={r.farbe} strokeWidth="2" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
            ))}
            {maus && <line x1={x(aktivT)} x2={x(aktivT)} y1="0" y2={HOEHE} stroke="var(--color-muted)" strokeWidth="1" vectorEffect="non-scaling-stroke" />}
          </svg>

          {legende.an && <dl
            className="pointer-events-none absolute z-10 grid grid-cols-[auto_auto] gap-x-3 rounded-md border border-border bg-card/90 px-2.5 py-1.5 text-xs shadow-md"
            style={{ [maus && maus.x > 0.5 ? "left" : "right"]: 6, [maus && maus.y < 0.5 ? "bottom" : "top"]: 6 }}
          >
            <dt className="col-span-2 mb-0.5 font-semibold">{tagFormat.format(aktivT)}</dt>
            {zeile.map((r) => (
              <div key={r.id} className="contents">
                <dd className="flex items-center gap-1.5 text-muted">
                  <span className="h-2 w-2 rounded-full" style={{ background: r.farbe }} aria-hidden="true" />
                  {r.name}
                </dd>
                <dd className="text-right font-medium tabular-nums">{zahl(r.wert, 2)} kg</dd>
              </div>
            ))}
          </dl>}
        </div>

        <div className="relative col-start-2 mt-1 h-4 overflow-hidden text-[11px] text-muted">
          {monate.map((t) => (
            <span key={t} className="absolute tabular-nums" style={{ left: `${(x(t) / BREITE) * 100}%` }}>
              {monatFormat.format(t)}
            </span>
          ))}
        </div>
      </div>
    </figure>
  );
}
