"use client";

import { useMemo, useState } from "react";
import { knopfKlassen } from "@/components/ui";
import { WaagenDiagramm } from "@/components/waagen-diagramm";
import { MAX_VERGLEICH, WAAGEN_FARBEN, WaagenGewichtsvergleich } from "@/components/waagen-gewichtsvergleich";
import type { VerlaufZeile } from "@/lib/waagen";

// Waagenauswertung: oben Anzahl und Auswahl der Waagen, darunter je nach Anzahl
// das volle Diagramm (eine Waage), das Diagramm mit beiden Waagen A und B oder
// der reine Gewichtsvergleich.

export type AuswertungsWaage = {
  id: string;
  name: string;
  wo: string;
  zeilen: VerlaufZeile[];
  tage: { t: number; w: number | null }[];
};

type Modus = "eine" | "zwei" | "viele";

const MODI: { wert: Modus; label: string }[] = [
  { wert: "eine", label: "Eine Waage" },
  { wert: "zwei", label: "Zwei Waagen" },
  { wert: "viele", label: "Viele Waagen" },
];

export function WaagenVergleich({ waagen }: { waagen: AuswertungsWaage[] }) {
  const [modus, setModus] = useState<Modus>("eine");
  const [auswahl, setAuswahl] = useState<string[]>(() => waagen.slice(0, 1).map((w) => w.id));

  function modusWaehlen(neu: Modus) {
    setModus(neu);
    if (neu === "eine") setAuswahl((a) => a.slice(0, 1));
    if (neu === "zwei") {
      setAuswahl((a) => [...a, ...waagen.map((w) => w.id).filter((id) => !a.includes(id))].slice(0, 2));
    }
    if (neu === "viele") setAuswahl(waagen.slice(0, MAX_VERGLEICH).map((w) => w.id));
  }

  function umschalten(id: string) {
    setAuswahl((a) => {
      if (modus === "eine") return [id];
      if (a.includes(id)) return a.length > 1 ? a.filter((x) => x !== id) : a;
      if (modus === "zwei") return [...a, id].slice(-2);
      return a.length < MAX_VERGLEICH ? [...a, id] : a;
    });
  }

  const gewaehlt = auswahl.flatMap((id) => waagen.filter((w) => w.id === id));
  const vergleich = useMemo(
    () =>
      waagen
        .map((w, i) => ({ id: w.id, name: w.name, farbe: WAAGEN_FARBEN[i % WAAGEN_FARBEN.length], tage: w.tage }))
        .filter((w) => auswahl.includes(w.id)),
    [waagen, auswahl],
  );

  const [a, b] = gewaehlt;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-1.5" role="group" aria-label="Anzahl der Waagen">
        {MODI.map((m) => (
          <button
            key={m.wert}
            type="button"
            aria-pressed={modus === m.wert}
            disabled={m.wert !== "eine" && waagen.length < 2}
            className={knopfKlassen(modus === m.wert ? "primary" : "secondary", "mittel")}
            onClick={() => modusWaehlen(m.wert)}
          >
            {m.label}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap gap-2" role="group" aria-label="Waagen auswählen">
        {waagen.map((waage) => {
          const an = auswahl.includes(waage.id);
          const buchstabe = modus === "zwei" && an ? (auswahl[0] === waage.id ? "A" : "B") : null;
          return (
            <button
              key={waage.id}
              type="button"
              aria-pressed={an}
              onClick={() => umschalten(waage.id)}
              className={`flex min-h-11 flex-col rounded-md border px-3 py-1.5 text-left text-sm transition-colors ${
                an ? "border-accent bg-accent text-accent-foreground" : "border-rand-ruhig bg-card hover:bg-background"
              }`}
            >
              <span className="font-semibold">
                {buchstabe && <>{buchstabe} · </>}
                {waage.name}
              </span>
              <span className={`text-xs ${an ? "opacity-80" : "text-muted"}`}>{waage.wo}</span>
            </button>
          );
        })}
      </div>
      {modus === "viele" && <p className="text-xs text-muted">Höchstens {MAX_VERGLEICH} Waagen, nur das Gewicht, aus den Tageswerten.</p>}

      {modus === "viele" ? (
        <WaagenGewichtsvergleich waagen={vergleich} />
      ) : modus === "zwei" && a && b ? (
        <WaagenDiagramm key={`${a.id}-${b.id}`} titel={`A ${a.name} · B ${b.name}`} zeilen={a.zeilen} zweite={b.zeilen} />
      ) : a ? (
        <WaagenDiagramm key={a.id} titel={`${a.name} · ${a.wo}`} zeilen={a.zeilen} />
      ) : null}
    </div>
  );
}
