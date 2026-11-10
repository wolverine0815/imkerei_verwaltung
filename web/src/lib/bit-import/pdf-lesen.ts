// Liest eine BeeInTouch-Stockkarte (PDF) im Browser ein.
//
// Läuft bewusst im Browser und nicht auf dem Server: pdf.js ist dort schon
// eingerichtet (components/datei-ansicht.tsx), und der Server muss die PDF
// nicht verarbeiten. Er bekommt hinterher nur die eingelesenen Daten.

import type { PdfItem, BitStockkarte } from "./typen";
import { stockkarteLesen } from "./parser";

export async function stockkarteAusPdf(datei: File): Promise<BitStockkarte> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/legacy/build/pdf.worker.min.mjs", import.meta.url).toString();

  const daten = new Uint8Array(await datei.arrayBuffer());
  const aufgabe = pdfjs.getDocument({ data: daten });
  try {
    const pdf = await aufgabe.promise;
    const items: PdfItem[] = [];
    for (let nummer = 1; nummer <= pdf.numPages; nummer++) {
      const seite = await pdf.getPage(nummer);
      const hoehe = seite.view[3] - seite.view[1];
      const inhalt = await seite.getTextContent();
      for (const stueck of inhalt.items) {
        if (!("str" in stueck)) continue;
        items.push({
          str: stueck.str,
          x: stueck.transform[4],
          y: stueck.transform[5] - seite.view[1],
          w: stueck.width,
          h: Math.hypot(stueck.transform[2], stueck.transform[3]),
          seite: nummer,
          seitenHoehe: hoehe,
        });
      }
    }
    return stockkarteLesen(items, datei.name);
  } finally {
    await aufgabe.destroy();
  }
}
