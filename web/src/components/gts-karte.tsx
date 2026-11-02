import { Button, Card, Select } from "@/components/ui";
import { GTS_VORFRUEHLING } from "@/lib/gts";
import { standGtsLaden, wetterWaageLaden } from "@/lib/waagen";
import { wetterWaageWaehlen } from "@/lib/waagen-actions";

// Grünlandtemperatursumme eines Stands. Ohne Waage am Stand erscheint nichts.
// Stehen dort mehrere, lässt sich wählen, wessen Wetterdaten zählen.
export async function GtsKarte({ bienenstandId, auswahl = false }: { bienenstandId: string; auswahl?: boolean }) {
  const [gts, { waagen }] = await Promise.all([standGtsLaden(bienenstandId), wetterWaageLaden(bienenstandId)]);
  if (!gts) return null;

  const erreicht = gts.erreichtAm
    ? `${GTS_VORFRUEHLING} Grad erreicht am ${new Date(`${gts.erreichtAm}T00:00:00Z`).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", timeZone: "UTC" })}`
    : `${GTS_VORFRUEHLING} Grad noch nicht erreicht`;

  return (
    <Card>
      <h2 className="text-lg font-semibold">Grünlandtemperatursumme {gts.jahr}</h2>
      {gts.letzterTag ? (
        <>
          <p className="mt-1 text-2xl font-bold tabular-nums">
            {gts.summe.toLocaleString("de-DE", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} °C
          </p>
          <p className="text-sm text-muted">{erreicht} · Wetterdaten von {gts.waageName}</p>
          {gts.fehlendeTage > 0 && (
            <p className="mt-1 text-sm text-warnung">
              {gts.fehlendeTage} {gts.fehlendeTage === 1 ? "Tag fehlt" : "Tage fehlen"} seit Jahresbeginn, die Summe ist deshalb etwas zu klein.
            </p>
          )}
        </>
      ) : (
        <p className="mt-1 text-sm text-muted">Noch keine Tageswerte abgerufen.</p>
      )}

      {auswahl && waagen.length > 1 && (
        <form action={wetterWaageWaehlen.bind(null, bienenstandId)} className="mt-3 flex flex-wrap items-center gap-2">
          <Select name="waageId" defaultValue={gts.waageId} aria-label="Waage für die Wetterdaten" className="w-auto">
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
