import Link from "next/link";
import { notFound } from "next/navigation";
import { Button, Card, Input } from "@/components/ui";
import { LoeschenButton } from "@/components/loeschen-button";
import { SeitenNavigation } from "@/components/seiten-navigation";
import { WaagenAbrufKnopf, WaagenZugang, WaageNeu } from "@/components/waagen-einstellungen";
import { istAdmin } from "@/lib/konto";
import { prisma } from "@/lib/prisma";
import { WAAGEN_HERSTELLER_LABEL, waagenEinstellungLaden } from "@/lib/waagen";
import { waageAnlegen, waageLoeschen, waagenEinstellungSpeichern, waagenJetztAbrufen, waageUmbenennen } from "@/lib/waagen-actions";

function zeit(wert: Date) {
  return wert.toLocaleString("de-DE", { dateStyle: "short", timeStyle: "short", timeZone: "Europe/Berlin" });
}

// Hier wird das Feature eingeschaltet, deshalb gibt es die Seite auch, solange
// der Bereich Waagen aus ist.
export default async function WaagenEinstellungenPage() {
  if (!(await istAdmin())) notFound();
  const [einstellung, waagen] = await Promise.all([
    waagenEinstellungLaden(),
    prisma.waage.findMany({ orderBy: { createdAt: "asc" }, include: { volk: { select: { id: true, name: true } } } }),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <SeitenNavigation className="mb-2" />
        <h1 className="text-2xl font-semibold tracking-tight">Waagen</h1>
        <p className="text-sm text-muted">
          Bienenstockwaagen in den Stockkarten anzeigen. Die Zugangsdaten zum Wolf-Konto braucht der
          Server, um die Messwerte abzurufen.
        </p>
      </div>

      <Card>
        <WaagenZugang
          gespeichert={{
            aktiv: einstellung?.aktiv ?? false,
            benutzer: einstellung?.benutzer ?? null,
            passwortGespeichert: Boolean(einstellung?.passwortVerschluesselt),
            passwortLesbar: einstellung?.passwortLesbar ?? true,
          }}
          speichern={waagenEinstellungSpeichern}
        />
      </Card>

      {einstellung?.aktiv && (
        <Card>
          <h2 className="text-lg font-semibold">Abruf</h2>
          <p className="mb-3 text-sm text-muted">
            Stündlich, von November bis Februar einmal am Tag.
            {einstellung.letzterErfolg && ` Zuletzt erfolgreich am ${zeit(einstellung.letzterErfolg)}.`}
          </p>
          {einstellung.fehler && <p className="mb-3 text-sm font-medium text-gefahr">{einstellung.fehler}</p>}
          <WaagenAbrufKnopf abrufen={waagenJetztAbrufen} />
        </Card>
      )}

      <Card>
        <h2 className="mb-3 text-lg font-semibold">Deine Waagen</h2>
        {waagen.length === 0 ? (
          <p className="mb-4 text-sm text-muted">Noch keine Waage angelegt.</p>
        ) : (
          <ul className="mb-4 flex flex-col divide-y divide-border">
            {waagen.map((waage) => (
              <li key={waage.id} className="flex flex-col gap-2 py-3">
                <span className="min-w-0 text-sm">
                  <span className="text-muted">{WAAGEN_HERSTELLER_LABEL[waage.hersteller]} {waage.kennung} · </span>
                  {waage.volk ? (
                    <Link href={`/voelker/${waage.volk.id}`} className="text-accent hover:underline">{waage.volk.name}</Link>
                  ) : (
                    <span className="text-muted">keinem Volk zugeordnet</span>
                  )}
                </span>
                <div className="flex flex-wrap items-center gap-2">
                  <form action={waageUmbenennen.bind(null, waage.id)} className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
                    <Input
                      name="name"
                      defaultValue={waage.name ?? ""}
                      placeholder={waage.kennung}
                      aria-label={`Name der Waage ${waage.kennung}`}
                      className="min-w-40 flex-1"
                    />
                    <Button type="submit" variant="secondary">Speichern</Button>
                  </form>
                  <LoeschenButton
                    action={waageLoeschen.bind(null, waage.id)}
                    bestaetigung={`Waage ${waage.kennung} mit allen Messwerten löschen?`}
                  >
                    Löschen
                  </LoeschenButton>
                </div>
              </li>
            ))}
          </ul>
        )}
        <WaageNeu anlegen={waageAnlegen} />
        <p className="mt-3 text-xs text-muted">Zugeordnet wird eine Waage beim Bearbeiten des Volks.</p>
      </Card>
    </div>
  );
}
