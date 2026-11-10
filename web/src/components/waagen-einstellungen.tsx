"use client";

import { useState } from "react";
import { Button, Input, Label } from "@/components/ui";
import type { WaagenErgebnis } from "@/lib/waagen-actions";

function Meldung({ ergebnis }: { ergebnis: WaagenErgebnis | null }) {
  if (!ergebnis) return null;
  return (
    <p
      className={`rounded-md border px-3 py-2 text-sm ${
        ergebnis.ok ? "border-ok-rand bg-ok-flaeche text-ok" : "border-gefahr-rand bg-gefahr-flaeche text-gefahr"
      }`}
    >
      {ergebnis.meldung}
    </p>
  );
}

function useAbsenden(aktion: (formData: FormData) => Promise<WaagenErgebnis>, nachher?: (formular: HTMLFormElement) => void) {
  const [ergebnis, setErgebnis] = useState<WaagenErgebnis | null>(null);
  const [laeuft, setLaeuft] = useState(false);

  async function absenden(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formular = event.currentTarget;
    setLaeuft(true);
    setErgebnis(null);
    try {
      const antwort = await aktion(new FormData(formular));
      setErgebnis(antwort);
      if (antwort.ok) nachher?.(formular);
    } catch (fehler) {
      console.error("Waagen-Aktion:", fehler);
      const grund = fehler instanceof Error ? fehler.message : "unbekannter Fehler";
      setErgebnis({ ok: false, meldung: `Der Server hat nicht richtig geantwortet (${grund}). Bitte die Seite neu laden und noch einmal versuchen.` });
    } finally {
      setLaeuft(false);
    }
  }
  return { ergebnis, laeuft, absenden };
}

// Das Passwort wird nach dem Speichern nie wieder angezeigt, ein leeres Feld
// behält das gespeicherte.
export function WaagenZugang({
  gespeichert,
  speichern,
}: {
  gespeichert: { aktiv: boolean; benutzer: string | null; passwortGespeichert: boolean; passwortLesbar: boolean };
  speichern: (formData: FormData) => Promise<WaagenErgebnis>;
}) {
  const { ergebnis, laeuft, absenden } = useAbsenden(speichern, (formular) => {
    const feld = formular.elements.namedItem("passwort");
    if (feld instanceof HTMLInputElement) feld.value = "";
  });

  return (
    <form onSubmit={absenden} noValidate className="flex flex-col gap-4">
      <label className="flex min-h-11 items-center gap-3 text-sm font-medium">
        <input type="checkbox" name="aktiv" defaultChecked={gespeichert.aktiv} className="h-5 w-5" />
        Bereich Waagen einschalten
      </label>
      {!gespeichert.passwortLesbar && (
        <p className="text-sm font-medium text-gefahr">Das gespeicherte Passwort ist nicht mehr lesbar. Bitte neu eingeben.</p>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="waagen-benutzer">Wolf-Benutzername</Label>
          <Input
            id="waagen-benutzer"
            name="benutzer"
            defaultValue={gespeichert.benutzer ?? ""}
            autoComplete="off"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
          />
        </div>
        <div>
          <Label htmlFor="waagen-passwort">Wolf-Passwort</Label>
          <Input
            id="waagen-passwort"
            name="passwort"
            type="password"
            autoComplete="new-password"
            placeholder={gespeichert.passwortGespeichert ? "gespeichert, leer lassen zum Behalten" : ""}
          />
          <p className="mt-1 text-xs text-muted">Wird verschlüsselt gespeichert und nicht mehr angezeigt.</p>
        </div>
      </div>
      <Meldung ergebnis={ergebnis} />
      <div>
        <Button type="submit" disabled={laeuft}>{laeuft ? "Wird gespeichert …" : "Speichern"}</Button>
      </div>
    </form>
  );
}

// Holt die Messwerte sofort, auch wenn der Zeitplan noch nicht dran ist.
export function WaagenAbrufKnopf({ abrufen }: { abrufen: () => Promise<WaagenErgebnis> }) {
  const { ergebnis, laeuft, absenden } = useAbsenden(() => abrufen());
  return (
    <form onSubmit={absenden} className="flex flex-col gap-3">
      <Meldung ergebnis={ergebnis} />
      <div>
        <Button type="submit" variant="secondary" disabled={laeuft}>{laeuft ? "Wird abgerufen …" : "Jetzt abrufen"}</Button>
      </div>
    </form>
  );
}

export function WaageNeu({ anlegen }: { anlegen: (formData: FormData) => Promise<WaagenErgebnis> }) {
  const { ergebnis, laeuft, absenden } = useAbsenden(anlegen, (formular) => formular.reset());
  return (
    <form onSubmit={absenden} noValidate className="flex flex-col gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="waage-kennung">Waagen-ID</Label>
          <Input id="waage-kennung" name="kennung" placeholder="z.B. G2MJ0V" autoCapitalize="characters" autoCorrect="off" spellCheck={false} />
          <p className="mt-1 text-xs text-muted">Steht in der Wolf-Adresse. Nicht die Seriennummer.</p>
        </div>
        <div>
          <Label htmlFor="waage-name">Name (optional)</Label>
          <Input id="waage-name" name="name" />
        </div>
      </div>
      <Meldung ergebnis={ergebnis} />
      <div>
        <Button type="submit" variant="secondary" disabled={laeuft}>Waage anlegen</Button>
      </div>
    </form>
  );
}
