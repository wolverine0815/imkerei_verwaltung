// Wird von Next.js einmal beim Start des Servers aufgerufen. Hier hängen die
// regelmäßigen Abrufe, die laufen, solange der Server läuft:
//   - Velutina-Meldungen bei der LUBW (web/src/lib/velutina.ts), alle paar Stunden
//   - Update-Prüfung bei GitHub (web/src/lib/update.ts), einmal am Tag
//   - nur mit DEMO_MODUS: Plätze der Demo freigeben und neu aufbauen
//     (web/src/lib/demo-aufbau.ts), alle 20 Sekunden
//   - Bienenstockwaagen bei Wolf (web/src/lib/waagen-abruf.ts), stündlich, im Winter täglich
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.NEXT_PHASE === "phase-production-build") return;

  const STUNDE_MS = 60 * 60 * 1000;

  const { istDemo } = await import("@/lib/demo");
  if (istDemo()) {
    const { plaetzeVorbereiten, demoTakt } = await import("@/lib/demo-aufbau");
    setTimeout(async () => {
      try {
        await plaetzeVorbereiten();
      } catch (fehler) {
        console.error("Demo: Plätze vorbereiten fehlgeschlagen:", fehler);
      }
      void demoTakt();
      setInterval(() => void demoTakt(), 20_000);
    }, 3_000);
  }

  if (process.env.VELUTINA_ABRUF !== "aus") {
    const { velutinaAbgleich, abgleichFaellig, ABRUF_ABSTAND_MS } = await import("@/lib/velutina");

    const pruefen = async () => {
      try {
        if (await abgleichFaellig()) await velutinaAbgleich();
      } catch (fehler) {
        console.error("Velutina-Abruf:", fehler);
      }
    };

    // Erst nach einer Minute: beim Containerstart laufen vorher noch die
    // Migrationen, und der Server soll zuerst erreichbar sein.
    setTimeout(pruefen, 60_000);
    // Stündlich nachsehen, ob der letzte Abruf älter als der Abrufabstand ist.
    setInterval(pruefen, Math.min(ABRUF_ABSTAND_MS, STUNDE_MS));
  }

  const { waagenAbgleich } = await import("@/lib/waagen-abruf");
  const waagenPruefen = () => waagenAbgleich().catch((fehler) => console.error("Waagen-Abruf:", fehler));
  setTimeout(waagenPruefen, 120_000);
  setInterval(waagenPruefen, STUNDE_MS);

  const { pruefungFaellig, pruefungMoeglich, updatePruefen } = await import("@/lib/update");
  if (pruefungMoeglich()) {
    const pruefen = async () => {
      try {
        if (await pruefungFaellig()) await updatePruefen();
      } catch (fehler) {
        console.error("Update-Prüfung:", fehler);
      }
    };
    // Beim Start (nach einem Update gleich mit der neuen Nummer) und dann
    // stündlich nachsehen, ob die letzte Prüfung einen Tag her ist.
    setTimeout(pruefen, 90_000);
    setInterval(pruefen, STUNDE_MS);
  }
}
