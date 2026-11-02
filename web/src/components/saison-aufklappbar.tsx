"use client";

import { useEffect, useRef } from "react";

// Saison im Verlauf der Stockkarte. Ob sie auf- oder zugeklappt ist, merkt sich
// jedes Gerät je Jahr, für alle Völker. Solange nichts gemerkt ist, gilt
// `startOffen`, und ein neues Jahr beginnt so wieder aufgeklappt.
function schluessel(jahr: number) {
  return `verlauf-saison-${jahr}`;
}

export function SaisonAufklappbar({
  jahr,
  startOffen,
  children,
}: {
  jahr: number;
  startOffen: boolean;
  children: React.ReactNode;
}) {
  const details = useRef<HTMLDetailsElement>(null);

  // Erst im Browser: Der Server kennt die Wahl nicht.
  useEffect(() => {
    try {
      const gemerkt = localStorage.getItem(schluessel(jahr));
      if (gemerkt !== null && details.current) details.current.open = gemerkt === "offen";
    } catch {
      // Ohne Speicher (privates Fenster) bleibt es beim Standard.
    }
  }, [jahr]);

  function gewechselt(e: React.SyntheticEvent<HTMLDetailsElement>) {
    try {
      // Der Browser meldet auch das Aufklappen beim Laden. Das ist noch keine Wahl.
      if (localStorage.getItem(schluessel(jahr)) === null && e.currentTarget.open === startOffen) return;
      localStorage.setItem(schluessel(jahr), e.currentTarget.open ? "offen" : "zu");
    } catch {
      // Dann gilt beim nächsten Mal wieder der Standard.
    }
  }

  return (
    <details ref={details} open={startOffen} onToggle={gewechselt} className="group">
      {children}
    </details>
  );
}
