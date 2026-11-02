import { Button, Card, Select } from "@/components/ui";
import { GTS_VORFRUEHLING } from "@/lib/gts";
import { standGtsLaden, wetterWaageLaden } from "@/lib/waagen";
import { wetterWaageWaehlen } from "@/lib/waagen-actions";

// Grünlandtemperatursumme eines Stands. Grundlage sind die Messungen der Waage,
// Tage ohne Messung kommen vom Wetterdienst. Stehen mehrere Waagen am Stand,
// lässt sich wählen, wessen Daten zählen. Ohne Daten erscheint nichts.
export async function GtsKarte({ bienenstandId, auswahl = false }: { bienenstandId: string; auswahl?: boolean }) {
  const [gts, { waagen }] = await Promise.all([standGtsLaden(bienenstandId), wetterWaageLaden(bienenstandId)]);
  if (!gts.letzterTag && waagen.length === 0) return null;

  const erreicht = gts.erreichtAm
    ? `${GTS_VORFRUEHLING} Grad erreicht am ${new Date(`${gts.erreichtAm}T00:00:00Z`).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", timeZone: "UTC" })}`
    : `${GTS_VORFRUEHLING} Grad noch nicht erreicht`;

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

      {auswahl && waagen.length > 1 && (
        <form action={wetterWaageWaehlen.bind(null, bienenstandId)} className="mt-3 flex flex-wrap items-center gap-2">
          <Select name="waageId" defaultValue={gts.waageId ?? undefined} aria-label="Waage für die Wetterdaten" className="w-auto">
            {waagen.map((waage) => (
              <option key={waage.id} value={waage.id}>
                {waage.name || waage.kennung}
                {waage.volk ? ` (${waage.volk.name})` : ""}
              </option>
            ))}
          </Select>
          <Button type="submit" variant="secondary">Übernehmen</Button>
        </form>
      )}
    </Card>
  );
}
