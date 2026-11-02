import { Card } from "@/components/ui";
import { WaagenDiagramm } from "@/components/waagen-diagramm";
import { waagenVerlaufLaden } from "@/lib/waagen";

function zahl(wert: number | null | undefined, stellen = 1) {
  if (wert === null || wert === undefined) return "–";
  return wert.toLocaleString("de-DE", { minimumFractionDigits: stellen, maximumFractionDigits: stellen });
}

// Waage eines Volks: aktueller Stand, Verlauf der letzten 14 Tage und die
// Tageswerte als Tabelle.
export async function WaagenKarte({ waage }: { waage: { id: string; kennung: string; name: string | null } }) {
  const verlauf = await waagenVerlaufLaden(waage.id);
  const stand = verlauf.letzterZeitpunkt?.toLocaleString("de-DE", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Berlin",
  });

  return (
    <Card>
      <h2 className="text-lg font-semibold">{waage.name || `Waage ${waage.kennung}`}</h2>
      {stand ? (
        <p className="mb-3 text-sm text-muted">
          <span className="font-semibold text-foreground">{zahl(verlauf.letztesGewicht, 2)} kg</span>
          {verlauf.aenderung24h !== null && (
            <> · {verlauf.aenderung24h >= 0 ? "+" : ""}{zahl(verlauf.aenderung24h, 2)} kg in 24 Stunden</>
          )}{" "}
          · Stand {stand}
        </p>
      ) : (
        <p className="mb-3 text-sm text-muted">Noch keine Messwerte abgerufen.</p>
      )}

      {stand && (
        <div className="flex flex-col gap-4">
          <WaagenDiagramm titel="Verlauf" zeilen={verlauf.zeilen} />

          {verlauf.tageswerte.length > 0 && (
            <details>
              <summary className="min-h-11 cursor-pointer text-sm font-medium">Tageswerte als Tabelle</summary>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-left text-xs text-muted">
                    <tr>
                      <th className="py-1 pr-3 font-medium">Tag</th>
                      <th className="py-1 pr-3 text-right font-medium">Gewicht</th>
                      <th className="py-1 pr-3 text-right font-medium">Ertrag</th>
                      <th className="py-1 pr-3 text-right font-medium">Temp. Mittel</th>
                      <th className="py-1 text-right font-medium">Regen</th>
                    </tr>
                  </thead>
                  <tbody>
                    {verlauf.tageswerte.map((t) => (
                      <tr key={t.tag.toISOString()} className="border-t border-border">
                        <td className="py-1 pr-3">{t.tag.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", timeZone: "UTC" })}</td>
                        <td className="py-1 pr-3 text-right tabular-nums">{zahl(t.gewichtKg, 2)} kg</td>
                        <td className="py-1 pr-3 text-right tabular-nums">{zahl(t.ertragKg, 2)} kg</td>
                        <td className="py-1 pr-3 text-right tabular-nums">{zahl(t.temperaturMittelC)} °C</td>
                        <td className="py-1 text-right tabular-nums">{zahl(t.regenMm)} mm</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          )}
        </div>
      )}
    </Card>
  );
}
