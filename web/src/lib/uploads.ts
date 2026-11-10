import { spawn } from "child_process";
import { access, mkdir, unlink, writeFile } from "fs/promises";
import path from "path";
import { randomUUID } from "crypto";
import { aktuellesKonto } from "@/lib/konto";
import { DEMO_UPLOAD_MELDUNG, istDemo } from "@/lib/demo";

// Alle hochgeladenen Fotos landen in diesem Verzeichnis (nicht in `public/`,
// da es sich um Nutzerdaten handelt, keine Build-Assets). In Produktion muss
// dieses Verzeichnis auf ein dauerhaftes Volume zeigen, sonst gehen Fotos bei
// jedem Deployment verloren.
export const UPLOAD_DIR = path.resolve(
  process.cwd(),
  process.env.UPLOAD_DIR ?? "./uploads",
);

// Testzugänge bekommen je einen eigenen Unterordner, Franks Dateien bleiben
// wie bisher direkt in UPLOAD_DIR.
export function testerUploadVerzeichnis(testzugangId: string): string {
  return path.join(UPLOAD_DIR, "tester", path.basename(testzugangId));
}

async function uploadVerzeichnis(): Promise<string> {
  const konto = await aktuellesKonto();
  if (!konto) throw new Error("Nicht angemeldet.");
  return konto.art === "tester" ? testerUploadVerzeichnis(konto.testzugangId) : UPLOAD_DIR;
}

// Voller Pfad einer hochgeladenen Datei des angemeldeten Kontos. `basename`
// sorgt dafür, dass ein Dateiname nie aus dem eigenen Ordner herausführt.
export async function uploadPfad(dateiname: string): Promise<string> {
  return path.join(await uploadVerzeichnis(), path.basename(dateiname));
}

const ERLAUBTE_BILDTYPEN = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
]);

export function istErlaubterBildtyp(mimeType: string): boolean {
  return ERLAUBTE_BILDTYPEN.has(mimeType);
}

// Belege zu einem Medikament (Rechnung, Lieferschein, tierärztliche
// Verschreibung) kommen meist als Handyfoto, manchmal aber auch als PDF aus
// dem Online-Shop - deshalb hier zusätzlich PDF erlaubt.
export function istErlaubterBelegtyp(mimeType: string): boolean {
  return ERLAUBTE_BILDTYPEN.has(mimeType) || mimeType === "application/pdf";
}

export async function bildSpeichern(datei: File): Promise<{
  dateiname: string;
  originalDateiname: string;
  mimeType: string;
  groesse: number;
}> {
  // Öffentliche Demo: keine fremden Dateien auf dem Server (die Knöpfe sind
  // dort ausgeblendet, das hier fängt alles andere ab).
  if (istDemo()) throw new Error(DEMO_UPLOAD_MELDUNG);
  const verzeichnis = await uploadVerzeichnis();
  await mkdir(verzeichnis, { recursive: true });

  const endung = path.extname(datei.name) || "";
  const dateiname = `${randomUUID()}${endung}`;
  const zielpfad = path.join(verzeichnis, dateiname);

  const inhalt = Buffer.from(await datei.arrayBuffer());
  await writeFile(zielpfad, inhalt);

  return {
    dateiname,
    originalDateiname: datei.name,
    mimeType: datei.type || "application/octet-stream",
    groesse: inhalt.byteLength,
  };
}

// Deutlich unter der Kameraauflösung, aber groß genug, um es sich auch mal
// größer anzusehen - anders als die Stockkarten-Fotos, die man zum genauen
// Ansehen des Brutbilds ohnehin in voller Auflösung anklickt.
const FOTO_MAX_PX = 1600;

// In einem eigenen Prozess, siehe scripts/bild-verkleinern.mjs: sharp darf nicht
// in den App-Server geladen werden.
function fotoVerkleinern(eingabe: Buffer): Promise<Buffer> {
  return new Promise((erfuellen, ablehnen) => {
    const skript = path.join(process.cwd(), "scripts", "bild-verkleinern.mjs");
    const kind = spawn(process.execPath, [skript, String(FOTO_MAX_PX)], { stdio: ["pipe", "pipe", "inherit"] });
    const teile: Buffer[] = [];
    kind.stdout.on("data", (teil: Buffer) => teile.push(teil));
    kind.on("error", ablehnen);
    // Stirbt der Prozess vor dem Ende der Eingabe, meldet "close" den Fehler.
    kind.stdin.on("error", () => {});
    kind.on("close", (code, signal) => {
      const ergebnis = Buffer.concat(teile);
      if (code === 0 && ergebnis.length > 0) erfuellen(ergebnis);
      else ablehnen(new Error(`Das Foto konnte nicht verkleinert werden (${signal ?? `Code ${code}`}).`));
    });
    kind.stdin.end(eingabe);
  });
}

export async function verkleinertesFotoSpeichern(datei: File): Promise<{
  dateiname: string;
  originalDateiname: string;
  mimeType: string;
}> {
  if (istDemo()) throw new Error(DEMO_UPLOAD_MELDUNG);
  const verzeichnis = await uploadVerzeichnis();
  await mkdir(verzeichnis, { recursive: true });

  const eingabe = Buffer.from(await datei.arrayBuffer());
  const verkleinert = await fotoVerkleinern(eingabe);

  const dateiname = `${randomUUID()}.jpg`;
  await writeFile(path.join(verzeichnis, dateiname), verkleinert);

  return {
    dateiname,
    originalDateiname: datei.name,
    mimeType: "image/jpeg",
  };
}

// Liegt die Datei tatsächlich im Upload-Verzeichnis? Die Datenbank kennt nur
// den Dateinamen - fehlt die Datei (z.B. weil das Volume nicht mehr
// eingehängt ist), soll die App das sagen, statt ein kaputtes Bild zu zeigen.
export async function dateiVorhanden(dateiname: string): Promise<boolean> {
  try {
    await access(await uploadPfad(dateiname));
    return true;
  } catch {
    return false;
  }
}

export async function bildDateiLoeschen(dateiname: string): Promise<void> {
  try {
    await unlink(await uploadPfad(dateiname));
  } catch (fehler) {
    // Datei war schon weg (z.B. manuell aufgeräumt) - kein Grund, das Löschen
    // des Datenbank-Eintrags daran scheitern zu lassen.
    if ((fehler as NodeJS.ErrnoException).code !== "ENOENT") {
      throw fehler;
    }
  }
}

// Erzeugte PDF-Nachweise landen im selben dauerhaften Verzeichnis wie Fotos
// und Belege. Sie bleiben dort liegen, bis sie ausdrücklich gelöscht werden.
export async function dateiSpeichern(
  inhalt: Buffer,
  endung: string,
): Promise<{ dateiname: string; groesse: number }> {
  const verzeichnis = await uploadVerzeichnis();
  await mkdir(verzeichnis, { recursive: true });

  const dateiname = `${randomUUID()}${endung}`;
  await writeFile(path.join(verzeichnis, dateiname), new Uint8Array(inhalt));

  return { dateiname, groesse: inhalt.byteLength };
}
