import { Card } from "@/components/ui";
import { GTS_MARKE } from "@/lib/gts";
import { standGtsLaden, wetterWaageLaden } from "@/lib/waagen";

// Grünlandtemperatursumme eines Stands. Grundlage sind die Messungen der Waage,
// Tage ohne Messung kommen vom Wetterdienst. Stehen mehrere Waagen am Stand, wird
// die maßgebliche beim Bearbeiten des Stands gewählt. Ohne Daten erscheint nichts.
export async function GtsKarte({ bienenstandId }: { bienenstandId: string }) {
  const [gts, { waagen }] = await Promise.all([standGtsLaden(bienenstandId), wetterWaageLaden(bienenstandId)]);
  if (!gts.letzterTag && waagen.length === 0) return null;

  const erreicht = gts.erreichtAm
    ? `${GTS_MARKE} Grad erreicht am ${new Date(`${gts.erreichtAm}T00:00:00Z`).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", timeZone: "UTC" })}`
    : `${GTS_MARKE} Grad noch nicht erreicht`;

  const quelle = !gts.waageName
    ? "Wetterdaten vom Wetterdienst"
    : gts.tageWetter > 0
      ? `${gts.tageWaage} Tage von ${gts.waageName}, ${gts.tageWetter} Tage vom Wetterdienst`
      : `Wetterdaten von ${gts.waageName}`;

  return (
    <Card>
      <h2 className="text-lg font-semibold">Grünlandtemperatursumme {gts.jahr}</h2>
      {gts.letzterTag ? (
        <>
          <p className="mt-1 text-2xl font-bold tabular-nums">
            {gts.summe.toLocaleString("de-DE", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} °C
          </p>
          <p className="text-sm text-muted">{erreicht} · {quelle}</p>
          {gts.fehlendeTage > 0 && (
            <p className="mt-1 text-sm text-warnung">
              {gts.fehlendeTage} {gts.fehlendeTage === 1 ? "Tag fehlt" : "Tage fehlen"} seit Jahresbeginn, die Summe ist deshalb etwas zu klein.
            </p>
          )}
          {gts.tageWetter > 0 && (
            <p className="mt-1 text-xs text-muted">
              Wetterdienst:{" "}
              <a href="https://open-meteo.com/" target="_blank" rel="noreferrer" className="underline">
                Open-Meteo.com
              </a>{" "}
              (CC BY 4.0), Modelldaten
            </p>
          )}
        </>
      ) : (
        <p className="mt-1 text-sm text-muted">Noch keine Tageswerte abgerufen.</p>
      )}
    </Card>
  );
}
