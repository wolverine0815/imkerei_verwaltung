"use server";

import { istDemo, istDemoPlatz, platzFreigeben } from "@/lib/demo";
import { aktuellesKonto } from "@/lib/konto";
import { istBundesland } from "@/lib/bundeslaender";
import { behandlungenAmStand, behandlungenAmVolk, sperrtextStand, sperrtextVolk } from "@/lib/bestandsbuch-sperre";
import { fuettererAktionAusFormular } from "@/lib/fuetterer";
import { randomUUID } from "crypto";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { standWetterWaagePruefen, volkWaageSetzen } from "@/lib/waagen";
import { heuteAlsInputWert } from "@/lib/datum";
import { GLEICHZEITIG_MS } from "@/lib/massnahmen-gruppen";
import { cookies } from "next/headers";
import { basisPrisma, prisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";
import {
  ADMIN_KONTO,
  SITZUNGS_COOKIE_NAME,
  anmeldungGesperrt,
  erfolgreicheAnmeldungVermerken,
  fehlversuchVermerken,
  passwortPasstZuHash,
  sicheresWeiterleitungsziel,
} from "@/lib/anmeldung";
import { hauptzugangPruefen, istAdminBenutzername } from "@/lib/hauptzugang";
import { nutzerKonto, PASSWORT_SEITE } from "@/lib/nutzer";
import { sitzungSetzen } from "@/lib/sitzung";
import {
  verkleinertesFotoSpeichern,
  bildDateiLoeschen,
  bildSpeichern,
  dateiSpeichern,
  istErlaubterBelegtyp,
  istErlaubterBildtyp,
} from "@/lib/uploads";
import { ERINNERUNGEN, KALENDER_FARBEN } from "@/lib/kalender";
import { KORREKTUR_MAX, KORREKTUR_MIN, runden, zargeBezeichnung } from "@/lib/honig";
import { HONIG_ZUSTAENDE } from "@/lib/honig-zustand";
import { abfuellenAufteilen, istEimerGebinde, type EimerEinheit } from "@/lib/eimer";
import { jeStueck } from "@/lib/warenwert";
import { betragAusText, istVerkaufGrund, VERKAUF_ART_NAME, VERKAUF_ARTEN } from "@/lib/verkauf";
import { gebindeArt, gebindeNameVoll, gleichesGebinde, istGebindeArt } from "@/lib/gebinde";
import { BEUTENSYSTEM_KATALOG, EIGNUNGEN, fehlendeKatalogMasse } from "@/lib/beutensysteme";
import { zargenFuerNeueMasse } from "@/lib/beuten";
import { KOENIGINS_BEURTEILUNGS_KRITERIEN, noteText, stufeText } from "@/components/stockkarten-eintrag-felder";
import { nachweisDatenLaden } from "@/lib/nachweis";
import { WABEN_AENDERUNGS_ARTEN, WABEN_AENDERUNG_MAX, aenderungSumme, startSumme, wabenPlatz, WABEN_START_ARTEN } from "@/lib/waben";
import { wabenbestaendeLaden } from "@/lib/wabenbestand";
import { nachweisPdfErzeugen } from "@/lib/nachweis-pdf";
import { buchungsListeLaden, erzeugnisListeLaden, materialListeLaden } from "@/lib/lagerliste";
import { buchungsListePdfErzeugen, erzeugnisListePdfErzeugen, materialListePdfErzeugen } from "@/lib/lagerliste-pdf";
import { inhaltAusFormular } from "@/lib/zuchtkarte-inhalt";
import { ZUCHTKARTE_DATEITYP_HINWEIS, zuchtkartenDateityp } from "@/lib/zuchtkarte-datei";
import {
  ANSICHT_COOKIE,
  BEGATTUNGSARTEN,
  EREIGNIS_ARTEN,
  EREIGNIS_MIT_VOLK,
  HERKUENFTE,
  KOENIGIN_STATUS,
  UMWEISEL_VERBLEIB,
  UMWEISEL_VERBLEIBE,
  istVerfuegbar,
  kennungsKuerzel,
  loestVolkZuordnung,
  naechsteKennung,
  statusNachEreignis,
  type EreignisArt,
  type KoeniginStatus,
} from "@/lib/koeniginnen";
import {
  SCHLUPF_TAG as ZUCHT_SCHLUPF_TAG,
  PFLEGEARTEN,
  zuchtSchritte,
  massnahmeText as zuchtMassnahmeText,
  schrittDatum,
} from "@/lib/zucht";
import { Standtyp, VolkStatus, VoelkerSortierung } from "@/generated/prisma/enums";
import { gewichtSummeAuswerten } from "@/lib/gewicht-summe";
import { medikamentVorlage } from "@/lib/medikament-vorlagen";
import { TELEFON_HINWEIS, telefonGueltig } from "@/lib/telefon";

// --- Anmeldung -------------------------------------------------------------

export type AnmeldenState = { error: string | null };

export async function anmelden(
  _vorherigerZustand: AnmeldenState,
  formData: FormData
): Promise<AnmeldenState> {
  const benutzername = (formData.get("benutzername") ?? "").toString();
  const passwort = (formData.get("passwort") ?? "").toString();
  const weiter = (formData.get("weiter") ?? "/").toString();

  const gesperrtSekunden = anmeldungGesperrt(benutzername);
  if (gesperrtSekunden !== null) {
    const minuten = Math.ceil(gesperrtSekunden / 60);
    return {
      error: `Zu viele Fehlversuche. Bitte in ${minuten} ${minuten === 1 ? "Minute" : "Minuten"} erneut versuchen.`,
    };
  }

  // Der Hauptzugang meldet sich mit den Zugangsdaten aus den
  // Umgebungsvariablen oder dem Einrichtungsassistenten an, Tester mit dem Namen und Passwort, die sie beim Einlösen ihres
  // Einladungslinks vergeben haben.
  let konto: string | null = null;
  let passwortAendernNoetig = false;
  const helfer = await basisPrisma.nutzer.findUnique({
    where: { nameKlein: benutzername.trim().toLowerCase() },
    select: { id: true, passwortHash: true, aktiv: true, passwortAendern: true },
  });
  if (await istAdminBenutzername(benutzername)) {
    if (await hauptzugangPruefen(benutzername, passwort)) konto = ADMIN_KONTO;
  } else if (helfer) {
    // Helfer (Einstellungen -> Helfer). Gesperrte kommen nicht hinein, die
    // Meldung verrät aber nicht, ob es am Passwort oder an der Sperre liegt.
    if (helfer.aktiv && passwortPasstZuHash(passwort, helfer.passwortHash)) {
      konto = nutzerKonto(helfer.id);
      passwortAendernNoetig = helfer.passwortAendern;
      await basisPrisma.nutzer.update({ where: { id: helfer.id }, data: { letzteAnmeldung: new Date() } });
    }
  } else {
    const testzugang = await basisPrisma.testzugang.findUnique({
      where: { nameKlein: benutzername.trim().toLowerCase() },
      select: { id: true, passwortHash: true, eingerichtetAm: true },
    });
    if (
      testzugang?.eingerichtetAm &&
      testzugang.passwortHash &&
      passwortPasstZuHash(passwort, testzugang.passwortHash)
    ) {
      konto = testzugang.id;
      await basisPrisma.testzugang.update({
        where: { id: testzugang.id },
        data: { letzteAnmeldung: new Date() },
      });
    }
  }

  if (!konto) {
    fehlversuchVermerken(benutzername);
    return { error: "Benutzername oder Passwort falsch." };
  }

  erfolgreicheAnmeldungVermerken(benutzername);
  await sitzungSetzen(konto);

  // Startpasswort vom Admin: erst ein eigenes vergeben (proxy.ts lässt bis
  // dahin ohnehin nichts anderes zu).
  if (passwortAendernNoetig) redirect(PASSWORT_SEITE);

  // Nur eigene Pfade zulassen - sonst könnte "weiter" missbraucht werden, um
  // nach der Anmeldung auf eine fremde Adresse umzuleiten.
  redirect(sicheresWeiterleitungsziel(weiter));
}

export async function abmelden() {
  // Öffentliche Demo: Abmelden gibt den Platz gleich zum Neuaufbau frei.
  if (istDemo()) {
    const konto = await aktuellesKonto();
    if (konto?.art === "tester" && istDemoPlatz(konto.testzugangId)) await platzFreigeben(konto.testzugangId);
  }
  const cookieStore = await cookies();
  cookieStore.delete(SITZUNGS_COOKIE_NAME);
  redirect(istDemo() ? "/demo" : "/login");
}

function textOderUndefined(wert: FormDataEntryValue | null): string | undefined {
  const text = (wert ?? "").toString().trim();
  return text === "" ? undefined : text;
}

function zahlOderNull(wert: FormDataEntryValue | null): number | null {
  const text = (wert ?? "").toString().trim();
  if (text === "") return null;
  // Deutsches Komma als Dezimaltrennzeichen zulassen (z.B. Gewicht/
  // Fütterungsmenge, dort per <input type="text"> eingetippt) - unabhängig
  // davon, was am Feld selbst schon abgefangen wird.
  const zahl = Number(text.replace(",", "."));
  return Number.isFinite(zahl) ? zahl : null;
}

// Gewicht darf auch als Summe von Teilgewichten kommen ("13+17"), falls ohne
// Verlassen des Felds gespeichert wurde - sonst rechnet schon das Feld.
function gewichtOderNull(wert: FormDataEntryValue | null): number | null {
  const ergebnis = gewichtSummeAuswerten((wert ?? "").toString());
  return ergebnis.art === "zahl" ? ergebnis.wert : null;
}

// Für die Checkbox-Felder im Brutraum (Königin gesehen, Stifte, usw.): eine
// nicht angehakte Checkbox schickt beim Absenden gar nichts mit - das wird als
// "nicht erfasst" (NULL) gespeichert, nicht als "nein", damit der Verlauf nur
// zeigt, was wirklich angegeben wurde.
function checkboxJaNein(wert: FormDataEntryValue | null): true | null {
  return wert?.toString() === "ja" ? true : null;
}

/// Beurteilungsnote 1,0 bis 6,0 in halben Schritten, alles andere -> null.
function noteOderNull(wert: FormDataEntryValue | null): number | null {
  const zahl = zahlOderNull(wert);
  if (zahl === null || zahl < 1 || zahl > 6) return null;
  return Math.round(zahl * 2) / 2;
}

function enumWertOderNull<T extends string>(erlaubteWerte: readonly T[], wert: FormDataEntryValue | null): T | null {
  const text = (wert ?? "").toString();
  return (erlaubteWerte as readonly string[]).includes(text) ? (text as T) : null;
}

const VARROA_ZAEHLWEISEN = ["PUDERZUCKER", "AUSWASCHUNG", "GEMUELLDIAGNOSE", "SONSTIGE"] as const;
const FUETTERUNGS_ARTEN = [
  "INVERTZUCKERSIRUP",
  "WEIZENSIRUP",
  "ZUCKERWASSER_1_1",
  "ZUCKERWASSER_3_2",
  "FUTTERTEIG",
  "EIWEISSFUTTERTEIG",
  "SONSTIGE",
] as const;
const WIEGEMETHODEN = ["EINSEITIG", "VOLLSTAENDIG"] as const;
const NACHWEIS_UMFAENGE = ["ALLE", "STAND", "VOLK"] as const;

async function neueBilderSpeichern(stockkartenEintragId: string, formData: FormData) {
  const dateien = formData
    .getAll("bilder")
    .filter((wert): wert is File => wert instanceof File && wert.size > 0);

  for (const datei of dateien) {
    if (!istErlaubterBildtyp(datei.type)) {
      continue;
    }
    const gespeichert = await bildSpeichern(datei);
    await prisma.bild.create({
      data: {
        stockkartenEintragId,
        ...gespeichert,
      },
    });
  }
}

// --- Bienenstand ---------------------------------------------------------

// Das Standortfoto ist optional - ein Übersichtsbild des Stands selbst
// (nicht einzelner Beuten), analog zum Beutenfoto bei Volk. Wird ebenfalls
// klein genug gerechnet, dass es nie größer als eine Vorschaukachel
// gebraucht wird.
async function standortFotoAusFormular(formData: FormData) {
  const datei = formData.get("standortFoto");
  if (!(datei instanceof File) || datei.size === 0 || !istErlaubterBildtyp(datei.type)) {
    return {};
  }
  const gespeichert = await verkleinertesFotoSpeichern(datei);
  return {
    standortFotoDateiname: gespeichert.dateiname,
    standortFotoOriginalDateiname: gespeichert.originalDateiname,
    standortFotoMimeType: gespeichert.mimeType,
  };
}

// Foto: neue Datei ersetzt eine vorhandene, sonst kann sie über das
// Entfernen-Feld gelöscht werden. Ohne beides bleibt das Foto unangetastet.
// Gemeinsam genutzt vom vollständigen "Bienenstand bearbeiten" und vom
// Foto-Ändern direkt aus dem Lightbox-Popup auf der Stand-Seite.
async function standortFotoFelderAusFormular(
  formData: FormData,
  bestehendeDateiname: string | null
): Promise<{
  standortFotoDateiname?: string | null;
  standortFotoOriginalDateiname?: string | null;
  standortFotoMimeType?: string | null;
  standortFotoZoom?: number;
  standortFotoFokusX?: number;
  standortFotoFokusY?: number;
}> {
  const neueDatei = formData.get("standortFoto");
  if (neueDatei instanceof File && neueDatei.size > 0 && istErlaubterBildtyp(neueDatei.type)) {
    if (bestehendeDateiname) await bildDateiLoeschen(bestehendeDateiname);
    const gespeichert = await verkleinertesFotoSpeichern(neueDatei);
    return {
      standortFotoDateiname: gespeichert.dateiname,
      standortFotoOriginalDateiname: gespeichert.originalDateiname,
      standortFotoMimeType: gespeichert.mimeType,
      // Ein neues Foto macht den bisherigen Ausschnitt gegenstandslos.
      standortFotoZoom: 1,
      standortFotoFokusX: 0.5,
      standortFotoFokusY: 0.5,
    };
  }
  if (formData.get("standortFotoEntfernen") === "ja" && bestehendeDateiname) {
    await bildDateiLoeschen(bestehendeDateiname);
    return {
      standortFotoDateiname: null,
      standortFotoOriginalDateiname: null,
      standortFotoMimeType: null,
    };
  }
  return {};
}

// Unbekannte oder fehlende Werte fallen auf "fester Stand" zurück.
function standtypAusFormular(formData: FormData): Standtyp {
  return formData.get("standtyp") === Standtyp.WANDER ? Standtyp.WANDER : Standtyp.FEST;
}

// Prüffehler kommen bei den Formularen für Stand, Volk, Umzug und
// Stockkarten-Eintrag als { fehler } zurück statt als Ausnahme - eine
// geworfene Meldung erreicht im fertigen Build nie den Bildschirm (dort
// steht dann nur eine allgemeine Fehlerseite), und die Eingaben wären weg.
// Angezeigt wird sie von SicheresFormular bzw. StockkartenEintragFormular.
export type FormularErgebnis = { fehler?: string } | void;

export async function bienenstandAnlegen(formData: FormData): Promise<FormularErgebnis> {
  const name = textOderUndefined(formData.get("name"));
  if (!name) {
    return { fehler: "Name des Bienenstands darf nicht leer sein." };
  }

  const bienenstand = await prisma.bienenstand.create({
    data: {
      name,
      strasse: textOderUndefined(formData.get("strasse")),
      ort: textOderUndefined(formData.get("ort")),
      breitengrad: zahlOderNull(formData.get("breitengrad")),
      laengengrad: zahlOderNull(formData.get("laengengrad")),
      notizen: textOderUndefined(formData.get("notizen")),
      standtyp: standtypAusFormular(formData),
      ...(await standortFotoAusFormular(formData)),
    },
  });

  revalidatePath("/");
  redirect(`/bienenstaende/${bienenstand.id}`);
}

export async function bienenstandAktualisieren(
  bienenstandId: string,
  formData: FormData
): Promise<FormularErgebnis> {
  const bestehend = await prisma.bienenstand.findUnique({
    where: { id: bienenstandId },
    select: { standortFotoDateiname: true },
  });
  if (!bestehend) {
    return { fehler: "Diesen Bienenstand gibt es nicht mehr." };
  }

  const name = textOderUndefined(formData.get("name"));
  if (!name) {
    return { fehler: "Name des Bienenstands darf nicht leer sein." };
  }

  const fotoFelder = await standortFotoFelderAusFormular(formData, bestehend.standortFotoDateiname);

  await prisma.bienenstand.update({
    where: { id: bienenstandId },
    data: {
      name,
      strasse: textOderUndefined(formData.get("strasse")),
      ort: textOderUndefined(formData.get("ort")),
      breitengrad: zahlOderNull(formData.get("breitengrad")),
      laengengrad: zahlOderNull(formData.get("laengengrad")),
      notizen: textOderUndefined(formData.get("notizen")),
      standtyp: standtypAusFormular(formData),
      ...fotoFelder,
      // Das Feld gibt es nur, wenn mehrere Waagen am Stand stehen.
      ...(formData.has("wetterWaageId")
        ? { wetterWaageId: await standWetterWaagePruefen(bienenstandId, String(formData.get("wetterWaageId"))) }
        : {}),
    },
  });

  revalidatePath("/");
  revalidatePath(`/bienenstaende/${bienenstandId}`);
  revalidatePath("/waagen");
  redirect(`/bienenstaende/${bienenstandId}`);
}

// Nur das Standortfoto ändern oder entfernen - für das Lightbox-Popup auf der
// Stand-Seite, ohne den Umweg über das ganze Bearbeiten-Formular. Bei einem
// neuen Foto kommt der Ausschnitt (Zoom/Fokuspunkt) gleich mit - er wird im
// Popup direkt beim Einfügen gewählt, bevor gespeichert wird (siehe
// koeniginFotoAktualisieren für dasselbe Vorgehen).
// Gibt bei einem unbrauchbaren Foto eine Meldung zurück, statt stillschweigend
// nichts zu tun - sonst schließt der Dialog, als wäre alles gespeichert.
export async function bienenstandFotoAktualisieren(
  bienenstandId: string,
  formData: FormData
): Promise<{ fehler?: string }> {
  const bestehend = await prisma.bienenstand.findUniqueOrThrow({
    where: { id: bienenstandId },
    select: { standortFotoDateiname: true },
  });

  const datei = formData.get("standortFoto");
  // Ein leerer Dateityp kommt vor (z.B. HEIC am Windows-Rechner) - dann
  // entscheidet die Bildverarbeitung unten, ob sich die Datei lesen lässt.
  if (datei instanceof File && datei.size > 0 && datei.type && !istErlaubterBildtyp(datei.type)) {
    return { fehler: "Dieses Dateiformat wird nicht unterstützt. Bitte ein JPEG-, PNG-, WebP- oder HEIC-Foto wählen." };
  }
  if (datei instanceof File && datei.size > 0) {
    let gespeichert;
    try {
      gespeichert = await verkleinertesFotoSpeichern(datei);
    } catch (fehler) {
      console.error("Standortfoto konnte nicht verarbeitet werden:", fehler);
      return { fehler: "Das Foto konnte nicht gelesen werden. Bitte ein anderes Foto versuchen." };
    }
    await prisma.bienenstand.update({
      where: { id: bienenstandId },
      data: {
        standortFotoDateiname: gespeichert.dateiname,
        standortFotoOriginalDateiname: gespeichert.originalDateiname,
        standortFotoMimeType: gespeichert.mimeType,
        standortFotoZoom: begrenzterZoom(Number(formData.get("zoom"))),
        standortFotoFokusX: begrenzterFokus(Number(formData.get("fokusX"))),
        standortFotoFokusY: begrenzterFokus(Number(formData.get("fokusY"))),
      },
    });
    if (bestehend.standortFotoDateiname) await bildDateiLoeschen(bestehend.standortFotoDateiname);
  } else if (formData.get("standortFotoEntfernen") === "ja" && bestehend.standortFotoDateiname) {
    await bildDateiLoeschen(bestehend.standortFotoDateiname);
    await prisma.bienenstand.update({
      where: { id: bienenstandId },
      data: {
        standortFotoDateiname: null,
        standortFotoOriginalDateiname: null,
        standortFotoMimeType: null,
        standortFotoZoom: 1,
        standortFotoFokusX: 0.5,
        standortFotoFokusY: 0.5,
      },
    });
  }

  revalidatePath("/");
  revalidatePath(`/bienenstaende/${bienenstandId}`);
  return {};
}

// Nur den Bildausschnitt (Zoom/Fokuspunkt) speichern - siehe
// volkFotoAusschnittAktualisieren für die Begründung der serverseitigen
// Begrenzung.
export async function bienenstandFotoAusschnittAktualisieren(
  bienenstandId: string,
  ausschnitt: { zoom: number; fokusX: number; fokusY: number }
) {
  await prisma.bienenstand.update({
    where: { id: bienenstandId },
    data: {
      standortFotoZoom: begrenzterZoom(ausschnitt.zoom),
      standortFotoFokusX: begrenzterFokus(ausschnitt.fokusX),
      standortFotoFokusY: begrenzterFokus(ausschnitt.fokusY),
    },
  });

  revalidatePath("/");
  revalidatePath(`/bienenstaende/${bienenstandId}`);
}

export async function bienenstandArchivieren(bienenstandId: string) {
  await prisma.bienenstand.update({
    where: { id: bienenstandId },
    data: { archiviert: true, archiviertAm: new Date() },
  });

  revalidatePath("/");
  revalidatePath(`/bienenstaende/${bienenstandId}`);
  redirect(`/bienenstaende/${bienenstandId}`);
}

export async function bienenstandReaktivieren(bienenstandId: string) {
  await prisma.bienenstand.update({
    where: { id: bienenstandId },
    data: { archiviert: false, archiviertAm: null },
  });

  revalidatePath("/");
  revalidatePath(`/bienenstaende/${bienenstandId}`);
  redirect(`/bienenstaende/${bienenstandId}`);
}

export async function bienenstandLoeschen(bienenstandId: string): Promise<{ fehler: string } | void> {
  // Sperre fürs Bestandsbuch (5 Jahre Aufbewahrung), siehe lib/bestandsbuch-sperre.ts
  const behandlungen = await behandlungenAmStand(bienenstandId);
  if (behandlungen > 0) return { fehler: sperrtextStand(behandlungen) };

  const bienenstand = await prisma.bienenstand.findUniqueOrThrow({
    where: { id: bienenstandId },
    select: { standortFotoDateiname: true },
  });
  const bilder = await prisma.bild.findMany({
    where: { stockkartenEintrag: { volk: { bienenstandId } } },
    select: { dateiname: true },
  });

  await prisma.bienenstand.delete({ where: { id: bienenstandId } });

  if (bienenstand.standortFotoDateiname) await bildDateiLoeschen(bienenstand.standortFotoDateiname);
  for (const bild of bilder) {
    await bildDateiLoeschen(bild.dateiname);
  }

  revalidatePath("/");
  redirect("/");
}

// --- Volk ------------------------------------------------------------------

// Womit das Volk gefahren wird: eine Zarge (aus den Einstellungen) plus
// Betriebsweise (wie viele davon gestapelt sind) - beides eine Eigenschaft
// des Volkes, nicht der Zarge. Leere Auswahl heißt "nicht festgelegt" - die
// Angabe ist freiwillig, ohne sie funktioniert alles Übrige weiter.
function brutraumAusFormular(formData: FormData) {
  const anzahlRoh = zahlOderNull(formData.get("brutraumZargenAnzahl"));
  return {
    brutraumZargeId: textOderUndefined(formData.get("brutraumZargeId")) ?? null,
    brutraumZargenAnzahl: anzahlRoh !== null && anzahlRoh > 0 ? Math.min(5, Math.round(anzahlRoh)) : 1,
  };
}

// Waben im Brutraum je Art (siehe Volk.wabenStandAm): gilt nur, wenn das
// Formular "wabenErfassen" mitschickt - beim Anlegen immer, beim Bearbeiten
// erst, wenn etwas eingetragen ist. Dann mindestens eine Wabe und höchstens
// so viele, wie in den Brutraum passen. Der Erfassungszeitpunkt ist jetzt:
// Durchsichten ab hier werden auf diesen Stand gerechnet.
async function wabenStartAusFormular(
  formData: FormData
): Promise<{ fehler: string } | { daten: Partial<Record<(typeof WABEN_START_ARTEN)[number]["feld"], number> & { wabenStandAm: Date }> }> {
  if (formData.get("wabenErfassen") !== "ja") return { daten: {} };
  const werte = Object.fromEntries(
    WABEN_START_ARTEN.map((art) => {
      const zahl = zahlOderNull(formData.get(art.feld));
      return [art.feld, zahl === null ? 0 : Math.max(0, Math.round(zahl))];
    })
  ) as Record<(typeof WABEN_START_ARTEN)[number]["feld"], number>;
  const summe = startSumme(werte);
  if (summe < 1) return { fehler: "Bitte die Waben im Brutraum eintragen, mindestens eine." };
  const { brutraumZargeId, brutraumZargenAnzahl } = brutraumAusFormular(formData);
  const zarge = brutraumZargeId
    ? await prisma.zarge.findUnique({ where: { id: brutraumZargeId }, select: { wabenAnzahl: true } })
    : null;
  const platz = wabenPlatz(zarge, brutraumZargenAnzahl);
  if (summe > platz) {
    return { fehler: `${summe} Waben passen nicht in den Brutraum, dort ist Platz für ${platz}.` };
  }
  return { daten: { ...werte, wabenStandAm: new Date() } };
}

// Deckel: leer = Standarddeckel, sonst die ID eines Klimadeckels aus dem
// Lager. Fehlt das Feld ganz (kein Klimadeckel angelegt, die Auswahl wird
// dann nicht angezeigt), bleibt der bisherige Wert unangetastet.
function klimadeckelAusFormular(formData: FormData) {
  if (!formData.has("klimadeckelId")) return {};
  return { klimadeckelId: textOderUndefined(formData.get("klimadeckelId")) ?? null };
}

// Das Beutenfoto ist optional und einzeln (keine Galerie wie bei den
// Stockkarten-Fotos) - ein Handybild zum schnellen Wiedererkennen am Stand.
// Wird dafür klein genug gerechnet, dass es nie größer als eine
// Vorschaukachel gebraucht wird - anders als die Stockkarten-Fotos, die man
// in voller Auflösung anklickt.
async function beuteFotoAusFormular(formData: FormData) {
  const datei = formData.get("beuteFoto");
  if (!(datei instanceof File) || datei.size === 0 || !istErlaubterBildtyp(datei.type)) {
    return {};
  }
  const gespeichert = await verkleinertesFotoSpeichern(datei);
  return {
    beuteFotoDateiname: gespeichert.dateiname,
    beuteFotoOriginalDateiname: gespeichert.originalDateiname,
    beuteFotoMimeType: gespeichert.mimeType,
  };
}

// Fehler wie ein doppelter Name kommen als Rückgabewert zurück (siehe
// FormularErgebnis), damit der Dialog sie anzeigt, statt die Seite mit einer
// Fehlerseite abzubrechen.
export async function volkAnlegen(bienenstandId: string, formData: FormData): Promise<FormularErgebnis> {
  const name = textOderUndefined(formData.get("name"));
  if (!name) {
    return { fehler: "Name/Nummer des Volkes darf nicht leer sein." };
  }

  // Schützt vor Dopplungen, die z.B. entstehen, wenn "Anlegen" bei
  // schlechter Verbindung mehrfach angetippt wird, bevor die erste Anfrage
  // durchgelaufen ist (jeder Tap legt sonst ein eigenes Volk samt eigener
  // Königin an - genau das war der gemeldete Fehler). Groß-/Kleinschreibung
  // spielt dabei keine Rolle, Vergleich je Bienenstand (an anderen Ständen
  // darf derselbe Name vorkommen).
  const bestehendesVolk = await prisma.volk.findFirst({
    where: { bienenstandId, name: { equals: name, mode: "insensitive" } },
    select: { id: true },
  });
  if (bestehendesVolk) {
    return { fehler: `An diesem Stand gibt es bereits ein Volk namens „${name}“.` };
  }

  // Vorhandene Königin übernehmen statt eine neue zu erfassen: nur eine, die
  // lebt und in keinem Volk sitzt - aus einem anderen Volk holt man sie über
  // dessen Umweiseln, sonst stünde das Volk ohne Vermerk weisellos da.
  let bestandsKoenigin: { id: string; rasse: string | null } | null = null;
  if (formData.get("koeniginQuelle") === "bestand") {
    const koeniginId = textOderUndefined(formData.get("koeniginId"));
    if (!koeniginId) return { fehler: "Bitte die Königin wählen." };
    const koenigin = await prisma.koenigin.findUnique({
      where: { id: koeniginId },
      select: { id: true, rasse: true, status: true, volk: { select: { id: true } } },
    });
    if (!koenigin) return { fehler: "Diese Königin gibt es nicht mehr." };
    if (koenigin.status !== "RESERVE" || koenigin.volk) {
      return { fehler: "Diese Königin ist nicht mehr frei. Bitte neu wählen." };
    }
    bestandsKoenigin = koenigin;
  }

  const waben = await wabenStartAusFormular(formData);
  if ("fehler" in waben) return waben;

  const rasse = textOderUndefined(formData.get("rasse")) ?? bestandsKoenigin?.rasse ?? undefined;

  const volk = await prisma.volk.create({
    data: {
      bienenstandId,
      name,
      rasse,
      notizen: textOderUndefined(formData.get("notizen")),
      ...brutraumAusFormular(formData),
      ...waben.daten,
      ...klimadeckelAusFormular(formData),
      ...(await beuteFotoAusFormular(formData)),
    },
  });

  // Die Schnellangaben zur Königin (Jahrgang, Zeichen) legen gleich einen
  // eigenen Königin-Datensatz an - so bleibt der kurze Weg beim Anlegen
  // erhalten, die Daten liegen aber von Anfang an am richtigen Ort.
  if (bestandsKoenigin) {
    await koeniginZusetzen(bestandsKoenigin.id, volk.id, new Date());
    await koeniginPfadeNeuLaden(bestandsKoenigin.id);
  } else {
    await koeniginAusSchnellangaben(volk.id, formData, rasse ?? null);
  }

  revalidatePath(`/bienenstaende/${bienenstandId}`);
  redirect(`/voelker/${volk.id}`);
}

// Foto: neue Datei ersetzt eine vorhandene, sonst kann sie über das
// Entfernen-Feld gelöscht werden. Ohne beides bleibt das Foto unangetastet.
// Gemeinsam genutzt vom vollständigen "Volk bearbeiten" und vom
// Foto-Ändern direkt aus dem Lightbox-Popup auf der Volk-Seite.
async function fotoFelderAusFormular(
  formData: FormData,
  bestehendeDateiname: string | null
): Promise<{
  beuteFotoDateiname?: string | null;
  beuteFotoOriginalDateiname?: string | null;
  beuteFotoMimeType?: string | null;
  beuteFotoZoom?: number;
  beuteFotoFokusX?: number;
  beuteFotoFokusY?: number;
}> {
  const neueDatei = formData.get("beuteFoto");
  if (neueDatei instanceof File && neueDatei.size > 0 && istErlaubterBildtyp(neueDatei.type)) {
    if (bestehendeDateiname) await bildDateiLoeschen(bestehendeDateiname);
    const gespeichert = await verkleinertesFotoSpeichern(neueDatei);
    return {
      beuteFotoDateiname: gespeichert.dateiname,
      beuteFotoOriginalDateiname: gespeichert.originalDateiname,
      beuteFotoMimeType: gespeichert.mimeType,
      // Ein neues Foto macht den bisherigen Ausschnitt gegenstandslos.
      beuteFotoZoom: 1,
      beuteFotoFokusX: 0.5,
      beuteFotoFokusY: 0.5,
    };
  }
  if (formData.get("beuteFotoEntfernen") === "ja" && bestehendeDateiname) {
    await bildDateiLoeschen(bestehendeDateiname);
    return { beuteFotoDateiname: null, beuteFotoOriginalDateiname: null, beuteFotoMimeType: null };
  }
  return {};
}

// Gemeinsamer Kern für "Volk bearbeiten" - genutzt sowohl von der eigenen
// Bearbeiten-Seite als auch vom Schnell-Bearbeiten-Dialog in der Kachel der
// Standübersicht. Deckt auch den Standortwechsel ab (Bienenstand ändern) und
// das Ersetzen/Entfernen des Beutenfotos.
async function volkFelderAktualisieren(
  volkId: string,
  formData: FormData
): Promise<{ fehler: string } | { bienenstandId: string }> {
  const bestehend = await prisma.volk.findUnique({
    where: { id: volkId },
    select: { bienenstandId: true, beuteFotoDateiname: true },
  });
  if (!bestehend) {
    return { fehler: "Dieses Volk gibt es nicht mehr." };
  }

  const name = textOderUndefined(formData.get("name"));
  if (!name) {
    return { fehler: "Name/Nummer des Volkes darf nicht leer sein." };
  }

  const neuerBienenstandId = textOderUndefined(formData.get("bienenstandId")) ?? bestehend.bienenstandId;

  const bestehendesAnderesVolk = await prisma.volk.findFirst({
    where: {
      bienenstandId: neuerBienenstandId,
      name: { equals: name, mode: "insensitive" },
      NOT: { id: volkId },
    },
    select: { id: true },
  });
  if (bestehendesAnderesVolk) {
    return { fehler: `An diesem Stand gibt es bereits ein Volk namens „${name}“.` };
  }

  const waben = await wabenStartAusFormular(formData);
  if ("fehler" in waben) return waben;

  const fotoFelder = await fotoFelderAusFormular(formData, bestehend.beuteFotoDateiname);
  const rasse = textOderUndefined(formData.get("rasse"));

  const volk = await prisma.volk.update({
    where: { id: volkId },
    data: {
      name,
      bienenstandId: neuerBienenstandId,
      rasse,
      notizen: textOderUndefined(formData.get("notizen")),
      ...brutraumAusFormular(formData),
      ...waben.daten,
      ...klimadeckelAusFormular(formData),
      ...fotoFelder,
    },
  });

  await koeniginAusSchnellangaben(volkId, formData, rasse ?? null);

  // Bei einem Standortwechsel müssen beide Stände neu geladen werden: der
  // alte, damit das Volk dort verschwindet, der neue, damit es dort
  // vollständig auftaucht.
  revalidatePath(`/bienenstaende/${bestehend.bienenstandId}`);
  if (neuerBienenstandId !== bestehend.bienenstandId) {
    revalidatePath(`/bienenstaende/${neuerBienenstandId}`);
  }
  revalidatePath(`/voelker/${volkId}`);

  return volk;
}

// Kommt die Bearbeitung von der Kachel der Standübersicht (verstecktes Feld
// "zurueck" = "stand"), geht es danach dorthin zurück statt auf die Volk-Seite -
// bei einem Standortwechsel auf den neuen Stand, wo das Volk jetzt steht.
function zurueckZumStand(formData: FormData | undefined) {
  return formData?.get("zurueck") === "stand";
}

export async function volkAktualisieren(volkId: string, formData: FormData): Promise<FormularErgebnis> {
  const volk = await volkFelderAktualisieren(volkId, formData);
  if ("fehler" in volk) return volk;
  // Das Feld gibt es nur, wenn der Bereich Waagen eingeschaltet ist.
  if (formData.has("waageId")) await volkWaageSetzen(volkId, String(formData.get("waageId")));
  redirect(zurueckZumStand(formData) ? `/bienenstaende/${volk.bienenstandId}` : `/voelker/${volkId}`);
}

// Nur das Beutenfoto ändern oder entfernen - für das Lightbox-Popup auf der
// Volk-Seite, ohne den Umweg über das ganze Bearbeiten-Formular (das einen
// Namen verlangt, den man hier gar nicht mitschickt).
export async function volkFotoAktualisieren(volkId: string, formData: FormData) {
  const bestehend = await prisma.volk.findUniqueOrThrow({
    where: { id: volkId },
    select: { bienenstandId: true, beuteFotoDateiname: true },
  });

  const fotoFelder = await fotoFelderAusFormular(formData, bestehend.beuteFotoDateiname);

  await prisma.volk.update({ where: { id: volkId }, data: fotoFelder });

  revalidatePath(`/bienenstaende/${bestehend.bienenstandId}`);
  revalidatePath(`/voelker/${volkId}`);
}

// Nur den Bildausschnitt (Zoom/Fokuspunkt) speichern - aus dem
// Ausschnitt-Editor im Lightbox-Popup. Zoom unter 1 wäre "über den Bildrand
// hinaus", Fokuspunkte außerhalb 0-1 hätten keine Entsprechung mehr im Bild -
// beides wird darum sicherheitshalber auch serverseitig begrenzt, falls der
// Wert nicht über den Editor, sondern direkt an der Aktion vorbeigeschickt
// wird.
export async function volkFotoAusschnittAktualisieren(
  volkId: string,
  ausschnitt: { zoom: number; fokusX: number; fokusY: number }
) {
  const volk = await prisma.volk.update({
    where: { id: volkId },
    data: {
      beuteFotoZoom: begrenzterZoom(ausschnitt.zoom),
      beuteFotoFokusX: begrenzterFokus(ausschnitt.fokusX),
      beuteFotoFokusY: begrenzterFokus(ausschnitt.fokusY),
    },
    select: { bienenstandId: true },
  });

  revalidatePath(`/bienenstaende/${volk.bienenstandId}`);
  revalidatePath(`/voelker/${volkId}`);
}

// Umschalten zwischen chronologischer Anzeige (Reihenfolge der Anlage) und
// von Hand festgelegter Standposition auf der Bienenstand-Seite. Beim
// erstmaligen Wechsel zu "Standposition" bekommen Völker ohne bisherigen
// Wert (neue Völker, oder die Sortierung wurde hier noch nie benutzt) ihre
// chronologische Reihenfolge als Startaufstellung - danach lässt sie sich
// per Pfeiltasten umsortieren.
export async function bienenstandVoelkerSortierungAktualisieren(
  bienenstandId: string,
  sortierung: string
) {
  if (!(sortierung in VoelkerSortierung)) {
    throw new Error("Ungültige Sortierung.");
  }

  if (sortierung === VoelkerSortierung.STANDPOSITION) {
    const ohneReihenfolge = await prisma.volk.findMany({
      where: { bienenstandId, standReihenfolge: null },
      orderBy: { createdAt: "asc" },
      select: { id: true },
    });
    if (ohneReihenfolge.length > 0) {
      const vorhandeneMax = await prisma.volk.aggregate({
        where: { bienenstandId },
        _max: { standReihenfolge: true },
      });
      let naechstePosition = (vorhandeneMax._max.standReihenfolge ?? -1) + 1;
      await prisma.$transaction(async (tx) => {
        for (const volk of ohneReihenfolge) {
          await tx.volk.update({
            where: { id: volk.id },
            data: { standReihenfolge: naechstePosition++ },
          });
        }
      });
    }
  }

  await prisma.bienenstand.update({
    where: { id: bienenstandId },
    data: { voelkerSortierung: sortierung as VoelkerSortierung },
  });

  revalidatePath(`/bienenstaende/${bienenstandId}`);
}

// Ein Volk in der Standposition-Reihenfolge um eine Stelle nach vorn/hinten
// verschieben - tauscht dafür einfach die Position mit dem direkten Nachbarn.
// Nur unter aktiven (nicht archivierten) Völkern des Stands, das sind die,
// die in der normalen Ansicht auch umsortiert werden können.
export async function volkStandPositionVerschieben(
  volkId: string,
  richtung: "hoch" | "runter"
) {
  const volk = await prisma.volk.findUniqueOrThrow({
    where: { id: volkId },
    select: { bienenstandId: true },
  });

  const geschwister = await prisma.volk.findMany({
    where: { bienenstandId: volk.bienenstandId, archiviert: false },
    orderBy: [{ standReihenfolge: "asc" }, { createdAt: "asc" }],
    select: { id: true },
  });

  const index = geschwister.findIndex((eintrag) => eintrag.id === volkId);
  const nachbarIndex = richtung === "hoch" ? index - 1 : index + 1;
  if (index === -1 || nachbarIndex < 0 || nachbarIndex >= geschwister.length) {
    return;
  }

  // Positionen der gesamten aktiven Liste neu durchnummerieren (statt nur
  // die zwei betroffenen Werte zu tauschen) - so bleiben auch Völker, die
  // seit dem letzten Umschalten auf "Standposition" neu dazugekommen sind
  // (noch ohne eigenen Wert, hängen sich chronologisch ans Ende) danach
  // konsistent einsortiert, ohne Sonderfall für fehlende Werte.
  const neueReihenfolge = geschwister.map((eintrag) => eintrag.id);
  [neueReihenfolge[index], neueReihenfolge[nachbarIndex]] = [
    neueReihenfolge[nachbarIndex],
    neueReihenfolge[index],
  ];

  await prisma.$transaction(async (tx) => {
    for (const [position, id] of neueReihenfolge.entries()) {
      await tx.volk.update({ where: { id }, data: { standReihenfolge: position } });
    }
  });

  revalidatePath(`/bienenstaende/${volk.bienenstandId}`);
}

export async function volkStatusAendern(volkId: string, formData: FormData) {
  const status = formData.get("status")?.toString();
  if (!status || !(status in VolkStatus)) {
    throw new Error("Ungültiger Status.");
  }

  const volk = await prisma.volk.update({
    where: { id: volkId },
    data: { status: status as VolkStatus },
  });

  // Verkauft: Preis, Käufer und Datum landen in der Verkaufsliste. Wird der
  // Status zurückgenommen, verschwindet der Verkauf wieder.
  if (status === "VERKAUFT") {
    const daten = {
      art: formData.get("verkaufArt") === "ABLEGER" ? ("ABLEGER" as const) : ("VOLK" as const),
      datum: datumAusFormular(formData),
      bezeichnung: volk.name,
      preis: betragAusText(formData.get("preis")?.toString()),
      kaeufer: textOderUndefined(formData.get("kaeufer")) ?? null,
      notiz: textOderUndefined(formData.get("verkaufNotiz")) ?? null,
    };
    await prisma.verkauf.upsert({ where: { volkId }, create: { ...daten, volkId }, update: daten });
  } else {
    await prisma.verkauf.deleteMany({ where: { volkId } });
  }

  revalidatePath(`/voelker/${volkId}`);
  revalidatePath(`/bienenstaende/${volk.bienenstandId}`);
  revalidatePath(VERKAEUFE_PFAD);
}

const VERKAEUFE_PFAD = "/lager/verkaeufe";

/// Hält den Verkauf einer Königin passend zu ihrem Ereignis "verkauft": legt
/// ihn an oder zieht Datum und Kennung nach, Preis und Käufer nur, wenn das
/// Formular sie mitschickt. Ist das Ereignis keins (mehr), fällt er weg.
async function koeniginVerkaufAbgleichen(ereignisId: string, formData?: FormData) {
  const ereignis = await prisma.koeniginEreignis.findUnique({
    where: { id: ereignisId },
    select: { art: true, datum: true, koeniginId: true, notiz: true, koenigin: { select: { kennung: true } } },
  });
  if (!ereignis || ereignis.art !== "VERKAUFT") {
    await prisma.verkauf.deleteMany({ where: { koeniginEreignisId: ereignisId } });
    revalidatePath(VERKAEUFE_PFAD);
    return;
  }
  const preisFelder =
    formData && formData.has("preis")
      ? {
          preis: betragAusText(formData.get("preis")?.toString()),
          kaeufer: textOderUndefined(formData.get("kaeufer")) ?? null,
        }
      : {};
  const daten = { datum: ereignis.datum, bezeichnung: ereignis.koenigin.kennung, koeniginId: ereignis.koeniginId, ...preisFelder };
  await prisma.verkauf.upsert({
    where: { koeniginEreignisId: ereignisId },
    create: { ...daten, art: "KOENIGIN", koeniginEreignisId: ereignisId, notiz: ereignis.notiz },
    update: daten,
  });
  revalidatePath(VERKAEUFE_PFAD);
}

function verkaufAusFormular(formData: FormData) {
  const art = enumWertOderNull(VERKAUF_ARTEN, formData.get("art"));
  const anzahlRoh = zahlOderNull(formData.get("anzahl"));
  return {
    art,
    datum: datumAusFormular(formData),
    bezeichnung: textOderUndefined(formData.get("bezeichnung")) ?? null,
    anzahl: anzahlRoh === null ? 1 : Math.max(1, Math.round(anzahlRoh)),
    preis: betragAusText(formData.get("preis")?.toString()),
    kaeufer: textOderUndefined(formData.get("kaeufer")) ?? null,
    notiz: textOderUndefined(formData.get("notiz")) ?? null,
  };
}

/// Frei erfasster Verkauf (z.B. ein Ableger, der nie als Volk geführt wurde).
export async function verkaufAnlegen(formData: FormData): Promise<FormularErgebnis> {
  const { art, bezeichnung, ...rest } = verkaufAusFormular(formData);
  if (!art) return { fehler: "Bitte wählen, was du verkauft hast." };
  await prisma.verkauf.create({ data: { ...rest, art, bezeichnung: bezeichnung ?? VERKAUF_ART_NAME[art] } });
  revalidatePath(VERKAEUFE_PFAD);
}

/// Verkauf ändern. Bei Volk und Königin bleiben Name und Bezug, wie sie sind;
/// Volk und Ableger lassen sich gegeneinander tauschen.
export async function verkaufAendern(verkaufId: string, formData: FormData): Promise<FormularErgebnis> {
  const bestehend = await prisma.verkauf.findUnique({
    where: { id: verkaufId },
    select: { art: true, volkId: true, koeniginEreignisId: true },
  });
  if (!bestehend) return { fehler: "Diesen Verkauf gibt es nicht mehr." };
  const { art, bezeichnung, datum, ...rest } = verkaufAusFormular(formData);
  const verknuepft = bestehend.volkId !== null || bestehend.koeniginEreignisId !== null;
  let neueArt = art ?? bestehend.art;
  if (bestehend.koeniginEreignisId) neueArt = "KOENIGIN";
  else if (bestehend.volkId && neueArt !== "ABLEGER") neueArt = "VOLK";
  await prisma.verkauf.update({
    where: { id: verkaufId },
    data: { ...rest, datum, art: neueArt, ...(verknuepft || !bezeichnung ? {} : { bezeichnung }) },
  });
  // Das Datum gehört bei der Königin zum Ereignis im Lebenslauf.
  if (bestehend.koeniginEreignisId) {
    await prisma.koeniginEreignis.update({ where: { id: bestehend.koeniginEreignisId }, data: { datum } });
  }
  revalidatePath(VERKAEUFE_PFAD);
}

/// Löschen nur bei frei erfassten Verkäufen. Volk und Königin gehen über
/// ihren Status bzw. ihr Ereignis, damit beides zusammenpasst.
export async function verkaufLoeschen(verkaufId: string) {
  await prisma.verkauf.deleteMany({ where: { id: verkaufId, volkId: null, koeniginEreignisId: null } });
  revalidatePath(VERKAEUFE_PFAD);
}

/// Erlös, Käufer, Datum und Notiz eines Lager-Verkaufs nachtragen oder ändern.
export async function erzeugnisVerkaufAendern(buchungId: string, formData: FormData): Promise<FormularErgebnis> {
  const buchung = await prisma.erzeugnisBuchung.findUnique({ where: { id: buchungId }, select: { id: true } });
  if (!buchung) return { fehler: "Diese Buchung gibt es nicht mehr." };
  await prisma.erzeugnisBuchung.update({
    where: { id: buchungId },
    data: {
      erloes: betragAusText(formData.get("preis")?.toString()),
      kaeufer: textOderUndefined(formData.get("kaeufer")) ?? null,
      notizen: textOderUndefined(formData.get("notiz")) ?? null,
      datum: datumAusFormular(formData),
    },
  });
  revalidatePath(LAGER_PFAD, "layout");
}

// Zieht ein Volk komplett zu einem anderen, bestehenden Bienenstand um. Die
// gesamte Dokumentation (Stockkarten-Verlauf, Fotos, Maßnahmen, Behandlungen,
// ...) hängt am Volk (`volkId`), nicht am Stand - sie bleibt beim Umziehen
// also 1:1 erhalten, nur `bienenstandId` wechselt. Zusätzlich entsteht ein
// eigener Stockkarten-Eintrag, der den Umzug dokumentiert: von welchem Stand,
// zu welchem Datum/welcher Uhrzeit.
export async function volkUmziehen(volkId: string, formData: FormData): Promise<FormularErgebnis> {
  const zielBienenstandId = formData.get("zielBienenstandId")?.toString();
  if (!zielBienenstandId) {
    return { fehler: "Bitte einen Zielstand auswählen." };
  }

  const volk = await prisma.volk.findUnique({
    where: { id: volkId },
    select: { bienenstandId: true, bienenstand: { select: { name: true } } },
  });
  if (!volk) {
    return { fehler: "Dieses Volk gibt es nicht mehr." };
  }

  if (zielBienenstandId === volk.bienenstandId) {
    return { fehler: "Das Volk steht bereits an diesem Stand." };
  }

  const zielstand = await prisma.bienenstand.findUnique({
    where: { id: zielBienenstandId },
    select: { id: true },
  });
  if (!zielstand) {
    return { fehler: "Den gewählten Bienenstand gibt es nicht mehr." };
  }

  const datumRoh = formData.get("datum")?.toString();
  const zeitpunkt =
    formData.get("zeitwahl")?.toString() === "manuell" && datumRoh ? new Date(datumRoh) : new Date();
  if (Number.isNaN(zeitpunkt.getTime())) {
    return { fehler: "Bitte ein gültiges Datum eingeben." };
  }

  await prisma.$transaction(async (tx) => {
    await tx.volk.update({
      where: { id: volkId },
      data: {
        bienenstandId: zielBienenstandId,
        // Die bisherige Standposition galt für den alten Stand - am neuen
        // fällt die Anzeige zunächst auf die chronologische Reihenfolge
        // zurück, genau wie bei einem neu angelegten Volk.
        standReihenfolge: null,
      },
    });
    await tx.stockkartenEintrag.create({
      data: {
        volkId,
        datum: zeitpunkt,
        umzugVonStandName: volk.bienenstand.name,
      },
    });
  });

  revalidatePath(`/bienenstaende/${volk.bienenstandId}`);
  revalidatePath(`/bienenstaende/${zielBienenstandId}`);
  revalidatePath(`/voelker/${volkId}`);
}

export async function volkArchivieren(volkId: string, formData?: FormData) {
  const volk = await prisma.volk.update({
    where: { id: volkId },
    data: { archiviert: true, archiviertAm: new Date() },
  });

  revalidatePath(`/bienenstaende/${volk.bienenstandId}`);
  revalidatePath(`/voelker/${volkId}`);
  redirect(zurueckZumStand(formData) ? `/bienenstaende/${volk.bienenstandId}` : `/voelker/${volkId}`);
}

export async function volkReaktivieren(volkId: string, formData?: FormData) {
  const volk = await prisma.volk.update({
    where: { id: volkId },
    data: { archiviert: false, archiviertAm: null },
  });

  revalidatePath(`/bienenstaende/${volk.bienenstandId}`);
  revalidatePath(`/voelker/${volkId}`);
  redirect(zurueckZumStand(formData) ? `/bienenstaende/${volk.bienenstandId}` : `/voelker/${volkId}`);
}

export async function volkLoeschen(volkId: string): Promise<{ fehler: string } | void> {
  // Sperre fürs Bestandsbuch (5 Jahre Aufbewahrung), siehe lib/bestandsbuch-sperre.ts
  const behandlungen = await behandlungenAmVolk(volkId);
  if (behandlungen > 0) return { fehler: sperrtextVolk(behandlungen) };

  const volk = await prisma.volk.findUniqueOrThrow({
    where: { id: volkId },
    select: { bienenstandId: true },
  });

  const bilder = await prisma.bild.findMany({
    where: { stockkartenEintrag: { volkId } },
    select: { dateiname: true },
  });

  await prisma.volk.delete({ where: { id: volkId } });

  for (const bild of bilder) {
    await bildDateiLoeschen(bild.dateiname);
  }

  revalidatePath(`/bienenstaende/${volk.bienenstandId}`);
  redirect(`/bienenstaende/${volk.bienenstandId}`);
}

/// Lernt einen gescannten QR-Code für dieses Volk an - fertige Karte oder
/// selbst erzeugter Code, siehe /einstellungen/qr-codes. Trägt ein anderes
/// Volk den Code schon, wird ohne `uebernehmen` abgebrochen, damit nicht aus
/// Versehen eine falsche Beute überschrieben wird; erst der zweite Aufruf mit
/// `uebernehmen: true` (nach Rückfrage in der Oberfläche) trägt ihn um.
export async function volkQrCodeLernen(
  volkId: string,
  wert: string,
  uebernehmen = false
): Promise<
  | { ok: true }
  | { ok: false; fehler: string }
  | { ok: false; konflikt: { volkId: string; volkName: string; bienenstandName: string } }
> {
  const bereinigt = wert.trim();
  if (!bereinigt) {
    return { ok: false, fehler: "Im Code steht kein Text. Bitte erneut scannen." };
  }

  const vorhanden = await prisma.volk.findUnique({
    where: { qrCodeWert: bereinigt },
    select: { id: true, name: true, bienenstand: { select: { name: true } } },
  });

  if (vorhanden && vorhanden.id !== volkId && !uebernehmen) {
    return {
      ok: false,
      konflikt: { volkId: vorhanden.id, volkName: vorhanden.name, bienenstandName: vorhanden.bienenstand.name },
    };
  }

  // Bei einer Übernahme muss der Code beim bisherigen Volk erst frei werden -
  // sonst stünde er kurzzeitig bei beiden und die Eindeutigkeit (unique
  // constraint) schlägt fehl. Beides zusammen in einer Transaktion, damit nie
  // ein Zwischenzustand ganz ohne Zuordnung sichtbar wird.
  const volk = await prisma.$transaction(async (tx) => {
    if (vorhanden && vorhanden.id !== volkId) {
      await tx.volk.update({ where: { id: vorhanden.id }, data: { qrCodeWert: null } });
    }
    return tx.volk.update({
      where: { id: volkId },
      data: { qrCodeWert: bereinigt },
      select: { bienenstandId: true },
    });
  });

  revalidatePath(`/voelker/${volkId}`);
  if (vorhanden && vorhanden.id !== volkId) {
    revalidatePath(`/voelker/${vorhanden.id}`);
  }
  revalidatePath(`/bienenstaende/${volk.bienenstandId}`);
  return { ok: true };
}

export async function volkQrCodeEntfernen(volkId: string) {
  await prisma.volk.update({ where: { id: volkId }, data: { qrCodeWert: null } });
  revalidatePath(`/voelker/${volkId}`);
}

/// Sucht das Volk zu einem gescannten Code - für den Scan-Button in der
/// Kopfzeile (/scannen) und den Direktlink /qr/[wert] eigener Codes.
export async function volkFuerQrCode(
  wert: string
): Promise<{ id: string; name: string; bienenstandName: string } | null> {
  const bereinigt = wert.trim();
  if (!bereinigt) return null;

  const volk = await prisma.volk.findUnique({
    where: { qrCodeWert: bereinigt },
    select: { id: true, name: true, bienenstand: { select: { name: true } } },
  });
  if (!volk) return null;
  return { id: volk.id, name: volk.name, bienenstandName: volk.bienenstand.name };
}

// --- Königinnen ---------------------------------------------------------------
//
// Die Königin ist ein eigener Datensatz, das Volk verweist nur auf die, die
// gerade darin sitzt. Dadurch bleiben frühere Königinnen nach einem Tausch
// erhalten (samt Abstammung ihrer Töchter) und behalten ihren Lebenslauf.

const KOENIGINNEN_PFAD = "/koeniginnen";

/// Schlägt die nächste freie Kennung vor: Kürzel des Halters, Jahr,
/// fortlaufende Nummer - z.B. "FW 2026-14".
export async function kennungVorschlagen(jahr: number): Promise<string> {
  const [betrieb, vorhandene] = await Promise.all([
    prisma.betrieb.findUnique({ where: { id: "standard" }, select: { halterName: true } }),
    prisma.koenigin.findMany({ select: { kennung: true } }),
  ]);

  return naechsteKennung(
    kennungsKuerzel(betrieb?.halterName),
    jahr,
    vorhandene.map((eintrag) => eintrag.kennung)
  );
}

/// Die Schnellangaben aus dem Volk-Formular (Jahrgang, Kennzeichnung) auf die
/// Königin des Volkes übertragen: vorhandene wird ergänzt, sonst entsteht
/// eine neue. Leere Angaben lassen alles unangetastet - eine bestehende
/// Königin wird darüber nie gelöscht, das läuft über ihre eigene Seite.
async function koeniginAusSchnellangaben(volkId: string, formData: FormData, rasse: string | null) {
  const jahrRoh = textOderUndefined(formData.get("koeniginJahr"));
  const zeichenFarbe = textOderUndefined(formData.get("koeniginZeichenFarbe")) ?? null;
  const zeichenNummer = textOderUndefined(formData.get("koeniginZeichenNummer")) ?? null;
  const jahrgang = jahrRoh ? Number.parseInt(jahrRoh, 10) : null;
  if (jahrgang === null && zeichenFarbe === null && zeichenNummer === null) return;

  const volk = await prisma.volk.findUniqueOrThrow({
    where: { id: volkId },
    select: { koeniginId: true },
  });

  if (volk.koeniginId) {
    await prisma.koenigin.update({
      where: { id: volk.koeniginId },
      data: { jahrgang, zeichenFarbe, zeichenNummer },
    });
    return;
  }

  const koenigin = await prisma.koenigin.create({
    data: {
      kennung: await kennungVorschlagen(jahrgang ?? new Date().getFullYear()),
      rasse,
      jahrgang,
      zeichenFarbe,
      zeichenNummer,
      status: "IM_VOLK",
    },
  });
  await prisma.volk.update({ where: { id: volkId }, data: { koeniginId: koenigin.id } });
}

function koeniginFelderAusFormular(formData: FormData) {
  const jahrgangRoh = textOderUndefined(formData.get("jahrgang"));
  const schlupfRoh = textOderUndefined(formData.get("schlupfDatum"));
  const vonRoh = textOderUndefined(formData.get("begattungVon"));
  const bisRoh = textOderUndefined(formData.get("begattungBis"));

  const begattungsart = enumWertOderNull(BEGATTUNGSARTEN, formData.get("begattungsart")) ?? "UNBEKANNT";
  const herkunft = enumWertOderNull(HERKUENFTE, formData.get("herkunft")) ?? "UNBEKANNT";

  return {
    zuchtbuchnummer: textOderUndefined(formData.get("zuchtbuchnummer")) ?? null,
    rasse: textOderUndefined(formData.get("rasse")) ?? null,
    jahrgang: jahrgangRoh ? Number.parseInt(jahrgangRoh, 10) : null,
    schlupfDatum: schlupfRoh ? new Date(schlupfRoh) : null,
    zeichenFarbe: textOderUndefined(formData.get("zeichenFarbe")) ?? null,
    zeichenNummer: textOderUndefined(formData.get("zeichenNummer")) ?? null,
    herkunft,
    herkunftText: textOderUndefined(formData.get("herkunftText")) ?? null,
    herkunftsVolkId:
      herkunft === "NACHSCHAFFUNG" ? (textOderUndefined(formData.get("herkunftsVolkId")) ?? null) : null,
    begattungsart,
    // Belegstelle und Begattungsstand gehören jeweils nur zu einer
    // Begattungsart - die andere wird bewusst geleert, damit keine
    // widersprüchliche Angabe stehen bleibt, wenn man die Art wechselt.
    belegstelleId:
      begattungsart === "BELEGSTELLE" ? (textOderUndefined(formData.get("belegstelleId")) ?? null) : null,
    begattungsStandId:
      begattungsart === "STANDBEGATTUNG"
        ? (textOderUndefined(formData.get("begattungsStandId")) ?? null)
        : null,
    begattungVon: vonRoh ? new Date(vonRoh) : null,
    begattungBis: bisRoh ? new Date(bisRoh) : null,
    vaterlinie: textOderUndefined(formData.get("vaterlinie")) ?? null,
    mutterKoeniginId: textOderUndefined(formData.get("mutterKoeniginId")) ?? null,
    notizen: textOderUndefined(formData.get("notizen")) ?? null,
    // `zuchtkarteBemerkung` steht bewusst nicht hier: das Feld gibt es im
    // Formular nicht (die Bemerkung steht auf der Zuchtkarte selbst). Läse man
    // sie hier mit aus, würde jedes Speichern sie löschen.
  };
}

/// Zuchtkarte einer zugekauften Königin (Foto, Scan oder PDF): in voller
/// Auflösung gespeichert (wie die Medikamenten-Belege) - eine verkleinerte
/// Karte wäre nicht mehr lesbar und damit wertlos.
///
/// Liefert die zu ändernden Datenbankfelder (`felder`) und getrennt davon die
/// Dateien: `neueDatei` ist gerade gespeichert worden (und muss weg, falls das
/// Speichern der Datenbank scheitert), `alteDatei` darf erst gelöscht werden,
/// wenn die Datenbank erfolgreich umgestellt ist. Würde man die bisherige
/// Karte schon hier löschen und die Datenbank scheiterte danach, zeigte sie
/// weiter auf eine Datei, die es nicht mehr gibt.
async function zuchtkarteAusFormular(formData: FormData, bestehendeDateiname: string | null) {
  const datei = formData.get("zuchtkarteFoto");
  if (datei instanceof File && datei.size > 0) {
    // Nie stillschweigend verwerfen: wer eine Karte hochlädt, soll sie
    // hinterher auch finden - oder erfahren, warum es nicht geklappt hat.
    const dateityp = zuchtkartenDateityp(datei);
    if (!dateityp) throw new Error(ZUCHTKARTE_DATEITYP_HINWEIS);

    const gespeichert = await bildSpeichern(datei);
    return {
      felder: {
        zuchtkarteFotoDateiname: gespeichert.dateiname,
        zuchtkarteFotoOriginalDateiname: gespeichert.originalDateiname,
        zuchtkarteFotoMimeType: dateityp,
      },
      neueDatei: gespeichert.dateiname as string | null,
      alteDatei: bestehendeDateiname,
    };
  }
  if (formData.get("zuchtkarteFotoEntfernen") === "ja" && bestehendeDateiname) {
    return {
      felder: {
        zuchtkarteFotoDateiname: null,
        zuchtkarteFotoOriginalDateiname: null,
        zuchtkarteFotoMimeType: null,
      },
      neueDatei: null,
      alteDatei: bestehendeDateiname,
    };
  }
  return { felder: {}, neueDatei: null, alteDatei: null };
}

export async function koeniginAnlegen(formData: FormData) {
  const felder = koeniginFelderAusFormular(formData);
  const kennung =
    textOderUndefined(formData.get("kennung")) ??
    (await kennungVorschlagen(felder.jahrgang ?? new Date().getFullYear()));

  const zuchtkarte = await zuchtkarteAusFormular(formData, null);
  let koenigin;
  try {
    koenigin = await prisma.koenigin.create({
      data: {
        ...felder,
        kennung,
        ...zuchtkarte.felder,
        status: "RESERVE",
      },
    });
  } catch (fehler) {
    if (zuchtkarte.neueDatei) await bildDateiLoeschen(zuchtkarte.neueDatei);
    throw fehler;
  }

  // Schlupf und Zusetzen gleich als erste Stationen im Lebenslauf festhalten -
  // sonst müsste man dieselben Daten hinterher noch einmal eintippen.
  if (felder.schlupfDatum) {
    await prisma.koeniginEreignis.create({
      data: { koeniginId: koenigin.id, datum: felder.schlupfDatum, art: "GESCHLUEPFT" },
    });
  }

  const volkId = textOderUndefined(formData.get("volkId"));
  if (volkId) {
    await koeniginZusetzen(koenigin.id, volkId, new Date(), "beim Anlegen zugeordnet");
  }

  revalidatePath(KOENIGINNEN_PFAD);
  redirect(`${KOENIGINNEN_PFAD}/${koenigin.id}`);
}

export async function koeniginAktualisieren(koeniginId: string, formData: FormData) {
  const bestehend = await prisma.koenigin.findUniqueOrThrow({
    where: { id: koeniginId },
    select: { zuchtkarteFotoDateiname: true },
  });

  const kennung = textOderUndefined(formData.get("kennung"));
  const status = enumWertOderNull(KOENIGIN_STATUS, formData.get("status"));

  const zuchtkarte = await zuchtkarteAusFormular(formData, bestehend.zuchtkarteFotoDateiname);
  try {
    await prisma.koenigin.update({
      where: { id: koeniginId },
      data: {
        ...koeniginFelderAusFormular(formData),
        ...(kennung ? { kennung } : {}),
        ...(status ? { status } : {}),
        ...zuchtkarte.felder,
      },
    });
  } catch (fehler) {
    // Die bisherige Karte bleibt unangetastet; nur die gerade abgelegte
    // neue Datei wieder wegräumen.
    if (zuchtkarte.neueDatei) await bildDateiLoeschen(zuchtkarte.neueDatei);
    throw fehler;
  }
  if (zuchtkarte.alteDatei) await bildDateiLoeschen(zuchtkarte.alteDatei);

  await koeniginPfadeNeuLaden(koeniginId);
  redirect(`${KOENIGINNEN_PFAD}/${koeniginId}`);
}

export async function koeniginLoeschen(koeniginId: string) {
  const koenigin = await prisma.koenigin.findUniqueOrThrow({
    where: { id: koeniginId },
    select: {
      zuchtkarteFotoDateiname: true,
      fotoDateiname: true,
      ereignisse: { select: { fotoDateiname: true } },
      volk: { select: { id: true, bienenstandId: true } },
    },
  });

  await prisma.koenigin.delete({ where: { id: koeniginId } });
  for (const dateiname of [
    koenigin.zuchtkarteFotoDateiname,
    koenigin.fotoDateiname,
    ...koenigin.ereignisse.map((ereignis) => ereignis.fotoDateiname),
  ]) {
    if (dateiname) await bildDateiLoeschen(dateiname);
  }

  if (koenigin.volk) {
    revalidatePath(`/voelker/${koenigin.volk.id}`);
    revalidatePath(`/bienenstaende/${koenigin.volk.bienenstandId}`);
  }
  revalidatePath(KOENIGINNEN_PFAD);
  redirect(KOENIGINNEN_PFAD);
}

async function koeniginPfadeNeuLaden(koeniginId: string) {
  const koenigin = await prisma.koenigin.findUnique({
    where: { id: koeniginId },
    select: { volk: { select: { id: true, bienenstandId: true } } },
  });

  revalidatePath(KOENIGINNEN_PFAD);
  revalidatePath(`${KOENIGINNEN_PFAD}/${koeniginId}`);
  if (koenigin?.volk) {
    revalidatePath(`/voelker/${koenigin.volk.id}`);
    revalidatePath(`/bienenstaende/${koenigin.volk.bienenstandId}`);
  }
}

/// Königin in ein Volk setzen. Sitzt sie noch woanders, wird sie dort gelöst;
/// sitzt im Zielvolk schon eine andere, wird die entnommen und landet in der
/// Reserve - zwei Königinnen in einem Volk kann es nicht geben, und das
/// stillschweigend zu übergehen würde den Bestand verfälschen.
async function koeniginZusetzen(
  koeniginId: string,
  volkId: string,
  datum: Date,
  notiz?: string,
  fotoFelder: { fotoDateiname?: string; fotoOriginalDateiname?: string; fotoMimeType?: string } = {}
) {
  const [bisherigesVolk, zielVolk] = await Promise.all([
    prisma.volk.findFirst({ where: { koeniginId }, select: { id: true, bienenstandId: true } }),
    prisma.volk.findUniqueOrThrow({
      where: { id: volkId },
      select: { id: true, bienenstandId: true, koeniginId: true, koenigin: { select: { kennung: true } } },
    }),
  ]);

  if (bisherigesVolk && bisherigesVolk.id !== volkId) {
    await prisma.volk.update({ where: { id: bisherigesVolk.id }, data: { koeniginId: null } });
    revalidatePath(`/voelker/${bisherigesVolk.id}`);
    revalidatePath(`/bienenstaende/${bisherigesVolk.bienenstandId}`);
  }

  if (zielVolk.koeniginId && zielVolk.koeniginId !== koeniginId) {
    const neue = await prisma.koenigin.findUniqueOrThrow({
      where: { id: koeniginId },
      select: { kennung: true },
    });
    await prisma.volk.update({ where: { id: volkId }, data: { koeniginId: null } });
    await prisma.koenigin.update({ where: { id: zielVolk.koeniginId }, data: { status: "RESERVE" } });
    await prisma.koeniginEreignis.create({
      data: {
        koeniginId: zielVolk.koeniginId,
        datum,
        art: "ENTNOMMEN",
        volkId,
        notiz: `ersetzt durch ${neue.kennung}`,
      },
    });
    await koeniginPfadeNeuLaden(zielVolk.koeniginId);
  }

  await prisma.volk.update({ where: { id: volkId }, data: { koeniginId } });
  await prisma.koenigin.update({ where: { id: koeniginId }, data: { status: "IM_VOLK" } });
  await prisma.koeniginEreignis.create({
    data: { koeniginId, datum, art: "ZUGESETZT", volkId, notiz: notiz ?? null, ...fotoFelder },
  });

  revalidatePath(`/voelker/${volkId}`);
  revalidatePath(`/bienenstaende/${zielVolk.bienenstandId}`);
}

/// Foto zu einer Station im Lebenslauf - etwa vom Brutbild beim Zusetzen
/// oder von der gezeichneten Königin. Verkleinert wie die übrigen
/// Erkennungsfotos, es geht ums Wiedererkennen, nicht ums Vermessen.
async function ereignisFotoAusFormular(formData: FormData) {
  const datei = formData.get("foto");
  if (!(datei instanceof File) || datei.size === 0 || !istErlaubterBildtyp(datei.type)) return {};
  const gespeichert = await verkleinertesFotoSpeichern(datei);
  return {
    fotoDateiname: gespeichert.dateiname,
    fotoOriginalDateiname: gespeichert.originalDateiname,
    fotoMimeType: gespeichert.mimeType,
  };
}

/// Status und Volk-Zuordnung anhand des zeitlich letzten Lebenslauf-Eintrags
/// neu bestimmen - gebraucht nach dem Bearbeiten oder Löschen eines
/// Eintrags, weil sich dadurch herausstellen kann, dass ein anderer Eintrag
/// jetzt der aktuellste ist (z.B. wenn sein Datum korrigiert wurde).
///
/// Bewusst zurückhaltend beim Zusetzen: sitzt im Zielvolk laut dem
/// korrigierten Eintrag schon eine andere Königin, wird die nicht
/// automatisch entnommen (das würde bei einer bloßen Korrektur überraschende
/// Nebenwirkungen bei einer ganz anderen Königin auslösen) - dafür bleibt der
/// reguläre Weg über "Königin zusetzen" am Volk.
async function koeniginStatusVolkNeuBerechnen(koeniginId: string) {
  const [koenigin, letztes] = await Promise.all([
    prisma.koenigin.findUniqueOrThrow({
      where: { id: koeniginId },
      select: { volk: { select: { id: true, bienenstandId: true } } },
    }),
    prisma.koeniginEreignis.findFirst({
      where: { koeniginId },
      orderBy: [{ datum: "desc" }, { createdAt: "desc" }],
    }),
  ]);

  if (!letztes) return;

  const neuerStatus = statusNachEreignis(letztes.art as EreignisArt);
  if (neuerStatus) {
    await prisma.koenigin.update({ where: { id: koeniginId }, data: { status: neuerStatus } });
  }

  const bisherigeVolkId = koenigin.volk?.id ?? null;

  if (letztes.art === "ZUGESETZT" && letztes.volkId && letztes.volkId !== bisherigeVolkId) {
    const zielVolk = await prisma.volk.findUnique({
      where: { id: letztes.volkId },
      select: { koeniginId: true, bienenstandId: true },
    });
    if (zielVolk && !zielVolk.koeniginId) {
      if (bisherigeVolkId) {
        await prisma.volk.update({ where: { id: bisherigeVolkId }, data: { koeniginId: null } });
        revalidatePath(`/voelker/${bisherigeVolkId}`);
        revalidatePath(`/bienenstaende/${koenigin.volk!.bienenstandId}`);
      }
      await prisma.volk.update({ where: { id: letztes.volkId }, data: { koeniginId } });
      revalidatePath(`/voelker/${letztes.volkId}`);
      revalidatePath(`/bienenstaende/${zielVolk.bienenstandId}`);
    }
  } else if (loestVolkZuordnung(letztes.art as EreignisArt) && bisherigeVolkId) {
    await prisma.volk.update({ where: { id: bisherigeVolkId }, data: { koeniginId: null } });
    revalidatePath(`/voelker/${bisherigeVolkId}`);
    revalidatePath(`/bienenstaende/${koenigin.volk!.bienenstandId}`);
  }
}

/// Ein Ereignis im Lebenslauf festhalten. Der Verbleib der Königin und ihre
/// Zuordnung zu einem Volk ergeben sich daraus - deshalb wird beides hier
/// gleich mitgezogen, statt es getrennt pflegen zu müssen.
export async function koeniginEreignisHinzufuegen(koeniginId: string, formData: FormData) {
  const art = enumWertOderNull(EREIGNIS_ARTEN, formData.get("art"));
  if (!art) throw new Error("Bitte die Art des Ereignisses wählen.");

  const datumRoh = textOderUndefined(formData.get("datum"));
  const datum = datumRoh ? new Date(datumRoh) : new Date();
  const volkId = textOderUndefined(formData.get("volkId")) ?? null;
  const notiz = textOderUndefined(formData.get("notiz")) ?? null;

  if (art === "ZUGESETZT") {
    if (!volkId) throw new Error("Zum Zusetzen bitte ein Volk wählen.");
    await koeniginZusetzen(koeniginId, volkId, datum, notiz ?? undefined, await ereignisFotoAusFormular(formData));
    await koeniginPfadeNeuLaden(koeniginId);
    return;
  }

  const neu = await prisma.koeniginEreignis.create({
    data: { koeniginId, datum, art: art as EreignisArt, volkId, notiz, ...(await ereignisFotoAusFormular(formData)) },
  });
  if (art === "VERKAUFT") await koeniginVerkaufAbgleichen(neu.id, formData);

  const neuerStatus = statusNachEreignis(art as EreignisArt);
  if (neuerStatus) {
    await prisma.koenigin.update({ where: { id: koeniginId }, data: { status: neuerStatus } });
  }

  if (loestVolkZuordnung(art as EreignisArt)) {
    const volk = await prisma.volk.findFirst({ where: { koeniginId }, select: { id: true, bienenstandId: true } });
    if (volk) {
      await prisma.volk.update({ where: { id: volk.id }, data: { koeniginId: null } });
      revalidatePath(`/voelker/${volk.id}`);
      revalidatePath(`/bienenstaende/${volk.bienenstandId}`);
    }
  }

  await koeniginPfadeNeuLaden(koeniginId);
}

/// Die Zuchtkarte einer Königin speichern: legt sie an, wenn es noch keine
/// gibt, sonst ersetzt sie die vorhandene. Der Inhalt kommt Feld für Feld aus
/// dem Editor; was nicht zur Karte gehört oder sich nicht drucken lässt, wird
/// dabei verworfen (siehe lib/zuchtkarte-inhalt.ts). Die Daten der Königin
/// selbst bleiben unberührt.
export async function zuchtkarteSpeichern(koeniginId: string, formData: FormData) {
  await prisma.koenigin.findUniqueOrThrow({ where: { id: koeniginId }, select: { id: true } });

  const inhalt = inhaltAusFormular(formData);
  await prisma.zuchtkarte.upsert({
    where: { koeniginId },
    create: { koeniginId, inhalt },
    update: { inhalt },
  });

  await zuchtkartePfadeNeuLaden(koeniginId);
  redirect(`${KOENIGINNEN_PFAD}/${koeniginId}`);
}

/// Die erstellte Zuchtkarte wieder entfernen - danach gilt die Königin als
/// "ohne Zuchtkarte" und beim nächsten Erstellen wird neu aus ihren Daten
/// vorbelegt.
export async function zuchtkarteEntfernen(koeniginId: string) {
  await prisma.zuchtkarte.deleteMany({ where: { koeniginId } });

  await zuchtkartePfadeNeuLaden(koeniginId);
  redirect(`${KOENIGINNEN_PFAD}/${koeniginId}`);
}

async function zuchtkartePfadeNeuLaden(koeniginId: string) {
  await koeniginPfadeNeuLaden(koeniginId);
  revalidatePath("/dokumente");
  revalidatePath(`${KOENIGINNEN_PFAD}/zuchtkarten`);
}

/// Kurze Einordnung zum Honigertrag speichern - steht direkt bei der
/// Ertragszeile in den Stammdaten, weil der Ertrag selbst keine Note
/// bekommt und dieser Text der einzige Kontext dazu ist.
export async function koeniginHonigertragBemerkungSpeichern(koeniginId: string, formData: FormData) {
  await prisma.koenigin.update({
    where: { id: koeniginId },
    data: { honigertragBemerkung: textOderUndefined(formData.get("honigertragBemerkung")) ?? null },
  });
  await koeniginPfadeNeuLaden(koeniginId);
}

// Zoom unter 1 wäre "über den Bildrand hinaus", ein Fokuspunkt außerhalb
// 0-1 hätte keine Entsprechung mehr im Bild - beides wird sicherheitshalber
// auch serverseitig begrenzt, falls ein Wert nicht über den Editor kommt.
function begrenzterZoom(wert: number): number {
  return Math.max(1, Math.min(4, Number.isFinite(wert) ? wert : 1));
}

function begrenzterFokus(wert: number): number {
  return Math.max(0, Math.min(1, Number.isFinite(wert) ? wert : 0.5));
}

/// Liest Zoom und Fokuspunkt aus einem Formular - benannt nach dem Feld, zu
/// dem sie gehören ("foto" -> fotoZoom/fotoFokusX/fotoFokusY).
function ausschnittAusFormular(formData: FormData, praefix: "foto") {
  return {
    [`${praefix}Zoom`]: begrenzterZoom(Number(formData.get("zoom"))),
    [`${praefix}FokusX`]: begrenzterFokus(Number(formData.get("fokusX"))),
    [`${praefix}FokusY`]: begrenzterFokus(Number(formData.get("fokusY"))),
  };
}

/// Foto der Königin selbst - für den Kopf ihrer Seite.
export async function koeniginFotoAktualisieren(koeniginId: string, formData: FormData) {
  const bestehend = await prisma.koenigin.findUniqueOrThrow({
    where: { id: koeniginId },
    select: { fotoDateiname: true },
  });

  const datei = formData.get("foto");
  if (datei instanceof File && datei.size > 0 && istErlaubterBildtyp(datei.type)) {
    if (bestehend.fotoDateiname) await bildDateiLoeschen(bestehend.fotoDateiname);
    const gespeichert = await verkleinertesFotoSpeichern(datei);
    // Der Ausschnitt kommt beim Einfügen gleich mit - er wird im Dialog
    // gewählt, bevor gespeichert wird.
    await prisma.koenigin.update({
      where: { id: koeniginId },
      data: {
        fotoDateiname: gespeichert.dateiname,
        fotoOriginalDateiname: gespeichert.originalDateiname,
        fotoMimeType: gespeichert.mimeType,
        ...ausschnittAusFormular(formData, "foto"),
      },
    });
  } else if (formData.get("fotoEntfernen") === "ja" && bestehend.fotoDateiname) {
    await bildDateiLoeschen(bestehend.fotoDateiname);
    await prisma.koenigin.update({
      where: { id: koeniginId },
      data: {
        fotoDateiname: null,
        fotoOriginalDateiname: null,
        fotoMimeType: null,
        fotoZoom: 1,
        fotoFokusX: 0.5,
        fotoFokusY: 0.5,
      },
    });
  }

  await koeniginPfadeNeuLaden(koeniginId);
}

/// Ausschnitt später noch einmal nachjustieren, ohne das Foto zu tauschen.
export async function koeniginFotoAusschnittAktualisieren(
  koeniginId: string,
  ausschnitt: { zoom: number; fokusX: number; fokusY: number }
) {
  await prisma.koenigin.update({
    where: { id: koeniginId },
    data: {
      fotoZoom: begrenzterZoom(ausschnitt.zoom),
      fotoFokusX: begrenzterFokus(ausschnitt.fokusX),
      fotoFokusY: begrenzterFokus(ausschnitt.fokusY),
    },
  });
  await koeniginPfadeNeuLaden(koeniginId);
}

/// Einen bestehenden Lebenslauf-Eintrag korrigieren - erscheint erst nach
/// ausdrücklichem Antippen von "Bearbeiten" in der Liste (siehe
/// KoeniginEreignisListe), damit nicht aus Versehen etwas verändert wird.
/// Anders als beim Neuanlegen wird hier keine Königin aus einem Volk
/// entnommen oder woanders zugeordnet - das bleibt Sache der eigenen
/// Zusetzen-Aktion. Nur Status und die eigene Volk-Zuordnung der Königin
/// werden danach anhand des jetzt aktuellsten Eintrags neu bestimmt.
export async function koeniginEreignisAktualisieren(ereignisId: string, formData: FormData) {
  const bestehend = await prisma.koeniginEreignis.findUniqueOrThrow({
    where: { id: ereignisId },
    select: { koeniginId: true, fotoDateiname: true },
  });

  const art = enumWertOderNull(EREIGNIS_ARTEN, formData.get("art"));
  if (!art) throw new Error("Bitte die Art des Ereignisses wählen.");

  const datumRoh = textOderUndefined(formData.get("datum"));
  const datum = datumRoh ? new Date(datumRoh) : new Date();
  const brauchtVolk = EREIGNIS_MIT_VOLK.includes(art as EreignisArt);
  const volkId = brauchtVolk ? (textOderUndefined(formData.get("volkId")) ?? null) : null;
  if (brauchtVolk && !volkId) throw new Error("Für diese Art bitte ein Volk wählen.");
  const notiz = textOderUndefined(formData.get("notiz")) ?? null;

  let fotoFelder: {
    fotoDateiname?: string | null;
    fotoOriginalDateiname?: string | null;
    fotoMimeType?: string | null;
  } = {};
  const neueDatei = formData.get("foto");
  if (neueDatei instanceof File && neueDatei.size > 0 && istErlaubterBildtyp(neueDatei.type)) {
    if (bestehend.fotoDateiname) await bildDateiLoeschen(bestehend.fotoDateiname);
    const gespeichert = await verkleinertesFotoSpeichern(neueDatei);
    fotoFelder = {
      fotoDateiname: gespeichert.dateiname,
      fotoOriginalDateiname: gespeichert.originalDateiname,
      fotoMimeType: gespeichert.mimeType,
    };
  } else if (formData.get("fotoEntfernen") === "ja" && bestehend.fotoDateiname) {
    await bildDateiLoeschen(bestehend.fotoDateiname);
    fotoFelder = { fotoDateiname: null, fotoOriginalDateiname: null, fotoMimeType: null };
  }

  await prisma.koeniginEreignis.update({
    where: { id: ereignisId },
    data: { datum, art: art as EreignisArt, volkId, notiz, ...fotoFelder },
  });
  await koeniginVerkaufAbgleichen(ereignisId, formData);

  await koeniginStatusVolkNeuBerechnen(bestehend.koeniginId);
  await koeniginPfadeNeuLaden(bestehend.koeniginId);
}

export async function koeniginEreignisLoeschen(ereignisId: string) {
  const ereignis = await prisma.koeniginEreignis.findUniqueOrThrow({
    where: { id: ereignisId },
    select: { koeniginId: true, fotoDateiname: true },
  });
  await prisma.verkauf.deleteMany({ where: { koeniginEreignisId: ereignisId } });
  await prisma.koeniginEreignis.delete({ where: { id: ereignisId } });
  revalidatePath(VERKAEUFE_PFAD);
  if (ereignis.fotoDateiname) await bildDateiLoeschen(ereignis.fotoDateiname);
  await koeniginStatusVolkNeuBerechnen(ereignis.koeniginId);
  await koeniginPfadeNeuLaden(ereignis.koeniginId);
}

/// Umweiseln von der Volk-Seite aus: die bisherige Königin verlässt das Volk
/// (abgedrückt, Reserve, verkauft oder verschwunden), eine andere kommt
/// hinein - entweder eine vorhandene oder eine, die dabei neu angelegt wird.
/// Beide bekommen ihr Ereignis im Lebenslauf; der Verlauf des Volks liest
/// den Wechsel daraus (Ereignisse mit diesem Volk am selben Tag).
export async function koeniginUmweiseln(volkId: string, formData: FormData): Promise<FormularErgebnis> {
  const volk = await prisma.volk.findUnique({
    where: { id: volkId },
    select: { id: true, rasse: true, koeniginId: true, koenigin: { select: { kennung: true } } },
  });
  if (!volk) return { fehler: "Dieses Volk gibt es nicht mehr." };

  const datumRoh = textOderUndefined(formData.get("datum"));
  if (!datumRoh) return { fehler: "Bitte ein Datum angeben." };
  // Heute: mit Uhrzeit, damit der Wechsel im Verlauf nach einer Durchsicht
  // vom selben Morgen steht und nicht davor.
  const datum = datumRoh === heuteAlsInputWert() ? new Date() : new Date(datumRoh);
  if (Number.isNaN(datum.getTime())) return { fehler: "Bitte ein gültiges Datum eingeben." };

  const verbleib = enumWertOderNull(UMWEISEL_VERBLEIBE, formData.get("verbleib"));
  if (volk.koeniginId && !verbleib) {
    return { fehler: `Bitte wählen, was mit ${volk.koenigin!.kennung} passiert ist.` };
  }

  const notiz = textOderUndefined(formData.get("notiz")) ?? null;
  let neueId: string;

  if (formData.get("quelle") === "bestand") {
    const gewaehlt = textOderUndefined(formData.get("koeniginId"));
    if (!gewaehlt) return { fehler: "Bitte die neue Königin wählen." };
    if (gewaehlt === volk.koeniginId) return { fehler: "Diese Königin sitzt schon in diesem Volk." };
    const koenigin = await prisma.koenigin.findUnique({ where: { id: gewaehlt }, select: { status: true } });
    if (!koenigin) return { fehler: "Diese Königin gibt es nicht mehr." };
    if (!istVerfuegbar(koenigin.status as KoeniginStatus)) {
      return { fehler: "Diese Königin ist nicht mehr verfügbar." };
    }
    neueId = gewaehlt;
  } else {
    const jahrRoh = textOderUndefined(formData.get("koeniginJahr"));
    const jahrgang = jahrRoh ? Number.parseInt(jahrRoh, 10) : null;
    const herkunft = enumWertOderNull(HERKUENFTE, formData.get("herkunft")) ?? "UNBEKANNT";
    const koenigin = await prisma.koenigin.create({
      data: {
        kennung: await kennungVorschlagen(jahrgang ?? datum.getFullYear()),
        rasse: volk.rasse,
        jahrgang,
        zeichenFarbe: textOderUndefined(formData.get("koeniginZeichenFarbe")) ?? null,
        zeichenNummer: textOderUndefined(formData.get("koeniginZeichenNummer")) ?? null,
        herkunft,
        // Nachgeschaffen hat sie dieses Volk selbst.
        herkunftsVolkId: herkunft === "NACHSCHAFFUNG" ? volkId : null,
        status: "RESERVE",
      },
    });
    neueId = koenigin.id;
  }

  const neue = await prisma.koenigin.findUniqueOrThrow({ where: { id: neueId }, select: { kennung: true } });

  // Die alte zuerst hinaus - dann findet koeniginZusetzen ein leeres Volk und
  // legt kein zusätzliches "entnommen" an.
  if (volk.koeniginId && verbleib) {
    const wahl = UMWEISEL_VERBLEIB[verbleib];
    await prisma.volk.update({ where: { id: volkId }, data: { koeniginId: null } });
    await prisma.koenigin.update({
      where: { id: volk.koeniginId },
      data: { status: statusNachEreignis(wahl.art) ?? "RESERVE" },
    });
    const ereignis = await prisma.koeniginEreignis.create({
      data: {
        koeniginId: volk.koeniginId,
        datum,
        art: wahl.art,
        volkId,
        notiz: `${wahl.notiz}, ersetzt durch ${neue.kennung}`,
      },
    });
    if (wahl.art === "VERKAUFT") await koeniginVerkaufAbgleichen(ereignis.id);
    await koeniginPfadeNeuLaden(volk.koeniginId);
  }

  await koeniginZusetzen(neueId, volkId, datum, notiz ?? undefined);
  await koeniginPfadeNeuLaden(neueId);
}

// --- Belegstellen ------------------------------------------------------------

const BELEGSTELLEN_PFAD = "/einstellungen/belegstellen";

export async function belegstelleSpeichern(formData: FormData) {
  const belegstelleId = textOderUndefined(formData.get("belegstelleId"));
  const name = textOderUndefined(formData.get("name"));
  if (!name) return;

  const daten = {
    name,
    ort: textOderUndefined(formData.get("ort")) ?? null,
    rasse: textOderUndefined(formData.get("rasse")) ?? null,
    notizen: textOderUndefined(formData.get("notizen")) ?? null,
  };

  if (belegstelleId) {
    await prisma.belegstelle.update({ where: { id: belegstelleId }, data: daten });
  } else {
    // Beim Anlegen lassen sich die Drohnenvölker des ersten Jahres gleich
    // mit eintragen.
    const jahr = Number(formData.get("jahr"));
    const drohnenvoelker = textOderUndefined(formData.get("drohnenvoelker"));
    const mitJahr = drohnenvoelker && Number.isInteger(jahr) && jahr >= 1900 && jahr <= 2200;
    await prisma.belegstelle.create({
      data: { ...daten, ...(mitJahr ? { jahre: { create: { jahr, drohnenvoelker } } } : {}) },
    });
  }

  revalidatePath(BELEGSTELLEN_PFAD);
  revalidatePath(KOENIGINNEN_PFAD);
}

export async function belegstelleLoeschen(belegstelleId: string) {
  await prisma.belegstelle.delete({ where: { id: belegstelleId } });
  revalidatePath(BELEGSTELLEN_PFAD);
  revalidatePath(KOENIGINNEN_PFAD);
}

/// Drohnenvölker einer Belegstelle für ein Jahr eintragen oder ändern. Je
/// Belegstelle gibt es jedes Jahr nur einmal: Ein schon eingetragenes Jahr
/// wird überschrieben.
export async function belegstelleJahrSpeichern(formData: FormData) {
  const belegstelleId = textOderUndefined(formData.get("belegstelleId"));
  const jahr = Number(formData.get("jahr"));
  const drohnenvoelker = textOderUndefined(formData.get("drohnenvoelker"));
  if (!belegstelleId || !drohnenvoelker || !Number.isInteger(jahr) || jahr < 1900 || jahr > 2200) return;

  await prisma.belegstelleJahr.upsert({
    where: { belegstelleId_jahr: { belegstelleId, jahr } },
    create: { belegstelleId, jahr, drohnenvoelker },
    update: { drohnenvoelker },
  });

  revalidatePath(BELEGSTELLEN_PFAD);
  revalidatePath(KOENIGINNEN_PFAD, "layout");
}

export async function belegstelleJahrLoeschen(jahrId: string) {
  await prisma.belegstelleJahr.delete({ where: { id: jahrId } });
  revalidatePath(BELEGSTELLEN_PFAD);
  revalidatePath(KOENIGINNEN_PFAD, "layout");
}

// --- Zuchtplanung -------------------------------------------------------------
//
// Eine Zuchtserie ist einmal Umlarven aus einer Zuchtmutter. Ihre
// Arbeitsschritte (lib/zucht.ts) stehen als Maßnahmen am Zucht- bzw.
// Pflegevolk - so tauchen sie ohne Extraweg in der Maßnahmenliste, auf der
// Volkseite und im Kalender-Abo auf.

const ZUCHT_PFAD = "/koeniginnen/zucht";

function zuchtserieFelderAusFormular(formData: FormData) {
  const begattungsart = enumWertOderNull(BEGATTUNGSARTEN, formData.get("begattungsart")) ?? "UNBEKANNT";
  const umlarvRoh = textOderUndefined(formData.get("umlarvDatum"));
  return {
    bezeichnung: textOderUndefined(formData.get("bezeichnung")) ?? "Zuchtserie",
    pflegeVolkId: textOderUndefined(formData.get("pflegeVolkId")) ?? null,
    pflegeart: enumWertOderNull(PFLEGEARTEN, formData.get("pflegeart")) ?? "UNBEKANNT",
    brutschrank: formData.get("brutschrank") === "on",
    umlarvDatum: umlarvRoh ? new Date(umlarvRoh) : null,
    begattungsart,
    belegstelleId:
      begattungsart === "BELEGSTELLE" ? (textOderUndefined(formData.get("belegstelleId")) ?? null) : null,
    begattungsStandId:
      begattungsart === "STANDBEGATTUNG"
        ? (textOderUndefined(formData.get("begattungsStandId")) ?? null)
        : null,
    notizen: textOderUndefined(formData.get("notizen")) ?? null,
  };
}

/// Hält die Maßnahmen einer Serie mit ihrem Umlarvtermin in Einklang:
/// fehlende Schritte anlegen, offene verschieben (Termin, Volk, Text).
/// Erledigte bleiben, wie sie sind. Ohne Termin oder bei abgeschlossener
/// Serie verschwinden die offenen Schritte wieder.
async function zuchtMassnahmenAbgleichen(zuchtserieId: string) {
  const serie = await prisma.zuchtserie.findUniqueOrThrow({
    where: { id: zuchtserieId },
    select: {
      bezeichnung: true,
      umlarvDatum: true,
      zuchtVolkId: true,
      pflegeVolkId: true,
      pflegeart: true,
      brutschrank: true,
      abgeschlossen: true,
      massnahmen: { select: { id: true, volkId: true, zuchtSchritt: true, erledigt: true } },
    },
  });

  const betroffeneVoelker = new Set(serie.massnahmen.map((massnahme) => massnahme.volkId));
  const offene = serie.massnahmen.filter((massnahme) => !massnahme.erledigt);
  const schritte = zuchtSchritte(serie.pflegeart, serie.brutschrank);

  const zuchtVolkId = serie.zuchtVolkId ?? serie.pflegeVolkId;
  const pflegeVolkId = serie.pflegeVolkId ?? serie.zuchtVolkId;

  if (!serie.umlarvDatum || serie.abgeschlossen || !zuchtVolkId || !pflegeVolkId) {
    await prisma.massnahme.deleteMany({ where: { id: { in: offene.map((massnahme) => massnahme.id) } } });
  } else {
    // Offene Schritte, die es bei der (geänderten) Pflegeart nicht gibt,
    // fallen weg - z.B. das Umhängen in den Finisher.
    const ueberzaehlige = offene.filter(
      (massnahme) => !schritte.some((schritt) => schritt.schluessel === massnahme.zuchtSchritt)
    );
    await prisma.massnahme.deleteMany({ where: { id: { in: ueberzaehlige.map((massnahme) => massnahme.id) } } });
    for (const schritt of schritte) {
      const volkId = schritt.volk === "zucht" ? zuchtVolkId : pflegeVolkId;
      betroffeneVoelker.add(volkId);
      const daten = {
        volkId,
        text: zuchtMassnahmeText(serie.bezeichnung, schritt),
        faelligAm: schrittDatum(serie.umlarvDatum, schritt.tag),
      };
      const vorhandene = serie.massnahmen.find((massnahme) => massnahme.zuchtSchritt === schritt.schluessel);
      if (!vorhandene) {
        await prisma.massnahme.create({
          data: { ...daten, zuchtserieId, zuchtSchritt: schritt.schluessel, imKalender: schritt.kalender ?? false },
        });
      } else if (!vorhandene.erledigt) {
        await prisma.massnahme.update({ where: { id: vorhandene.id }, data: daten });
      }
    }
  }

  await zuchtPfadeNeuLaden(zuchtserieId, [...betroffeneVoelker]);
}

async function zuchtPfadeNeuLaden(zuchtserieId: string, volkIds: string[] = []) {
  revalidatePath(ZUCHT_PFAD);
  revalidatePath(`${ZUCHT_PFAD}/${zuchtserieId}`);
  revalidatePath("/massnahmen");
  const voelker = await prisma.volk.findMany({
    where: { id: { in: volkIds } },
    select: { id: true, bienenstandId: true },
  });
  for (const volk of voelker) {
    revalidatePath(`/voelker/${volk.id}`);
    revalidatePath(`/bienenstaende/${volk.bienenstandId}`);
  }
}

/// Die gewählte Zuchtmutter samt dem Volk, in dem sie gerade sitzt - aus
/// diesem Volk wird nachgezogen.
async function zuchtmutterAusFormular(formData: FormData) {
  const mutterKoeniginId = textOderUndefined(formData.get("mutterKoeniginId"));
  if (!mutterKoeniginId) return null;
  const koenigin = await prisma.koenigin.findUniqueOrThrow({
    where: { id: mutterKoeniginId },
    select: { id: true, volk: { select: { id: true } } },
  });
  return { mutterKoeniginId: koenigin.id, zuchtVolkId: koenigin.volk?.id ?? null };
}

export async function zuchtserieAnlegen(formData: FormData) {
  const felder = zuchtserieFelderAusFormular(formData);
  const mutter = await zuchtmutterAusFormular(formData);
  if (!mutter) throw new Error("Bitte eine Zuchtmutter auswählen.");

  const serie = await prisma.zuchtserie.create({ data: { ...felder, ...mutter } });
  await zuchtMassnahmenAbgleichen(serie.id);
  redirect(`${ZUCHT_PFAD}/${serie.id}`);
}

export async function zuchtserieAktualisieren(zuchtserieId: string, formData: FormData) {
  const felder = zuchtserieFelderAusFormular(formData);
  const bisher = await prisma.zuchtserie.findUniqueOrThrow({
    where: { id: zuchtserieId },
    select: { mutterKoeniginId: true },
  });

  // Zuchtvolk nur neu bestimmen, wenn eine andere Mutter gewählt wurde -
  // sonst bliebe es stehen, auch wenn die Königin inzwischen umgezogen ist.
  const mutterId = textOderUndefined(formData.get("mutterKoeniginId")) ?? null;
  const mutter = mutterId !== bisher.mutterKoeniginId ? await zuchtmutterAusFormular(formData) : {};

  await prisma.zuchtserie.update({ where: { id: zuchtserieId }, data: { ...felder, ...mutter } });
  await zuchtMassnahmenAbgleichen(zuchtserieId);
  redirect(`${ZUCHT_PFAD}/${zuchtserieId}`);
}

export async function zuchtserieZahlenSpeichern(zuchtserieId: string, formData: FormData) {
  const ganzzahl = (feld: string) => {
    const zahl = zahlOderNull(formData.get(feld));
    return zahl === null ? null : Math.max(0, Math.round(zahl));
  };
  await prisma.zuchtserie.update({
    where: { id: zuchtserieId },
    data: {
      anzahlUmgelarvt: ganzzahl("anzahlUmgelarvt"),
      anzahlAngenommen: ganzzahl("anzahlAngenommen"),
      anzahlVerdeckelt: ganzzahl("anzahlVerdeckelt"),
      anzahlGeschluepft: ganzzahl("anzahlGeschluepft"),
    },
  });
  await zuchtPfadeNeuLaden(zuchtserieId);
}

export async function zuchtserieAbschliessenUmschalten(zuchtserieId: string) {
  const serie = await prisma.zuchtserie.findUniqueOrThrow({
    where: { id: zuchtserieId },
    select: { abgeschlossen: true },
  });
  await prisma.zuchtserie.update({
    where: { id: zuchtserieId },
    data: { abgeschlossen: !serie.abgeschlossen },
  });
  await zuchtMassnahmenAbgleichen(zuchtserieId);
}

export async function zuchtserieLoeschen(zuchtserieId: string) {
  const serie = await prisma.zuchtserie.findUniqueOrThrow({
    where: { id: zuchtserieId },
    select: { massnahmen: { select: { volkId: true } } },
  });
  // Maßnahmen gehen mit (Cascade), die nachgezogenen Königinnen bleiben -
  // samt Mutter, nur der Verweis auf die Serie fällt weg.
  await prisma.zuchtserie.delete({ where: { id: zuchtserieId } });
  await zuchtPfadeNeuLaden(
    zuchtserieId,
    serie.massnahmen.map((massnahme) => massnahme.volkId)
  );
  revalidatePath(KOENIGINNEN_PFAD);
  redirect(ZUCHT_PFAD);
}

export async function zuchtSchrittUmschalten(zuchtserieId: string, massnahmeId: string) {
  const massnahme = await prisma.massnahme.findUniqueOrThrow({
    where: { id: massnahmeId },
    select: { erledigt: true, volkId: true },
  });
  const erledigt = !massnahme.erledigt;
  await prisma.massnahme.update({
    where: { id: massnahmeId },
    data: { erledigt, erledigtAm: erledigt ? new Date() : null },
  });
  await zuchtPfadeNeuLaden(zuchtserieId, [massnahme.volkId]);
}

/// Schritt ins Kalender-Abo aufnehmen oder herausnehmen.
export async function massnahmeKalenderUmschalten(massnahmeId: string) {
  const massnahme = await prisma.massnahme.findUniqueOrThrow({
    where: { id: massnahmeId },
    select: { imKalender: true, volkId: true, zuchtserieId: true },
  });
  await prisma.massnahme.update({
    where: { id: massnahmeId },
    data: { imKalender: !massnahme.imKalender },
  });
  if (massnahme.zuchtserieId) await zuchtPfadeNeuLaden(massnahme.zuchtserieId, [massnahme.volkId]);
  else revalidatePath("/massnahmen");
}

/// Die geschlüpften Königinnen einer Serie in einem Rutsch anlegen: Mutter,
/// Herkunft, Rasse, Jahrgang, Schlupftag und geplante Begattung kommen aus
/// der Serie, die Kennungen werden fortlaufend vergeben. So wächst mit jeder
/// Serie der Stammbaum, ohne dass man jede Königin einzeln eintippt.
export async function zuchtKoeniginnenAnlegen(zuchtserieId: string, formData: FormData) {
  const anzahl = Math.min(50, Math.max(0, Math.round(zahlOderNull(formData.get("anzahl")) ?? 0)));
  if (anzahl === 0) return;

  const serie = await prisma.zuchtserie.findUniqueOrThrow({
    where: { id: zuchtserieId },
    select: {
      umlarvDatum: true,
      mutterKoeniginId: true,
      mutterKoenigin: { select: { rasse: true } },
      zuchtVolk: { select: { rasse: true } },
      begattungsart: true,
      belegstelleId: true,
      begattungsStandId: true,
    },
  });

  const schlupfRoh = textOderUndefined(formData.get("schlupfDatum"));
  const schlupfDatum = schlupfRoh
    ? new Date(schlupfRoh)
    : serie.umlarvDatum
      ? schrittDatum(serie.umlarvDatum, ZUCHT_SCHLUPF_TAG)
      : null;
  const jahrgang = (schlupfDatum ?? new Date()).getFullYear();

  for (let nummer = 0; nummer < anzahl; nummer++) {
    const koenigin = await prisma.koenigin.create({
      data: {
        kennung: await kennungVorschlagen(jahrgang),
        rasse: serie.mutterKoenigin?.rasse ?? serie.zuchtVolk?.rasse ?? null,
        jahrgang,
        schlupfDatum,
        herkunft: "EIGENE_NACHZUCHT",
        begattungsart: serie.begattungsart,
        belegstelleId: serie.belegstelleId,
        begattungsStandId: serie.begattungsStandId,
        mutterKoeniginId: serie.mutterKoeniginId,
        zuchtserieId,
        status: "RESERVE",
      },
    });
    if (schlupfDatum) {
      await prisma.koeniginEreignis.create({
        data: { koeniginId: koenigin.id, datum: schlupfDatum, art: "GESCHLUEPFT" },
      });
    }
  }

  await prisma.zuchtserie.update({
    where: { id: zuchtserieId },
    data: { anzahlGeschluepft: await prisma.koenigin.count({ where: { zuchtserieId } }) },
  });

  revalidatePath(KOENIGINNEN_PFAD);
  if (serie.mutterKoeniginId) revalidatePath(`${KOENIGINNEN_PFAD}/${serie.mutterKoeniginId}`);
  await zuchtPfadeNeuLaden(zuchtserieId);
}

// --- Stockkarten-Eintrag ----------------------------------------------------

// Gegebene (+) oder entnommene (−) Waben einer Art: ganze Zahl, höchstens
// WABEN_AENDERUNG_MAX in jede Richtung, 0 = keine Angabe.
function wabenAenderungOderNull(wert: FormDataEntryValue | null): number | null {
  const zahl = zahlOderNull(wert);
  if (zahl === null) return null;
  const gerundet = Math.max(-WABEN_AENDERUNG_MAX, Math.min(WABEN_AENDERUNG_MAX, Math.round(zahl)));
  return gerundet === 0 ? null : gerundet;
}

// Werden mehr Waben entnommen, als laut Wabenbestand im Volk sind? Dann
// eine Meldung statt Speichern. Völker ohne erfassten Bestand werden nicht
// geprüft. Eine schon angekommene Sendung (Warteschlange) gilt als geprüft.
async function wabenEntnahmePruefen(
  volkIds: string[],
  formData: FormData,
  ohneEintragId?: string
): Promise<{ fehler: string } | null> {
  const summe = aenderungSumme(
    Object.fromEntries(
      WABEN_AENDERUNGS_ARTEN.map((art) => [art.feld, wabenAenderungOderNull(formData.get(art.feld))])
    )
  );
  if (summe >= 0) return null;
  const sendungId = formData.get("sendungId")?.toString() || null;
  const zuPruefen = sendungId
    ? (
        await prisma.volk.findMany({
          where: { id: { in: volkIds }, eintraege: { none: { sendungId } } },
          select: { id: true },
        })
      ).map((volk) => volk.id)
    : volkIds;
  const bestaende = await wabenbestaendeLaden(zuPruefen, ohneEintragId);
  const zuWenig = [...bestaende].filter(([, bestand]) => bestand !== null && bestand + summe < 0);
  if (zuWenig.length === 0) return null;
  const namen = await prisma.volk.findMany({
    where: { id: { in: zuWenig.map(([id]) => id) } },
    select: { id: true, name: true },
  });
  const text = zuWenig
    .map(([id, bestand]) => `${namen.find((volk) => volk.id === id)?.name ?? "Volk"} hat ${bestand}`)
    .join(", ");
  return {
    fehler: `Du entnimmst ${-summe} Waben, aber ${text}. Bitte die Waben prüfen oder den Bestand beim Volk korrigieren.`,
  };
}

// Gemeinsam für Anlegen und Aktualisieren: liest alle Stockkarten-Felder aus
// dem Formular. `null` statt `undefined` bei leeren Feldern funktioniert für
// beide Fälle gleich gut (bei nullable Feldern setzt Prisma auch beim
// Anlegen explizites `null`, nicht nur `undefined`, korrekt auf NULL).
function stockkartenEintragFelderAusFormular(formData: FormData) {
  return {
    koeniginGesehen: checkboxJaNein(formData.get("koeniginGesehen")),
    stifteGesehen: checkboxJaNein(formData.get("stifteGesehen")),
    larvenGesehen: checkboxJaNein(formData.get("larvenGesehen")),
    verdeckelteBrutGesehen: checkboxJaNein(formData.get("verdeckelteBrutGesehen")),
    weiselzellenGesehen: checkboxJaNein(formData.get("weiselzellenGesehen")),
    drohnenbruetig: checkboxJaNein(formData.get("drohnenbruetig")),
    volksstaerke: zahlOderNull(formData.get("volksstaerke")),
    bebrueteteWaben: zahlOderNull(formData.get("bebrueteteWaben")),
    leerwaben: wabenAenderungOderNull(formData.get("leerwaben")),
    mittelwaende: wabenAenderungOderNull(formData.get("mittelwaende")),
    brutwaben: wabenAenderungOderNull(formData.get("brutwaben")),
    futterwaben: wabenAenderungOderNull(formData.get("futterwaben")),
    baurahmenDrohnenrahmen: wabenAenderungOderNull(formData.get("baurahmenDrohnenrahmen")),
    varroaZaehlweise: enumWertOderNull(VARROA_ZAEHLWEISEN, formData.get("varroaZaehlweise")),
    varroaAnzahl: zahlOderNull(formData.get("varroaAnzahl")),
    varroaGemuellTage: zahlOderNull(formData.get("varroaGemuellTage")),
    varroaBienenprobeGramm: zahlOderNull(formData.get("varroaBienenprobeGramm")),
    drohnenbrutGeschnitten: checkboxJaNein(formData.get("drohnenbrutGeschnitten")),
    biotechnischeMassnahmen: textOderUndefined(formData.get("biotechnischeMassnahmen")) ?? null,
    volksstaerkeEinschaetzung: noteOderNull(formData.get("volksstaerkeEinschaetzung")),
    futtermengeEinschaetzung: noteOderNull(formData.get("futtermengeEinschaetzung")),
    sanftmut: noteOderNull(formData.get("sanftmut")),
    schwarmtrieb: noteOderNull(formData.get("schwarmtrieb")),
    wabensitz: noteOderNull(formData.get("wabensitz")),
    legeleistung: noteOderNull(formData.get("legeleistung")),
    gesamteindruck: noteOderNull(formData.get("gesamteindruck")),
    bienenAngeflogen: checkboxJaNein(formData.get("bienenAngeflogen")),
    abgeschwaermt: checkboxJaNein(formData.get("abgeschwaermt")),
    honigart: textOderUndefined(formData.get("honigart")) ?? null,
    fuetterungArt: enumWertOderNull(FUETTERUNGS_ARTEN, formData.get("fuetterungArt")),
    fuetterungMengeKg: zahlOderNull(formData.get("fuetterungMengeKg")),
    gewichtKg: gewichtOderNull(formData.get("gewichtKg")),
    wiegemethode: enumWertOderNull(WIEGEMETHODEN, formData.get("wiegemethode")),
    notizen: textOderUndefined(formData.get("notizen")) ?? null,
  };
}

// Beim Anlegen eines neuen Eintrags reicht ein einfaches Textfeld (eine
// Maßnahme pro Zeile) - Termin setzen und einzeln abhaken kann man danach
// auf der Bearbeiten-Seite des Eintrags.
async function neueMassnahmenAusText(volkId: string, stockkartenEintragId: string, formData: FormData) {
  const text = (formData.get("massnahmenText") ?? "").toString();
  const zeilen = text
    .split("\n")
    .map((zeile) => zeile.trim())
    .filter((zeile) => zeile !== "");

  if (zeilen.length === 0) return;

  await prisma.massnahme.createManyAndReturn({
    data: zeilen.map((zeile) => ({ volkId, stockkartenEintragId, text: zeile })),
  });
}

// Maßnahme aus dem Hinweis-Popup beim Speichern (auffällige Bewertung
// erkannt, Nutzer hat sich für "Ja, Maßnahme anlegen" entschieden).
async function popupMassnahmeSpeichern(volkId: string, stockkartenEintragId: string, formData: FormData) {
  const text = textOderUndefined(formData.get("massnahmePopupText"));
  if (!text) return;

  const faelligAmRoh = textOderUndefined(formData.get("massnahmePopupFaelligAm"));

  await prisma.massnahme.create({
    data: {
      volkId,
      stockkartenEintragId,
      text,
      faelligAm: faelligAmRoh ? new Date(faelligAmRoh) : null,
    },
  });
}

// --- Honigraum: aufsetzen und ernten ---------------------------------------
//
// Das Formular schickt nur, WAS bewegt wurde: welche Zargen aufgesetzt, welche
// aufgesetzten Honigräume abgenommen, dazu frei erfasste Zargen und Waben und
// der Korrekturfaktor. Bezeichnungen und Gewichte holt der Server selbst aus
// den Stammdaten - so kann kein alter oder verbogener Formularwert eine
// falsche Erntemenge in die Datenbank schreiben.

type ErnteZeile = { istZarge: boolean; groesseId: string; anzahl: number };

/// Eine Ernte-Zeile, wie sie in der Datenbank landet - mit Bezeichnung und
/// Gewicht als Kopie, damit sie später nachvollziehbar bleibt.
type ErnteAnteilDaten = {
  istZarge: boolean;
  zargeId: string | null;
  wabenmassId: string | null;
  bezeichnung: string;
  anzahl: number;
  gewichtProEinheitKg: number;
};

function jsonZeilenLesen(wert: FormDataEntryValue | null): Record<string, unknown>[] {
  const text = (wert ?? "").toString().trim();
  if (text === "") return [];

  let gelesen: unknown;
  try {
    gelesen = JSON.parse(text);
  } catch {
    return [];
  }
  if (!Array.isArray(gelesen)) return [];

  return gelesen.filter(
    (eintrag): eintrag is Record<string, unknown> =>
      typeof eintrag === "object" && eintrag !== null
  );
}

function ernteZeilenLesen(wert: FormDataEntryValue | null): ErnteZeile[] {
  return jsonZeilenLesen(wert).flatMap((zeile) => {
    const groesseId = typeof zeile.groesseId === "string" ? zeile.groesseId : "";
    const anzahl = Number(zeile.anzahl);
    if (groesseId === "" || !Number.isFinite(anzahl) || anzahl <= 0) return [];
    return [{ istZarge: zeile.istZarge === true, groesseId, anzahl: Math.round(anzahl) }];
  });
}

const WABENBESCHAFFENHEITS_WERTE = ["MITTELWAENDE", "AUSGEBAUT", "GEMISCHT"] as const;

type AufsatzZeileDaten = {
  zargeId: string;
  anzahl: number;
  wabenbeschaffenheit: (typeof WABENBESCHAFFENHEITS_WERTE)[number] | null;
};

function aufsatzZeilenLesen(wert: FormDataEntryValue | null): AufsatzZeileDaten[] {
  return jsonZeilenLesen(wert).flatMap((zeile) => {
    const zargeId = typeof zeile.zargeId === "string" ? zeile.zargeId : "";
    const anzahl = Number(zeile.anzahl);
    if (zargeId === "" || !Number.isFinite(anzahl) || anzahl <= 0) return [];
    const beschaffenheit = (WABENBESCHAFFENHEITS_WERTE as readonly string[]).includes(
      String(zeile.wabenbeschaffenheit)
    )
      ? (zeile.wabenbeschaffenheit as AufsatzZeileDaten["wabenbeschaffenheit"])
      : null;
    return [{ zargeId, anzahl: Math.min(20, Math.round(anzahl)), wabenbeschaffenheit: beschaffenheit }];
  });
}

/// Liest ids aus einem einfachen JSON-Array von Strings.
function idsLesen(wert: FormDataEntryValue | null): string[] {
  const text = (wert ?? "").toString().trim();
  if (text === "") return [];
  try {
    const gelesen = JSON.parse(text);
    return Array.isArray(gelesen) ? gelesen.filter((id): id is string => typeof id === "string") : [];
  } catch {
    return [];
  }
}

/// Zarge mit Systemnamen - für die Klartext-Bezeichnung.
async function zargenMitSystem(ids: string[]) {
  if (ids.length === 0) return [];
  const zargen = await prisma.zarge.findMany({
    where: { id: { in: ids } },
    select: {
      id: true,
      name: true,
      wabenAnzahl: true,
      honigProZargeKg: true,
      wabenmass: { select: { beutensystem: { select: { name: true } } } },
    },
  });
  return zargen.map((zarge) => ({
    id: zarge.id,
    honigProZargeKg: zarge.honigProZargeKg,
    bezeichnung: zargeBezeichnung({
      systemName: zarge.wabenmass.beutensystem.name,
      name: zarge.name,
      wabenAnzahl: zarge.wabenAnzahl,
    }),
  }));
}

/// Honigräume, die bei dieser Durchsicht aufgesetzt wurden. Je Zarge eine
/// eigene Zeile, damit sie später einzeln abgenommen werden können.
async function neueAufsaetzeSpeichern(
  volkId: string,
  eintragId: string,
  datum: Date,
  formData: FormData
) {
  const zeilen = aufsatzZeilenLesen(formData.get("honigraumAufgesetzt"));
  if (zeilen.length === 0) return;

  const zargen = await zargenMitSystem(zeilen.map((zeile) => zeile.zargeId));

  const daten = zeilen.flatMap((zeile) => {
    const zarge = zargen.find((eintrag) => eintrag.id === zeile.zargeId);
    if (!zarge) return [];
    return Array.from({ length: zeile.anzahl }, () => ({
      volkId,
      zargeId: zarge.id,
      bezeichnung: zarge.bezeichnung,
      honigProZargeKg: zarge.honigProZargeKg,
      wabenbeschaffenheit: zeile.wabenbeschaffenheit,
      aufgesetztAm: datum,
      aufgesetztEintragId: eintragId,
    }));
  });

  if (daten.length > 0) await prisma.honigraumaufsatz.createManyAndReturn({ data: daten });
}

/// Abgenommene Honigräume als geerntet markieren - sie verschwinden damit aus
/// der Liste dessen, was noch auf dem Volk sitzt.
async function geernteteAufsaetzeMarkieren(eintragId: string, datum: Date, aufsatzIds: string[]) {
  if (aufsatzIds.length === 0) return;
  await prisma.honigraumaufsatz.updateMany({
    where: { id: { in: aufsatzIds } },
    data: { geerntetAm: datum, geerntetEintragId: eintragId },
  });
}

async function honigernteAusFormular(formData: FormData, volkId: string, eintragId: string | null) {
  const geerntet = checkboxJaNein(formData.get("honigGeerntet"));

  if (!geerntet) {
    return {
      felder: { honigGeerntet: false, honigSchaetzungKg: null, honigertragKg: null },
      anteile: [] as ErnteAnteilDaten[],
      geernteteAufsatzIds: [] as string[],
    };
  }

  // 1. Aufgesetzte Honigräume, die jetzt abgenommen werden.
  const gewaehlteAufsatzIds = idsLesen(formData.get("honigGeernteteAufsaetze"));
  const aufsaetze =
    gewaehlteAufsatzIds.length > 0
      ? await prisma.honigraumaufsatz.findMany({
          where: {
            id: { in: gewaehlteAufsatzIds },
            volkId,
            // Nur, was noch oben sitzt - oder was dieser Eintrag beim letzten
            // Speichern selbst geerntet hat (Bearbeiten-Fall).
            OR: [{ geerntetAm: null }, ...(eintragId ? [{ geerntetEintragId: eintragId }] : [])],
          },
          select: { id: true, bezeichnung: true, honigProZargeKg: true, zargeId: true },
        })
      : [];

  // 2. Frei erfasste Zargen und Waben (z.B. Honigräume, deren Aufsetzen nicht
  //    dokumentiert wurde).
  const zeilen = ernteZeilenLesen(formData.get("honigAnteile"));
  const zargenIds = zeilen.filter((zeile) => zeile.istZarge).map((zeile) => zeile.groesseId);
  const wabenIds = zeilen.filter((zeile) => !zeile.istZarge).map((zeile) => zeile.groesseId);

  const [zargen, wabenmasse] = await Promise.all([
    zargenMitSystem(zargenIds),
    wabenIds.length > 0
      ? prisma.wabenmass.findMany({
          where: { id: { in: wabenIds } },
          select: {
            id: true,
            name: true,
            honigProWabeKg: true,
            beutensystem: { select: { name: true } },
          },
        })
      : Promise.resolve([]),
  ]);

  const anteile: ErnteAnteilDaten[] = [
    ...aufsaetze.map((aufsatz) => ({
      istZarge: true,
      zargeId: aufsatz.zargeId,
      wabenmassId: null,
      bezeichnung: aufsatz.bezeichnung,
      anzahl: 1,
      gewichtProEinheitKg: aufsatz.honigProZargeKg,
    })),
    ...zeilen.flatMap<ErnteAnteilDaten>((zeile) => {
      if (zeile.istZarge) {
        const zarge = zargen.find((eintrag) => eintrag.id === zeile.groesseId);
        if (!zarge) return [];
        return [
          {
            istZarge: true,
            zargeId: zarge.id,
            wabenmassId: null,
            bezeichnung: zarge.bezeichnung,
            anzahl: zeile.anzahl,
            gewichtProEinheitKg: zarge.honigProZargeKg,
          },
        ];
      }
      const wabenmass = wabenmasse.find((eintrag) => eintrag.id === zeile.groesseId);
      if (!wabenmass) return [];
      return [
        {
          istZarge: false,
          zargeId: null,
          wabenmassId: wabenmass.id,
          bezeichnung: `${wabenmass.beutensystem.name} ${wabenmass.name}`,
          anzahl: zeile.anzahl,
          gewichtProEinheitKg: wabenmass.honigProWabeKg,
        },
      ];
    }),
  ];

  // Ohne erfasste Zargen/Waben gibt es nichts zu schätzen - dann gilt die
  // von Hand eingetragene Menge.
  if (anteile.length === 0) {
    return {
      felder: {
        honigGeerntet: true,
        honigSchaetzungKg: null,
        honigertragKg: zahlOderNull(formData.get("honigertragKg")),
      },
      anteile,
      geernteteAufsatzIds: [] as string[],
    };
  }

  const schaetzung = runden(
    anteile.reduce((summe, anteil) => summe + anteil.gewichtProEinheitKg * anteil.anzahl, 0)
  );
  const prozentRoh = zahlOderNull(formData.get("honigKorrekturProzent")) ?? 100;
  const prozent = Math.min(KORREKTUR_MAX, Math.max(KORREKTUR_MIN, prozentRoh));

  return {
    felder: {
      honigGeerntet: true,
      honigSchaetzungKg: schaetzung,
      honigertragKg: runden((schaetzung * prozent) / 100),
    },
    anteile,
    geernteteAufsatzIds: aufsaetze.map((aufsatz) => aufsatz.id),
  };
}

// Beurteilung aus einer Durchsicht zur Königin übernehmen - auf Nachfrage
// beim Speichern der Stockkarte. Landet als Station im Lebenslauf, mit dem
// Datum der Durchsicht. Die Zahlen bleiben am Stockkarten-Eintrag, das
// Ereignis verweist nur darauf: so gibt es sie nur einmal, und ein späterer
// Vergleich der Königinnen kann sie von dort holen.
async function bewertungZurKoeniginUebernehmen(eintragId: string, volkId: string, formData: FormData) {
  // Beim Bearbeiten zuerst die frühere Übernahme dieses Eintrags lösen,
  // sonst stünde dieselbe Durchsicht mehrfach im Lebenslauf.
  await prisma.koeniginEreignis.deleteMany({ where: { stockkartenEintragId: eintragId } });

  if (formData.get("bewertungZuKoenigin") !== "ja") return;

  const volk = await prisma.volk.findUniqueOrThrow({
    where: { id: volkId },
    select: { koeniginId: true },
  });
  if (!volk.koeniginId) return;

  const eintrag = await prisma.stockkartenEintrag.findUniqueOrThrow({
    where: { id: eintragId },
    select: {
      datum: true,
      volksstaerkeEinschaetzung: true,
      futtermengeEinschaetzung: true,
      sanftmut: true,
      schwarmtrieb: true,
      wabensitz: true,
      legeleistung: true,
      gesamteindruck: true,
      honigGeerntet: true,
      honigertragKg: true,
    },
  });

  // Nur die Kriterien, die auch tatsächlich in ihre Bewertung eingehen -
  // Futtermenge und Gesamteindruck stehen zwar weiter auf der Stockkarte,
  // aber nicht mehr in dieser Zusammenfassung.
  const teile = KOENIGINS_BEURTEILUNGS_KRITERIEN.flatMap((kriterium) => {
    const wert = eintrag[kriterium.feld];
    if (typeof wert !== "number") return [];
    return [`${kriterium.label} ${noteText(wert)} (${stufeText(kriterium, wert)})`];
  });
  if (eintrag.honigGeerntet && eintrag.honigertragKg) {
    teile.push(`Honig ${eintrag.honigertragKg} kg`);
  }
  if (teile.length === 0) return;

  await prisma.koeniginEreignis.create({
    data: {
      koeniginId: volk.koeniginId,
      datum: eintrag.datum,
      art: "BEWERTUNG",
      volkId,
      stockkartenEintragId: eintragId,
      notiz: teile.join(" · "),
    },
  });

  await koeniginPfadeNeuLaden(volk.koeniginId);
}

/// Ein einzelnes Beurteilungskriterium einer Durchsicht aus der
/// Königin-Bewertung heraus- oder wieder hineinnehmen (z.B. wenn ein
/// unvorhergesehenes Ereignis - Gewitter, gestörte Durchsicht - nur diesen
/// einen Wert verfälscht hat). Die Stockkarte selbst bleibt unverändert, nur
/// der Schnitt bei der Königin lässt den Wert außen vor.
/// Stern für eine herausragende Königin setzen oder wegnehmen. Hängt an
/// nichts anderem - die Bewertung bleibt davon unberührt.
export async function koeniginSternUmschalten(koeniginId: string) {
  const koenigin = await prisma.koenigin.findUniqueOrThrow({
    where: { id: koeniginId },
    select: { stern: true },
  });
  await prisma.koenigin.update({ where: { id: koeniginId }, data: { stern: !koenigin.stern } });

  await koeniginPfadeNeuLaden(koeniginId);
  // Der Stern steht auch in Stammbaum, Zuchtplanung und Zuchtkarten-Auswahl
  // unter /koeniginnen/... - "layout" lädt alle Seiten darunter neu.
  revalidatePath(KOENIGINNEN_PFAD, "layout");
}

export async function kriteriumAusschlussUmschalten(eintragId: string, feld: string) {
  if (!KOENIGINS_BEURTEILUNGS_KRITERIEN.some((kriterium) => kriterium.feld === feld)) {
    throw new Error("Unbekanntes Beurteilungskriterium.");
  }

  const eintrag = await prisma.stockkartenEintrag.findUniqueOrThrow({
    where: { id: eintragId },
    select: { ausschlussKriterien: true },
  });

  const ausgeschlossen = eintrag.ausschlussKriterien.includes(feld);
  await prisma.stockkartenEintrag.update({
    where: { id: eintragId },
    data: {
      ausschlussKriterien: ausgeschlossen
        ? eintrag.ausschlussKriterien.filter((vorhandenesFeld) => vorhandenesFeld !== feld)
        : [...eintrag.ausschlussKriterien, feld],
    },
  });

  await stockkartenEintragPfadeNeuLaden(eintragId);
  const ereignis = await prisma.koeniginEreignis.findFirst({
    where: { stockkartenEintragId: eintragId },
    select: { koeniginId: true },
  });
  if (ereignis) await koeniginPfadeNeuLaden(ereignis.koeniginId);
}

// Ein neuer Stockkarten-Eintrag samt allem, was am Formular hängt (Fotos,
// Maßnahmen, Honigräume, Rückfragen aus dem Popup) - gemeinsam genutzt vom
// Eintrag auf der Volk-Seite und vom Sammel-Eintrag auf der Stand-Seite.
//
// Bringt das Formular eine sendungId mit (Warteschlange auf dem Handy, siehe
// lib/warteschlange.ts) und gibt es dazu schon einen Eintrag, ist er schon
// einmal angekommen - dann wird nichts doppelt gespeichert.
async function stockkartenEintragSpeichern(volkId: string, formData: FormData) {
  const datumRoh = formData.get("datum")?.toString();
  const datum = datumRoh ? new Date(datumRoh) : new Date();
  const sendungId = formData.get("sendungId")?.toString() || null;
  if (sendungId && (await prisma.stockkartenEintrag.count({ where: { volkId, sendungId } })) > 0) return;

  const honigernte = await honigernteAusFormular(formData, volkId, null);
  const fuettererAktion = await fuettererAktionAusFormular(formData, volkId, datum);

  let eintrag;
  try {
    eintrag = await prisma.stockkartenEintrag.create({
      data: {
        volkId,
        datum,
        sendungId,
        ...stockkartenEintragFelderAusFormular(formData),
        fuettererAktion,
        ...honigernte.felder,
        honigernteAnteile: { create: honigernte.anteile },
      },
    });
  } catch (fehler) {
    // Dieselbe Sendung kam gleichzeitig zweimal an (zwei offene Tabs): die
    // andere Anfrage hat den Eintrag gerade angelegt.
    if (sendungId && (fehler as { code?: string }).code === "P2002") return;
    throw fehler;
  }

  await neueAufsaetzeSpeichern(volkId, eintrag.id, datum, formData);
  await geernteteAufsaetzeMarkieren(eintrag.id, datum, honigernte.geernteteAufsatzIds);
  await neueBilderSpeichern(eintrag.id, formData);
  await neueMassnahmenAusText(volkId, eintrag.id, formData);
  await popupMassnahmeSpeichern(volkId, eintrag.id, formData);
  await bewertungZurKoeniginUebernehmen(eintrag.id, volkId, formData);
  await honigZugangAusPopup(volkId, eintrag.id, datum, formData);
}

/// Datum aus dem Formular - leer heißt "jetzt", ungültig ergibt null.
function eintragsDatumAusFormular(formData: FormData): Date | null {
  const datumRoh = formData.get("datum")?.toString();
  const datum = datumRoh ? new Date(datumRoh) : new Date();
  return Number.isNaN(datum.getTime()) ? null : datum;
}

const UNGUELTIGES_DATUM = { fehler: "Bitte ein gültiges Datum eingeben." };

/// Ergebnis ohne Weiterleitung: Prüffehler oder die Seite, auf die es danach
/// geht. So nutzt es auch die Warteschlange (app/api/warteschlange), die
/// keine Weiterleitung brauchen kann.
export type EintragNeuErgebnis = { fehler: string } | { ziel: string };

export async function stockkartenEintragAnlegen(volkId: string, formData: FormData): Promise<FormularErgebnis> {
  const ergebnis = await stockkartenEintragNeu(volkId, formData);
  if ("fehler" in ergebnis) return ergebnis;
  redirect(ergebnis.ziel);
}

export async function stockkartenEintragNeu(volkId: string, formData: FormData): Promise<EintragNeuErgebnis> {
  if (!eintragsDatumAusFormular(formData)) return UNGUELTIGES_DATUM;
  if ((await prisma.volk.count({ where: { id: volkId } })) === 0) {
    return { fehler: "Dieses Volk gibt es nicht mehr. Der Eintrag wurde nicht gespeichert." };
  }
  const wabenFehler = await wabenEntnahmePruefen([volkId], formData);
  if (wabenFehler) return wabenFehler;

  await stockkartenEintragSpeichern(volkId, formData);

  revalidatePath(`/voelker/${volkId}`);
  return { ziel: `/voelker/${volkId}` };
}

// Sammel-Eintrag von der Stand-Seite: dasselbe Formular, aber für mehrere
// ausgewählte Völker des Stands auf einmal. Jedes Volk bekommt seinen
// eigenen, vollständigen Eintrag (eigene Fotos, eigene Maßnahmen), damit er
// später unabhängig bearbeitet oder gelöscht werden kann. Völker, die nicht
// (mehr) zu diesem Stand gehören, werden still übergangen.
export async function stockkartenEintraegeFuerStandAnlegen(
  bienenstandId: string,
  formData: FormData
): Promise<FormularErgebnis> {
  const ergebnis = await stockkartenEintraegeFuerStandNeu(bienenstandId, formData);
  if ("fehler" in ergebnis) return ergebnis;
  redirect(ergebnis.ziel);
}

export async function stockkartenEintraegeFuerStandNeu(
  bienenstandId: string,
  formData: FormData
): Promise<EintragNeuErgebnis> {
  if (!eintragsDatumAusFormular(formData)) return UNGUELTIGES_DATUM;
  const gewuenschteIds = [...new Set(formData.getAll("volkIds").map(String))];
  const voelker = await prisma.volk.findMany({
    where: { id: { in: gewuenschteIds }, bienenstandId, archiviert: false },
    orderBy: { createdAt: "asc" },
    select: { id: true },
  });
  if (voelker.length === 0) {
    return { fehler: "Keines der gewählten Völker steht (noch) an diesem Stand. Bitte die Auswahl prüfen." };
  }
  const wabenFehler = await wabenEntnahmePruefen(voelker.map((volk) => volk.id), formData);
  if (wabenFehler) return wabenFehler;

  for (const volk of voelker) {
    await stockkartenEintragSpeichern(volk.id, formData);
    revalidatePath(`/voelker/${volk.id}`);
  }

  revalidatePath(`/bienenstaende/${bienenstandId}`);
  // Von der Volk-Seite aus gestartet: dorthin zurück (sofern das Volk zu
  // diesem Stand gehört), sonst auf den Stand.
  const zurueckZuVolk = formData.get("zurueckZuVolk")?.toString();
  if (zurueckZuVolk && (await prisma.volk.count({ where: { id: zurueckZuVolk, bienenstandId } })) > 0) {
    return { ziel: `/voelker/${zurueckZuVolk}` };
  }
  return { ziel: `/bienenstaende/${bienenstandId}` };
}

export async function stockkartenEintragAktualisieren(
  eintragId: string,
  formData: FormData,
): Promise<FormularErgebnis> {
  const datum = eintragsDatumAusFormular(formData);
  if (!datum) return UNGUELTIGES_DATUM;

  const vorher = await prisma.stockkartenEintrag.findUnique({
    where: { id: eintragId },
    select: { volkId: true, createdAt: true },
  });
  if (!vorher) {
    return { fehler: "Diesen Eintrag gibt es nicht mehr. Vielleicht wurde er inzwischen gelöscht." };
  }
  const wabenFehler = await wabenEntnahmePruefen([vorher.volkId], formData, eintragId);
  if (wabenFehler) return wabenFehler;

  const honigernte = await honigernteAusFormular(formData, vorher.volkId, eintragId);
  const fuettererAktion = formData.has("fuettererModus")
    ? {
        fuettererAktion: await fuettererAktionAusFormular(formData, vorher.volkId, datum, {
          id: eintragId,
          createdAt: vorher.createdAt,
        }),
      }
    : {};

  // Die Zusammensetzung der Ernte wird ersetzt, nicht ergänzt: das Formular
  // schickt immer den vollständigen Stand aller Zeilen mit.
  const eintrag = await prisma.stockkartenEintrag.update({
    where: { id: eintragId },
    data: {
      datum,
      ...stockkartenEintragFelderAusFormular(formData),
      ...fuettererAktion,
      ...honigernte.felder,
      honigernteAnteile: { deleteMany: {}, create: honigernte.anteile },
    },
  });

  // Aufgesetzte Honigräume genauso: erst alle wieder lösen, die dieser
  // Eintrag angelegt bzw. geerntet hat, dann neu setzen.
  await prisma.honigraumaufsatz.deleteMany({ where: { aufgesetztEintragId: eintragId } });
  await neueAufsaetzeSpeichern(eintrag.volkId, eintrag.id, datum, formData);
  await prisma.honigraumaufsatz.updateMany({
    where: { geerntetEintragId: eintragId },
    data: { geerntetAm: null, geerntetEintragId: null },
  });
  await geernteteAufsaetzeMarkieren(eintrag.id, datum, honigernte.geernteteAufsatzIds);

  await popupMassnahmeSpeichern(eintrag.volkId, eintrag.id, formData);
  await bewertungZurKoeniginUebernehmen(eintrag.id, eintrag.volkId, formData);

  revalidatePath(`/voelker/${eintrag.volkId}`);
  redirect(`/voelker/${eintrag.volkId}`);
}

export async function stockkartenEintragLoeschen(eintragId: string) {
  const eintrag = await prisma.stockkartenEintrag.findUniqueOrThrow({
    where: { id: eintragId },
    select: { volkId: true, bilder: { select: { dateiname: true } } },
  });

  await prisma.stockkartenEintrag.delete({ where: { id: eintragId } });

  for (const bild of eintrag.bilder) {
    await bildDateiLoeschen(bild.dateiname);
  }

  revalidatePath(`/voelker/${eintrag.volkId}`);
  redirect(`/voelker/${eintrag.volkId}`);
}

export async function bildLoeschen(bildId: string) {
  const bild = await prisma.bild.findUniqueOrThrow({
    where: { id: bildId },
    select: { dateiname: true, stockkartenEintragId: true, stockkartenEintrag: { select: { volkId: true } } },
  });

  await prisma.bild.delete({ where: { id: bildId } });
  await bildDateiLoeschen(bild.dateiname);

  revalidatePath(`/voelker/${bild.stockkartenEintrag.volkId}/eintraege/${bild.stockkartenEintragId}/bearbeiten`);
  revalidatePath(`/voelker/${bild.stockkartenEintrag.volkId}`);
}

// Fotos zu einem vorhandenen Eintrag hinzufügen - eigenständig vom übrigen
// Sperren/Entsperren des Eintrags, damit man jederzeit schnell ein Foto
// nachreichen kann, ohne extra den ganzen Eintrag zu entsperren.
export async function neueBilderHinzufuegen(stockkartenEintragId: string, formData: FormData) {
  await neueBilderSpeichern(stockkartenEintragId, formData);
  await stockkartenEintragPfadeNeuLaden(stockkartenEintragId);
}

async function stockkartenEintragPfadeNeuLaden(stockkartenEintragId: string) {
  const eintrag = await prisma.stockkartenEintrag.findUniqueOrThrow({
    where: { id: stockkartenEintragId },
    select: { volkId: true, volk: { select: { bienenstandId: true } } },
  });

  revalidatePath(`/voelker/${eintrag.volkId}/eintraege/${stockkartenEintragId}/bearbeiten`);
  revalidatePath(`/voelker/${eintrag.volkId}`);
  revalidatePath(`/bienenstaende/${eintrag.volk.bienenstandId}`);
  revalidatePath("/massnahmen");
}

// --- Maßnahmen (ToDos je Volk) ----------------------------------------------

// Maßnahmen hängen immer direkt am Volk (siehe Schema), zusätzlich optional
// noch an dem Stockkarten-Eintrag, in dessen Zuge sie angelegt wurden - dann
// taucht die Bearbeiten-Seite dieses Eintrags als weiterer Pfad mit auf.
async function massnahmenPfadeNeuLaden(volkId: string, stockkartenEintragId?: string | null) {
  // Schritte biotechnischer Verfahren stehen auch auf deren Seite.
  revalidatePath("/behandlungen", "layout");
  if (stockkartenEintragId) {
    await stockkartenEintragPfadeNeuLaden(stockkartenEintragId);
    return;
  }

  const volk = await prisma.volk.findUniqueOrThrow({
    where: { id: volkId },
    select: { bienenstandId: true },
  });

  revalidatePath(`/voelker/${volkId}`);
  revalidatePath(`/bienenstaende/${volk.bienenstandId}`);
  revalidatePath("/massnahmen");
}

export async function massnahmeHinzufuegen(
  volkId: string,
  stockkartenEintragId: string,
  formData: FormData,
) {
  const text = textOderUndefined(formData.get("text"));
  if (!text) return;

  const faelligAmRoh = textOderUndefined(formData.get("faelligAm"));

  await prisma.massnahme.create({
    data: {
      volkId,
      stockkartenEintragId,
      text,
      faelligAm: faelligAmRoh ? new Date(faelligAmRoh) : null,
    },
  });

  await massnahmenPfadeNeuLaden(volkId, stockkartenEintragId);
}

// Maßnahme direkt von der Maßnahmen-Übersicht aus einem oder mehreren
// Völkern gleichzeitig zuordnen (einzelnes Volk, mehrere Völker, ein ganzer
// Stand oder alle Stände/Völker - die Auswahl trifft das Formular, hier
// kommt nur die Liste der Volk-IDs an). Hängt nur am jeweiligen Volk,
// unabhängig davon, ob es dafür schon einen Stockkarten-Eintrag gibt - so
// lassen sich Maßnahmen auch für neu angelegte Völker vorausplanen. Jedes
// ausgewählte Volk bekommt eine eigene Maßnahme, damit sich jede unabhängig
// abhaken/bearbeiten/löschen lässt.
export async function massnahmenFuerVoelkerHinzufuegen(formData: FormData) {
  await massnahmenFuerVoelkerNeu(formData);
}

/// Wie oben, mit Rückmeldung - für die Warteschlange (app/api/warteschlange).
/// Mit sendungId kommt jede Maßnahme je Volk nur einmal an, auch wenn das
/// Handy sie zweimal schickt. Völker, die es nicht mehr gibt, werden still
/// übergangen.
export async function massnahmenFuerVoelkerNeu(formData: FormData): Promise<{ fehler?: string }> {
  const gewuenschteIds = [...new Set(formData.getAll("volkIds").map(String))];
  if (gewuenschteIds.length === 0) return { fehler: "Kein Volk gewählt." };

  const text = textOderUndefined(formData.get("text"));
  if (!text) return { fehler: "Der Text der Maßnahme darf nicht leer sein." };

  const faelligAmRoh = textOderUndefined(formData.get("faelligAm"));
  const faelligAm = faelligAmRoh ? new Date(faelligAmRoh) : null;
  const sendungId = formData.get("sendungId")?.toString() || null;

  const volkIds = (
    await prisma.volk.findMany({ where: { id: { in: gewuenschteIds } }, select: { id: true } })
  ).map((volk) => volk.id);
  if (volkIds.length === 0) return { fehler: "Die gewählten Völker gibt es nicht mehr." };

  await prisma.massnahme.createManyAndReturn({
    data: volkIds.map((volkId) => ({ volkId, text, faelligAm, sendungId })),
    skipDuplicates: true,
  });

  const betroffeneVoelker = await prisma.volk.findMany({
    where: { id: { in: volkIds } },
    select: { id: true, bienenstandId: true },
  });
  for (const volk of betroffeneVoelker) revalidatePath(`/voelker/${volk.id}`);
  for (const bienenstandId of new Set(betroffeneVoelker.map((volk) => volk.bienenstandId))) {
    revalidatePath(`/bienenstaende/${bienenstandId}`);
  }
  revalidatePath("/massnahmen");
  return {};
}

// Tätigkeit und Termin einer bestehenden Maßnahme ändern - Pläne verschieben
// sich in der Praxis ständig (Wetter, Trachtverlauf), da wäre Löschen und neu
// Anlegen unnötig umständlich.
export async function massnahmeAktualisieren(massnahmeId: string, formData: FormData) {
  const text = textOderUndefined(formData.get("text"));
  if (!text) {
    throw new Error("Der Text der Maßnahme darf nicht leer sein.");
  }

  const faelligAmRoh = textOderUndefined(formData.get("faelligAm"));

  const massnahme = await prisma.massnahme.update({
    where: { id: massnahmeId },
    data: { text, faelligAm: faelligAmRoh ? new Date(faelligAmRoh) : null },
    select: { volkId: true, stockkartenEintragId: true },
  });

  await massnahmenPfadeNeuLaden(massnahme.volkId, massnahme.stockkartenEintragId);
}

/// Eine Sammelmaßnahme (ein Rutsch für mehrere Völker, siehe
/// lib/massnahmen-gruppen.ts) als Ganzes ändern: Text und Termin für alle,
/// dazu Völker herausnehmen oder ergänzen. Gesucht wird der ganze Rutsch auf
/// dem Server, auch die schon erledigten Völker: Sie bekommen Text und Termin
/// mit, damit die Gruppe zusammenbleibt ("3/9 erledigt"). Herausgenommen
/// werden nur offene Völker. Neue Völker bekommen die Anlegezeit des Rutsches,
/// damit sie zur Gruppe gehören.
export async function sammelMassnahmeAktualisieren(massnahmeId: string, formData: FormData): Promise<{ fehler?: string }> {
  const text = textOderUndefined(formData.get("text"));
  if (!text) return { fehler: "Der Text der Maßnahme darf nicht leer sein." };
  const faelligAmRoh = textOderUndefined(formData.get("faelligAm"));
  const faelligAm = faelligAmRoh ? new Date(faelligAmRoh) : null;
  const gewuenschteVolkIds = new Set(formData.getAll("volkIds").map(String));
  if (gewuenschteVolkIds.size === 0) return { fehler: "Mindestens ein Volk muss bleiben." };

  const bezug = await prisma.massnahme.findUnique({
    where: { id: massnahmeId },
    select: { text: true, faelligAm: true, createdAt: true, zuchtserieId: true, bioVerfahrenId: true },
  });
  if (!bezug) return { fehler: "Die Maßnahme gibt es nicht mehr." };
  if (bezug.zuchtserieId || bezug.bioVerfahrenId) return { fehler: "Zucht- und Verfahrensschritte gehören nicht zu einer Sammelmaßnahme." };

  const rutsch = await prisma.massnahme.findMany({
    where: {
      text: bezug.text,
      faelligAm: bezug.faelligAm,
      zuchtserieId: null,
      bioVerfahrenId: null,
      createdAt: {
        gte: new Date(bezug.createdAt.getTime() - GLEICHZEITIG_MS),
        lte: new Date(bezug.createdAt.getTime() + GLEICHZEITIG_MS),
      },
    },
    select: { id: true, volkId: true, erledigt: true },
  });

  const entfernen = rutsch.filter((massnahme) => !massnahme.erledigt && !gewuenschteVolkIds.has(massnahme.volkId));
  const bleiben = rutsch.filter((massnahme) => !entfernen.includes(massnahme));
  const vorhanden = new Set(rutsch.map((massnahme) => massnahme.volkId));
  const neueVolkIds = (
    await prisma.volk.findMany({
      where: { id: { in: [...gewuenschteVolkIds].filter((volkId) => !vorhanden.has(volkId)) } },
      select: { id: true },
    })
  ).map((volk) => volk.id);

  await prisma.$transaction(async (tx) => {
    await tx.massnahme.deleteMany({ where: { id: { in: entfernen.map((massnahme) => massnahme.id) } } });
    await tx.massnahme.updateMany({
      where: { id: { in: bleiben.map((massnahme) => massnahme.id) } },
      data: { text, faelligAm },
    });
    await tx.massnahme.createMany({
      data: neueVolkIds.map((volkId) => ({ volkId, text, faelligAm, createdAt: bezug.createdAt })),
    });
  });

  const betroffeneVoelker = await prisma.volk.findMany({
    where: { id: { in: [...new Set([...rutsch.map((massnahme) => massnahme.volkId), ...neueVolkIds])] } },
    select: { id: true, bienenstandId: true },
  });
  for (const volk of betroffeneVoelker) revalidatePath(`/voelker/${volk.id}`);
  for (const bienenstandId of new Set(betroffeneVoelker.map((volk) => volk.bienenstandId))) {
    revalidatePath(`/bienenstaende/${bienenstandId}`);
  }
  revalidatePath("/massnahmen");
  return {};
}

export async function massnahmeUmschalten(massnahmeId: string) {
  const massnahme = await prisma.massnahme.findUniqueOrThrow({
    where: { id: massnahmeId },
    select: { erledigt: true, volkId: true, stockkartenEintragId: true },
  });

  const erledigt = !massnahme.erledigt;
  await prisma.massnahme.update({
    where: { id: massnahmeId },
    data: { erledigt, erledigtAm: erledigt ? new Date() : null },
  });

  await massnahmenPfadeNeuLaden(massnahme.volkId, massnahme.stockkartenEintragId);
}

// Alle Völker einer Sammelmaßnahme auf einmal abhaken (oder wieder öffnen) -
// sonst müsste man bei einem ganzen Stand jedes Volk einzeln anklicken.
export async function massnahmenErledigtSetzen(massnahmeIds: string[], erledigt: boolean, erledigtAm?: Date) {
  const massnahmen = await prisma.massnahme.findMany({
    where: { id: { in: massnahmeIds } },
    select: { volkId: true, stockkartenEintragId: true },
  });

  await prisma.massnahme.updateMany({
    where: { id: { in: massnahmeIds } },
    data: { erledigt, erledigtAm: erledigt ? (erledigtAm ?? new Date()) : null },
  });

  for (const massnahme of massnahmen) {
    await massnahmenPfadeNeuLaden(massnahme.volkId, massnahme.stockkartenEintragId);
  }
}

export async function massnahmeLoeschen(massnahmeId: string) {
  const massnahme = await prisma.massnahme.findUniqueOrThrow({
    where: { id: massnahmeId },
    select: { volkId: true, stockkartenEintragId: true },
  });

  await prisma.massnahme.delete({ where: { id: massnahmeId } });

  await massnahmenPfadeNeuLaden(massnahme.volkId, massnahme.stockkartenEintragId);
}

/// Alle offenen Völker einer Sammelmaßnahme auf einmal löschen.
export async function massnahmenLoeschen(massnahmeIds: string[]) {
  const massnahmen = await prisma.massnahme.findMany({
    where: { id: { in: massnahmeIds } },
    select: { volkId: true, stockkartenEintragId: true },
  });
  await prisma.massnahme.deleteMany({ where: { id: { in: massnahmeIds } } });
  for (const massnahme of massnahmen) {
    await massnahmenPfadeNeuLaden(massnahme.volkId, massnahme.stockkartenEintragId);
  }
}

// --- Betriebsstammdaten ------------------------------------------------------

// Halteranschrift für den Kopf des Behandlungsnachweises (§ 2 THAMNV). Genau
// ein Datensatz mit fester id, deshalb upsert statt create/update.
export async function betriebSpeichern(formData: FormData) {
  const halterName = textOderUndefined(formData.get("halterName"));
  if (!halterName) return;

  // Der Browser prüft das schon, hier noch einmal für alles, was an ihm
  // vorbei kommt.
  const telefon = textOderUndefined(formData.get("telefon")) ?? null;
  if (telefon && !telefonGueltig(telefon)) throw new Error(TELEFON_HINWEIS);

  const daten = {
    halterName,
    strasse: textOderUndefined(formData.get("strasse")) ?? null,
    plzOrt: textOderUndefined(formData.get("plzOrt")) ?? null,
    telefon,
    email: textOderUndefined(formData.get("email")) ?? null,
    registriernummer: textOderUndefined(formData.get("registriernummer")) ?? null,
    menueName: textOderUndefined(formData.get("menueName")) ?? null,
    bundesland: (() => {
      const wert = textOderUndefined(formData.get("bundesland"));
      return wert && istBundesland(wert) ? wert : null;
    })(),
  };

  await prisma.betrieb.upsert({
    where: { id: "standard" },
    // Beim ersten Speichern gleich eine Kennung für den Kalender-Feed
    // mitwürfeln - so ist das Abo ohne weiteren Klick einsatzbereit.
    create: { id: "standard", ...daten, kalenderToken: randomUUID() },
    update: daten,
  });

  revalidatePath("/einstellungen", "layout");
  revalidatePath("/behandlungen");
  // Bundesland entscheidet über Velutina-Karte und -Warnungen (Menü, Start,
  // Stände), der Name im Menü steht auf jeder Seite.
  revalidatePath("/", "layout");
}

// Darstellung der Kalender-Termine: wann erinnert wird, welche Farbe die
// Termine haben und wie ihr Titel aufgebaut ist. Leer gelassene Felder fallen
// auf die Vorgaben in lib/kalender.ts zurück.
export async function kalenderEinstellungenSpeichern(formData: FormData) {
  await prisma.betrieb.update({
    where: { id: "standard" },
    data: {
      kalenderErinnerung: enumWertOderNull(
        ERINNERUNGEN.map((eintrag) => eintrag.wert),
        formData.get("kalenderErinnerung")
      ),
      kalenderFarbe: enumWertOderNull(
        KALENDER_FARBEN.map((eintrag) => eintrag.wert),
        formData.get("kalenderFarbe")
      ),
      kalenderTitel: textOderUndefined(formData.get("kalenderTitel")) ?? null,
    },
  });

  revalidatePath("/einstellungen", "layout");
}

// Neue Kennung für den Kalender-Feed. Bestehende Abos verlieren damit den
// Zugriff und müssen mit der neuen Adresse neu eingerichtet werden.
export async function kalenderTokenErneuern() {
  await prisma.betrieb.update({
    where: { id: "standard" },
    data: { kalenderToken: randomUUID() },
  });

  revalidatePath("/einstellungen", "layout");
}

// --- Medikamente -------------------------------------------------------------

function medikamentFelderAusFormular(formData: FormData) {
  const kaufdatum = textOderUndefined(formData.get("kaufdatum"));
  const verfallsdatum = textOderUndefined(formData.get("verfallsdatum"));

  return {
    name: textOderUndefined(formData.get("name")) ?? "",
    wirkstoff: textOderUndefined(formData.get("wirkstoff")) ?? null,
    zulassungsnummer: textOderUndefined(formData.get("zulassungsnummer")) ?? null,
    einheit: textOderUndefined(formData.get("einheit")) ?? "ml",
    wartezeitTage: zahlOderNull(formData.get("wartezeitTage")) ?? 0,
    lieferant: textOderUndefined(formData.get("lieferant")) ?? null,
    kaufdatum: kaufdatum ? new Date(kaufdatum) : null,
    belegnummer: textOderUndefined(formData.get("belegnummer")) ?? null,
    chargennummer: textOderUndefined(formData.get("chargennummer")) ?? null,
    verfallsdatum: verfallsdatum ? new Date(verfallsdatum) : null,
    notizen: textOderUndefined(formData.get("notizen")) ?? null,
  };
}

// Belege (Rechnung, Lieferschein, Verschreibung) hochladen - nach § 1 Abs. 2
// THAMNV sind sie Teil des Nachweises und 5 Jahre aufzubewahren.
async function neueBelegeSpeichern(medikamentId: string, formData: FormData) {
  const dateien = formData
    .getAll("belege")
    .filter((eintrag): eintrag is File => eintrag instanceof File && eintrag.size > 0);

  for (const datei of dateien) {
    if (!istErlaubterBelegtyp(datei.type)) continue;
    const gespeichert = await bildSpeichern(datei);
    await prisma.medikamentBeleg.create({ data: { medikamentId, ...gespeichert } });
  }
}

// Lieferant und Belegnummer sind Pflicht (Art. 108 VO (EU) 2019/6, § 2 THAMNV).
// Nur hier in der Aktion geprüft, nicht im Schema - alte Datensätze ohne diese
// Angaben bleiben gültig und werden als "unvollständig" angezeigt.
function medikamentPflichtPruefen(felder: ReturnType<typeof medikamentFelderAusFormular>) {
  if (!felder.name) return { fehler: "Der Handelsname fehlt." };
  const fehlt: string[] = [];
  if (!felder.lieferant) fehlt.push("Lieferant (Name und Anschrift)");
  if (!felder.belegnummer) fehlt.push("Belegnummer");
  if (fehlt.length > 0) {
    return {
      fehler: `Nicht gespeichert. Es fehlt: ${fehlt.join(" und ")}. Ohne diese Angaben ist der Erwerb nicht nachweisbar.`,
    };
  }
  return null;
}

export async function medikamentAnlegen(formData: FormData): Promise<{ fehler?: string }> {
  const felder = medikamentFelderAusFormular(formData);
  const pruefung = medikamentPflichtPruefen(felder);
  if (pruefung) return pruefung;

  // Aus einer Vorlage aktiviert: die Stammdaten sind vorgegeben, die eigene
  // Packung (Kaufdatum, Charge) muss zusätzlich eingetragen sein.
  if (medikamentVorlage(textOderUndefined(formData.get("vorlage")))) {
    const fehlt: string[] = [];
    if (!felder.kaufdatum) fehlt.push("Kaufdatum");
    if (!felder.chargennummer) fehlt.push("Chargennummer");
    if (fehlt.length > 0) {
      return { fehler: `Nicht gespeichert. Es fehlt: ${fehlt.join(" und ")}.` };
    }
  }

  const medikament = await prisma.medikament.create({ data: felder });
  await neueBelegeSpeichern(medikament.id, formData);

  revalidatePath("/medikamente");
  redirect("/medikamente");
}

export async function medikamentAktualisieren(
  medikamentId: string,
  formData: FormData
): Promise<{ fehler?: string }> {
  const felder = medikamentFelderAusFormular(formData);
  const pruefung = medikamentPflichtPruefen(felder);
  if (pruefung) return pruefung;

  await prisma.medikament.update({ where: { id: medikamentId }, data: felder });
  await neueBelegeSpeichern(medikamentId, formData);

  revalidatePath("/medikamente");
  redirect("/medikamente");
}

export async function belegeHinzufuegen(medikamentId: string, formData: FormData) {
  await neueBelegeSpeichern(medikamentId, formData);
  revalidatePath(`/medikamente/${medikamentId}/bearbeiten`);
  revalidatePath("/medikamente");
}

export async function belegLoeschen(belegId: string) {
  const beleg = await prisma.medikamentBeleg.findUniqueOrThrow({
    where: { id: belegId },
    select: { dateiname: true, medikamentId: true },
  });

  await prisma.medikamentBeleg.delete({ where: { id: belegId } });
  await bildDateiLoeschen(beleg.dateiname);

  revalidatePath(`/medikamente/${beleg.medikamentId}/bearbeiten`);
  revalidatePath("/medikamente");
}

// Aufgebraucht oder abgelaufen: verschwindet aus der Auswahl bei neuen
// Behandlungen, bleibt aber für bestehende Nachweise erhalten - gelöscht
// werden darf es wegen der 5-Jahres-Frist nicht einfach so.
export async function medikamentArchivieren(medikamentId: string) {
  await prisma.medikament.update({
    where: { id: medikamentId },
    data: { archiviert: true, archiviertAm: new Date() },
  });
  revalidatePath("/medikamente");
}

export async function medikamentReaktivieren(medikamentId: string) {
  await prisma.medikament.update({
    where: { id: medikamentId },
    data: { archiviert: false, archiviertAm: null },
  });
  revalidatePath("/medikamente");
}

export async function medikamentLoeschen(medikamentId: string) {
  const anzahlBehandlungen = await prisma.behandlung.count({ where: { medikamentId } });
  if (anzahlBehandlungen > 0) {
    throw new Error(
      "Zu diesem Medikament gibt es dokumentierte Behandlungen. Es kann nur archiviert werden."
    );
  }

  const belege = await prisma.medikamentBeleg.findMany({
    where: { medikamentId },
    select: { dateiname: true },
  });

  await prisma.medikament.delete({ where: { id: medikamentId } });
  for (const beleg of belege) {
    await bildDateiLoeschen(beleg.dateiname);
  }

  revalidatePath("/medikamente");
  redirect("/medikamente");
}

// --- Behandlungen ------------------------------------------------------------

// Eine Behandlung deckt beliebig viele Völker ab. Volksname und Standort
// werden als Text mitgeschrieben: der Nachweis muss zeigen, wo das Volk zum
// Zeitpunkt der Behandlung stand - wird es später umgesetzt oder umbenannt,
// darf sich der alte Nachweis nicht rückwirkend mitverändern.
export async function behandlungAnlegen(formData: FormData): Promise<{ fehler?: string }> {
  const medikamentId = textOderUndefined(formData.get("medikamentId"));
  const indikation = textOderUndefined(formData.get("indikation"));
  const datumRoh = textOderUndefined(formData.get("datum"));
  const anwender = textOderUndefined(formData.get("anwender"));
  const volkIds = formData.getAll("volkIds").map((wert) => wert.toString()).filter(Boolean);

  if (!medikamentId || !indikation || !datumRoh || !anwender || volkIds.length === 0) {
    return { fehler: "Nicht gespeichert. Nötig sind Medikament, Behandelt gegen, Datum, Anwender und mindestens ein Volk." };
  }

  const menge = zahlOderNull(formData.get("mengeJeVolk"));
  if (menge === null || menge < 0) {
    return { fehler: "Nicht gespeichert. Die Menge je Volk fehlt oder ist keine Zahl (Komma ist erlaubt, z.B. 2,5)." };
  }

  const endeDatumRoh = textOderUndefined(formData.get("endeDatum"));
  if (endeDatumRoh && endeDatumRoh < datumRoh) {
    return { fehler: "Nicht gespeichert. Das Ende liegt vor dem Datum der Anwendung." };
  }
  const voelker = await prisma.volk.findMany({
    where: { id: { in: volkIds } },
    select: { id: true, name: true, bienenstand: { select: { name: true } } },
  });

  // Medikamenten-Schritt eines biotechnischen Verfahrens (z.B. Oxalsäure am
  // Tag 25 nach dem Käfigen): Behandlung verknüpfen, Schritt abhaken.
  const verfahrenId = textOderUndefined(formData.get("verfahrenId"));
  const verfahren = verfahrenId
    ? await prisma.bioVerfahren.findUnique({ where: { id: verfahrenId }, select: { id: true } })
    : null;
  const schritt = textOderUndefined(formData.get("schritt"));

  await prisma.behandlung.create({
    data: {
      bioVerfahrenId: verfahren?.id ?? null,
      medikamentId,
      indikation,
      datum: new Date(datumRoh),
      endeDatum: endeDatumRoh ? new Date(endeDatumRoh) : null,
      mengeJeVolk: menge,
      wartezeitTage: zahlOderNull(formData.get("wartezeitTage")) ?? 0,
      anwender,
      bemerkung: textOderUndefined(formData.get("bemerkung")) ?? null,
      voelker: {
        create: voelker.map((volk) => ({
          volkId: volk.id,
          volkNameDamals: volk.name,
          standNameDamals: volk.bienenstand.name,
        })),
      },
    },
  });

  if (verfahren && schritt) {
    await prisma.massnahme.updateMany({
      where: { bioVerfahrenId: verfahren.id, bioSchritt: schritt, volkId: { in: voelker.map((volk) => volk.id) } },
      data: { erledigt: true, erledigtAm: new Date(datumRoh) },
    });
    revalidatePath("/massnahmen");
  }

  revalidatePath("/behandlungen", "layout");
  for (const volk of voelker) {
    revalidatePath(`/voelker/${volk.id}`);
  }
  // Vom Volk aus angelegt: zurück aufs Volk, sofern es mitbehandelt wurde.
  const zurueckZuVolk = formData.get("zurueckZuVolk")?.toString();
  if (zurueckZuVolk && voelker.some((volk) => volk.id === zurueckZuVolk)) {
    redirect(`/voelker/${zurueckZuVolk}`);
  }
  redirect(verfahren ? `/behandlungen/verfahren/${verfahren.id}` : "/behandlungen");
}

// Korrektur statt Löschen: § 1 Abs. 1 THAMNV verlangt unveränderliche
// Aufzeichnungen, deshalb bleibt die stornierte Zeile mit ihrem Grund im
// Nachweis stehen und wird nur durchgestrichen dargestellt.
export async function behandlungStornieren(behandlungId: string, formData: FormData) {
  const grund = textOderUndefined(formData.get("storniertGrund"));
  if (!grund) {
    throw new Error("Bitte einen Grund für die Stornierung angeben.");
  }

  const behandlung = await prisma.behandlung.update({
    where: { id: behandlungId },
    data: { storniertAm: new Date(), storniertGrund: grund },
    select: { voelker: { select: { volkId: true } } },
  });

  revalidatePath("/behandlungen");
  for (const eintrag of behandlung.voelker) {
    revalidatePath(`/voelker/${eintrag.volkId}`);
  }
}

// --- Behandlungsnachweis als PDF ---------------------------------------------

// Erzeugt die PDF-Datei auf dem Server und legt sie im dauerhaften
// Upload-Verzeichnis ab. Sie bleibt dort, bis sie ausdrücklich gelöscht wird -
// heruntergeladen und weitergeschickt werden kann sie beliebig oft.
export async function nachweisErstellen(formData: FormData) {
  const jahr = Number.parseInt((formData.get("jahr") ?? "").toString(), 10);
  if (!Number.isFinite(jahr)) {
    throw new Error("Kein gültiges Jahr gewählt.");
  }

  const umfangRoh = (formData.get("umfang") ?? "ALLE").toString();
  const umfang = enumWertOderNull(NACHWEIS_UMFAENGE, umfangRoh) ?? "ALLE";
  const standId = umfang === "STAND" ? textOderUndefined(formData.get("standId")) : undefined;
  const volkId = umfang === "VOLK" ? textOderUndefined(formData.get("volkId")) : undefined;

  if (umfang === "STAND" && !standId) throw new Error("Kein Bienenstand gewählt.");
  if (umfang === "VOLK" && !volkId) throw new Error("Kein Volk gewählt.");

  const daten = await nachweisDatenLaden({ jahr, standId, volkId });
  const erstelltAm = new Date();
  const inhalt = await nachweisPdfErzeugen(daten, erstelltAm);
  const { dateiname, groesse } = await dateiSpeichern(inhalt, ".pdf");

  // Sprechender Dateiname für den Download - Umlaute und Sonderzeichen raus,
  // damit die Datei auf jedem Gerät und in jedem Mailprogramm ankommt.
  const sauber = daten.bezeichnung
    .replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue")
    .replace(/Ä/g, "Ae").replace(/Ö/g, "Oe").replace(/Ü/g, "Ue").replace(/ß/g, "ss")
    .replace(/[^A-Za-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();

  await prisma.nachweisDatei.create({
    data: {
      jahr,
      umfang,
      bezeichnung: daten.bezeichnung,
      dateiname,
      originalDateiname: `Behandlungsnachweis-${jahr}-${sauber || "gesamt"}.pdf`,
      groesse,
      anzahlBehandlungen: daten.behandlungen.length,
    },
  });

  revalidatePath("/behandlungen");
}

export async function nachweisLoeschen(nachweisId: string) {
  const nachweis = await prisma.nachweisDatei.findUniqueOrThrow({
    where: { id: nachweisId },
    select: { dateiname: true },
  });

  await prisma.nachweisDatei.delete({ where: { id: nachweisId } });
  await bildDateiLoeschen(nachweis.dateiname);

  revalidatePath("/behandlungen");
}

// --- Lagerlisten als PDF -----------------------------------------------------

// Wie beim Behandlungsnachweis: die PDF-Datei wird einmal erzeugt und im
// Upload-Verzeichnis abgelegt - ein fester Stand zum Erstellungstag, der unter
// Dokumente und unten auf der Lager-Seite liegt, bis er gelöscht wird.
export async function lagerlisteErstellen(art: "MATERIAL" | "ERZEUGNISSE") {
  if (art !== "MATERIAL" && art !== "ERZEUGNISSE") throw new Error("Unbekannte Lagerliste.");

  const erstelltAm = new Date();
  const { inhalt, anzahlPositionen } =
    art === "MATERIAL"
      ? await materialListeLaden().then(async (liste) => ({
          inhalt: await materialListePdfErzeugen(liste, erstelltAm),
          anzahlPositionen: liste.anzahlPositionen,
        }))
      : await erzeugnisListeLaden().then(async (liste) => ({
          inhalt: await erzeugnisListePdfErzeugen(liste, erstelltAm),
          anzahlPositionen: liste.anzahlPositionen,
        }));
  const { dateiname, groesse } = await dateiSpeichern(inhalt, ".pdf");

  const tag = erstelltAm.toISOString().slice(0, 10);
  await prisma.lagerlisteDatei.create({
    data: {
      art,
      dateiname,
      originalDateiname: `Lagerliste-${art === "MATERIAL" ? "Material" : "Erzeugnisse"}-${tag}.pdf`,
      groesse,
      anzahlPositionen,
    },
  });

  revalidatePath("/lager", "layout");
  revalidatePath("/dokumente");
}

// Buchungen (Zu- und Abgänge) der Erzeugnisse in einem Zeitraum als PDF,
// abgelegt wie eine Lagerliste.
export async function buchungslisteErstellen(formData: FormData): Promise<{ fehler: string } | void> {
  const vonText = textOderUndefined(formData.get("von"));
  const bisText = textOderUndefined(formData.get("bis"));
  const von = vonText ? new Date(vonText) : null;
  const bis = bisText ? new Date(bisText) : null;
  if (!von || !bis || Number.isNaN(von.getTime()) || Number.isNaN(bis.getTime())) {
    return { fehler: "Bitte Anfang und Ende des Zeitraums wählen." };
  }
  if (bis < von) return { fehler: "Das Ende liegt vor dem Anfang." };
  const erzeugnistypId = textOderUndefined(formData.get("erzeugnistypId")) ?? null;

  const erstelltAm = new Date();
  const liste = await buchungsListeLaden(von, bis, erzeugnistypId);
  const inhalt = await buchungsListePdfErzeugen(liste, erstelltAm);
  const { dateiname, groesse } = await dateiSpeichern(inhalt, ".pdf");

  const tag = (datum: Date) => datum.toISOString().slice(0, 10);
  const anzeige = (datum: Date) => datum.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "UTC" });
  await prisma.lagerlisteDatei.create({
    data: {
      art: "BUCHUNGEN",
      dateiname,
      originalDateiname: `Buchungen-${liste.nurErzeugnis ?? "Erzeugnisse"}-${tag(von)}-bis-${tag(bis)}.pdf`.replace(/[^\w.-]/g, "_"),
      groesse,
      anzahlPositionen: liste.anzahlPositionen,
      zeitraum: `${anzeige(von)} bis ${anzeige(bis)}${liste.nurErzeugnis ? ` · ${liste.nurErzeugnis}` : ""}`,
    },
  });

  revalidatePath("/lager", "layout");
  revalidatePath("/dokumente");
}

export async function lagerlisteLoeschen(lagerlisteId: string) {
  const lagerliste = await prisma.lagerlisteDatei.findUniqueOrThrow({
    where: { id: lagerlisteId },
    select: { dateiname: true },
  });

  await prisma.lagerlisteDatei.delete({ where: { id: lagerlisteId } });
  await bildDateiLoeschen(lagerliste.dateiname);

  revalidatePath("/lager", "layout");
  revalidatePath("/dokumente");
}

// --- Beutensysteme, Rähmchenmaße, Zargen ------------------------------------
//
// Stammdaten für Brutraum und Honigraum. Gelöscht werden darf hier gefahrlos:
// bereits erfasste Ernten und aufgesetzte Honigräume halten Bezeichnung und
// Gewicht als eigene Kopie, sie ändern sich also nicht mit.

const BEUTEN_PFAD = "/einstellungen/beuten";

export async function beutensystemAnlegen(formData: FormData) {
  const name = textOderUndefined(formData.get("name"));
  if (!name) return;

  // Aus dem Katalog gewählt? Dann kommen die Rähmchenmaße gleich mit - die
  // sind genormt, die tippt niemand freiwillig ab.
  const vorlage = BEUTENSYSTEM_KATALOG.find((eintrag) => eintrag.name === name);

  const system = await prisma.beutensystem.create({
    data: {
      name,
      notizen: textOderUndefined(formData.get("notizen")) ?? null,
      wabenmasse: vorlage
        ? {
            create: vorlage.wabenmasse.map((mass) => ({
              name: mass.name,
              breiteMm: mass.breiteMm,
              hoeheMm: mass.hoeheMm,
              eignung: mass.eignung,
              honigProWabeKg: mass.honigProWabeKg,
            })),
          }
        : undefined,
    },
    include: { wabenmasse: { select: { id: true, name: true, honigProWabeKg: true } } },
  });

  // Die genormten Maße bekommen gleich ihre Zarge mit - sonst würde man sie
  // gleich danach in der Zargen-Liste vermissen.
  if (vorlage) await zargenFuerNeueMasse(system.wabenmasse, name);

  revalidatePath(BEUTEN_PFAD);
}

export async function beutensystemLoeschen(beutensystemId: string) {
  await prisma.beutensystem.delete({ where: { id: beutensystemId } });
  revalidatePath(BEUTEN_PFAD);
}

export async function wabenmassSpeichern(formData: FormData) {
  const wabenmassId = textOderUndefined(formData.get("wabenmassId"));
  const name = textOderUndefined(formData.get("name"));
  const honigProWabeKg = zahlOderNull(formData.get("honigProWabeKg"));
  const eignung = enumWertOderNull(EIGNUNGEN, formData.get("eignung"));
  const breiteMm = zahlOderNull(formData.get("breiteMm"));
  const hoeheMm = zahlOderNull(formData.get("hoeheMm"));

  if (wabenmassId) {
    await prisma.wabenmass.update({
      where: { id: wabenmassId },
      data: {
        ...(name ? { name } : {}),
        ...(honigProWabeKg !== null ? { honigProWabeKg } : {}),
        ...(eignung ? { eignung } : {}),
        breiteMm,
        hoeheMm,
      },
    });
  } else {
    const beutensystemId = textOderUndefined(formData.get("beutensystemId"));
    if (!beutensystemId || !name) return;

    const system = await prisma.beutensystem.findUniqueOrThrow({
      where: { id: beutensystemId },
      select: { name: true },
    });
    const neuesMass = await prisma.wabenmass.create({
      data: {
        beutensystemId,
        name,
        breiteMm,
        hoeheMm,
        eignung: eignung ?? "BEIDES",
        honigProWabeKg: honigProWabeKg ?? 2,
      },
      select: { id: true, name: true, honigProWabeKg: true },
    });
    await zargenFuerNeueMasse([neuesMass], system.name);
  }

  revalidatePath(BEUTEN_PFAD);
}

export async function wabenmassLoeschen(wabenmassId: string) {
  await prisma.wabenmass.delete({ where: { id: wabenmassId } });
  revalidatePath(BEUTEN_PFAD);
}

export async function zargeSpeichern(formData: FormData) {
  const zargeId = textOderUndefined(formData.get("zargeId"));
  const name = textOderUndefined(formData.get("name"));
  const wabenAnzahl = zahlOderNull(formData.get("wabenAnzahl"));
  const honigProZargeKg = zahlOderNull(formData.get("honigProZargeKg"));

  if (zargeId) {
    await prisma.zarge.update({
      where: { id: zargeId },
      data: {
        ...(name ? { name } : {}),
        ...(wabenAnzahl !== null ? { wabenAnzahl } : {}),
        ...(honigProZargeKg !== null ? { honigProZargeKg } : {}),
      },
    });
  } else {
    const wabenmassId = textOderUndefined(formData.get("wabenmassId"));
    if (!wabenmassId) return;

    const wabenmass = await prisma.wabenmass.findUniqueOrThrow({
      where: { id: wabenmassId },
      select: { name: true, honigProWabeKg: true },
    });
    const anzahl = wabenAnzahl ?? 10;

    await prisma.zarge.create({
      data: {
        wabenmassId,
        name: name ?? wabenmass.name,
        wabenAnzahl: anzahl,
        // Ohne eigene Angabe: Wabenzahl mal Durchschnittsertrag der Wabe. Ein
        // Startwert, kein Gesetz - eine volle Zarge bringt selten genau das.
        honigProZargeKg: honigProZargeKg ?? runden(anzahl * wabenmass.honigProWabeKg),
      },
    });
  }

  revalidatePath(BEUTEN_PFAD);
}

// Ergänzt bei einem schon angelegten System die Rähmchenmaße aus dem Katalog,
// die dort noch fehlen. Nötig für Systeme, die vor dem Katalog angelegt
// wurden - und praktisch, wenn man selbst eines gelöscht hat und es
// zurückholen will. Vorhandene Maße bleiben unberührt.
export async function wabenmasseErgaenzen(beutensystemId: string) {
  const system = await prisma.beutensystem.findUniqueOrThrow({
    where: { id: beutensystemId },
    select: { name: true, wabenmasse: { select: { name: true } } },
  });

  const fehlende = fehlendeKatalogMasse(
    system.name,
    system.wabenmasse.map((mass) => mass.name)
  );
  if (fehlende.length === 0) return;

  const neueMasse = await prisma.wabenmass.createManyAndReturn({
    data: fehlende.map((mass) => ({
      beutensystemId,
      name: mass.name,
      breiteMm: mass.breiteMm,
      hoeheMm: mass.hoeheMm,
      eignung: mass.eignung,
      honigProWabeKg: mass.honigProWabeKg,
    })),
    select: { id: true, name: true, honigProWabeKg: true },
  });
  await zargenFuerNeueMasse(neueMasse, system.name);

  revalidatePath(BEUTEN_PFAD);
}

export async function zargeLoeschen(zargeId: string) {
  await prisma.zarge.delete({ where: { id: zargeId } });
  revalidatePath(BEUTEN_PFAD);
}

// --- Dokumente ----------------------------------------------------------------

// Alle Seiten, auf denen ein Dokument (je nach Verknüpfung) sichtbar werden
// kann - nach dem Speichern/Löschen an einer Stelle aktuell halten.
async function dokumentPfadeNeuLaden(dokument: {
  bienenstandId: string | null;
  koeniginId: string | null;
  voelker: { volkId: string }[];
}) {
  revalidatePath("/dokumente");
  if (dokument.bienenstandId) revalidatePath(`/bienenstaende/${dokument.bienenstandId}`);
  if (dokument.koeniginId) revalidatePath(`/koeniginnen/${dokument.koeniginId}`);
  for (const eintrag of dokument.voelker) {
    revalidatePath(`/voelker/${eintrag.volkId}`);
  }
}

// Ein Dokument braucht immer eine Kategorie - entweder eine bestehende
// (kategorieId) oder eine neue, die dabei gleich mit angelegt wird
// (neueKategorie). Verknüpfung mit Stand/Völkern/Königin ist optional: ohne
// sie landet das Dokument nur in der zentralen Dokumentenliste.
export async function dokumentAnlegen(formData: FormData) {
  const datumText = textOderUndefined(formData.get("datum"));
  const datei = formData.get("datei");
  const neueKategorie = textOderUndefined(formData.get("neueKategorie"));
  const kategorieId = textOderUndefined(formData.get("kategorieId"));

  if (!datumText || !(datei instanceof File) || datei.size === 0) {
    throw new Error("Bitte Datum und Datei angeben.");
  }
  if (!istErlaubterBelegtyp(datei.type)) {
    throw new Error("Nur Bilder oder PDF-Dateien sind als Dokument erlaubt.");
  }

  let endgueltigeKategorieId: string;
  if (neueKategorie) {
    const bestehende = await prisma.dokumentkategorie.findFirst({
      where: { name: { equals: neueKategorie, mode: "insensitive" } },
    });
    endgueltigeKategorieId =
      bestehende?.id ??
      (await prisma.dokumentkategorie.create({ data: { name: neueKategorie } })).id;
  } else if (kategorieId) {
    endgueltigeKategorieId = kategorieId;
  } else {
    throw new Error("Keine Kategorie gewählt.");
  }

  const volkIds = formData.getAll("volkIds").map((wert) => wert.toString());
  const gespeichert = await bildSpeichern(datei);

  const dokument = await prisma.dokument.create({
    data: {
      kategorieId: endgueltigeKategorieId,
      datum: new Date(datumText),
      titel: textOderUndefined(formData.get("titel")) ?? null,
      notizen: textOderUndefined(formData.get("notizen")) ?? null,
      bienenstandId: textOderUndefined(formData.get("bienenstandId")) ?? null,
      koeniginId: textOderUndefined(formData.get("koeniginId")) ?? null,
      voelker: { create: volkIds.map((volkId) => ({ volkId })) },
      ...gespeichert,
    },
    select: { bienenstandId: true, koeniginId: true, voelker: { select: { volkId: true } } },
  });

  await dokumentPfadeNeuLaden(dokument);

  const zurueck = textOderUndefined(formData.get("zurueck"));
  redirect(zurueck && zurueck.startsWith("/") ? zurueck : "/dokumente");
}

export async function dokumentLoeschen(dokumentId: string) {
  const dokument = await prisma.dokument.findUniqueOrThrow({
    where: { id: dokumentId },
    select: {
      dateiname: true,
      bienenstandId: true,
      koeniginId: true,
      voelker: { select: { volkId: true } },
    },
  });

  await prisma.dokument.delete({ where: { id: dokumentId } });
  await bildDateiLoeschen(dokument.dateiname);

  await dokumentPfadeNeuLaden(dokument);
}

// --- Lagerverwaltung: Material und Erzeugnisse ------------------------------
//
// Material (Zargen + frei benanntes Zubehör) und Erzeugnisse (Honig, Wachs,
// ...) - siehe web/src/lib/lager.ts für die Bestandsberechnung. Bewusst zwei
// getrennte, einfache Modelle statt eines gemeinsamen: bei Zargen kommt der
// Bestand aus den Einstellungen, bei Erzeugnissen aus einem Buchungsverlauf -
// beides über einen Kamm zu scheren hätte an beiden Stellen Umwege gebraucht.

const LAGER_PFAD = "/lager";
// Lagerorte, Sorten, Gebinde und "Eimer einzeln wiegen" stehen unter Einstellungen -> Lager.
const LAGER_EINSTELLUNGEN_PFAD = "/einstellungen/lager";

// Gesamtbestand einer bereits in den Einstellungen angelegten Zarge - "im
// Einsatz" ergibt sich automatisch, siehe zargenBestandsuebersicht().
export async function zargeBestandSpeichern(formData: FormData) {
  const zargeId = textOderUndefined(formData.get("zargeId"));
  if (!zargeId) return;

  const gesamtbestand = zahlOderNull(formData.get("gesamtbestand"));

  await prisma.zarge.update({
    where: { id: zargeId },
    data: { gesamtbestand: gesamtbestand !== null ? Math.max(0, Math.round(gesamtbestand)) : null },
  });

  revalidatePath(LAGER_PFAD, "layout");
}

// Wo etwas lagert - komplett optional, siehe Prisma-Schema. Entweder eine
// bestehende id (lagerortId) oder ein neuer Name, der dabei gleich mit
// angelegt wird (neuerLagerort) - so lässt sich ein Ort sowohl auf der
// eigenen Einstellungsseite als auch direkt beim Erfassen von Material oder
// einer Erzeugnis-Buchung neu anlegen, ohne die Seite zu verlassen.
async function lagerortIdAufloesen(formData: FormData): Promise<string | null> {
  const neuerName = textOderUndefined(formData.get("neuerLagerort"));
  if (neuerName) {
    const bestehender = await prisma.lagerort.findFirst({
      where: { name: { equals: neuerName, mode: "insensitive" } },
    });
    return bestehender?.id ?? (await prisma.lagerort.create({ data: { name: neuerName } })).id;
  }
  return textOderUndefined(formData.get("lagerortId")) ?? null;
}

export async function lagerortSpeichern(formData: FormData) {
  const lagerortId = textOderUndefined(formData.get("lagerortId"));
  const name = textOderUndefined(formData.get("name"));
  if (!name) return;

  const daten = { name, notizen: textOderUndefined(formData.get("notizen")) ?? null };

  if (lagerortId) {
    await prisma.lagerort.update({ where: { id: lagerortId }, data: daten });
  } else {
    await prisma.lagerort.create({ data: daten });
  }

  revalidatePath(LAGER_EINSTELLUNGEN_PFAD);
  revalidatePath(LAGER_PFAD, "layout");
}

export async function lagerortLoeschen(lagerortId: string) {
  await prisma.lagerort.delete({ where: { id: lagerortId } });
  revalidatePath(LAGER_EINSTELLUNGEN_PFAD);
  revalidatePath(LAGER_PFAD, "layout");
}

export async function materialartikelAnlegen(formData: FormData) {
  const name = textOderUndefined(formData.get("name"));
  if (!name) return;

  await prisma.materialartikel.create({
    data: {
      name,
      einheit: textOderUndefined(formData.get("einheit")) ?? "Stück",
      bestand: zahlOderNull(formData.get("bestand")) ?? 0,
      notizen: textOderUndefined(formData.get("notizen")) ?? null,
      lagerortId: await lagerortIdAufloesen(formData),
      klimadeckel: formData.get("klimadeckel") === "1",
    },
  });

  revalidatePath(LAGER_PFAD, "layout");
}

export async function materialartikelSpeichern(formData: FormData) {
  const materialartikelId = textOderUndefined(formData.get("materialartikelId"));
  if (!materialartikelId) return;

  const name = textOderUndefined(formData.get("name"));
  const einheit = textOderUndefined(formData.get("einheit"));
  const bestand = zahlOderNull(formData.get("bestand"));

  await prisma.materialartikel.update({
    where: { id: materialartikelId },
    data: {
      ...(name ? { name } : {}),
      ...(einheit ? { einheit } : {}),
      ...(bestand !== null ? { bestand } : {}),
      notizen: textOderUndefined(formData.get("notizen")) ?? null,
      lagerortId: await lagerortIdAufloesen(formData),
    },
  });

  revalidatePath(LAGER_PFAD, "layout");
}

export async function materialartikelLoeschen(materialartikelId: string) {
  await prisma.materialartikel.delete({ where: { id: materialartikelId } });
  revalidatePath(LAGER_PFAD, "layout");
}

// Neue Größe aus den Feldern von GebindeNeuFelder (Einlagern-Fenster und
// Einstellungen -> Lager): Name bekommt bei Honig "Glas"/"Eimer" vorne dran,
// passend zur Gruppe. Gibt es dieselbe Größe schon, wird sie genommen statt
// ein zweites Mal angelegt.
async function gebindeFindenOderAnlegen(
  erzeugnistypId: string,
  formData: FormData,
): Promise<{ id: string; name: string; inhalt: number } | { fehler: string } | null> {
  const eingabe = textOderUndefined(formData.get("neuesGebinde"));
  if (!eingabe) return null;
  const inhalt = zahlOderNull(formData.get("neuesGebindeInhalt"));
  if (inhalt === null || inhalt <= 0) return { fehler: "Bitte den Inhalt des neuen Gebindes angeben." };

  const typ = await prisma.erzeugnistyp.findUnique({
    where: { id: erzeugnistypId },
    select: { name: true, gebinde: { select: { id: true, name: true, inhalt: true } } },
  });
  if (!typ) return { fehler: "Das Erzeugnis gibt es nicht mehr." };
  const honig = typ.name.toLowerCase() === "honig";
  const artWert = formData.get("gebindeArt")?.toString();
  const art = istGebindeArt(artWert) ? artWert : gebindeArt(eingabe);
  const neu = { name: gebindeNameVoll(eingabe, art, honig), inhalt: aufGramm(inhalt) };

  return (
    typ.gebinde.find((vorhanden) => gleichesGebinde(vorhanden, neu, honig)) ??
    (await prisma.gebinde.create({
      data: { erzeugnistypId, ...neu },
      select: { id: true, name: true, inhalt: true },
    }))
  );
}

// Ein Gebinde (z.B. "Eimer 25 kg", "Glas 500 g") unter Einstellungen -> Lager
// anlegen - wird beim Buchen zur Auswahl angeboten.
export async function gebindeAnlegen(formData: FormData): Promise<{ fehler: string } | void> {
  const erzeugnistypId = textOderUndefined(formData.get("erzeugnistypId"));
  if (!erzeugnistypId) return { fehler: "Bitte ein Erzeugnis wählen." };
  const ergebnis = await gebindeFindenOderAnlegen(erzeugnistypId, formData);
  if (!ergebnis) return { fehler: "Bitte eine Größe angeben." };
  if ("fehler" in ergebnis) return ergebnis;

  revalidatePath(LAGER_PFAD, "layout");
  revalidatePath(LAGER_EINSTELLUNGEN_PFAD);
}

export async function gebindeLoeschen(gebindeId: string) {
  await prisma.gebinde.delete({ where: { id: gebindeId } });
  revalidatePath(LAGER_PFAD, "layout");
  revalidatePath(LAGER_EINSTELLUNGEN_PFAD);
}

// Eine Sorte (z.B. bei Honig: Waldhonig, Rapshonig, ...) für einen
// Erzeugnistyp - wird beim Buchen zur Auswahl angeboten, siehe
// erzeugnisBuchungAnlegen.
export async function sorteAnlegen(formData: FormData) {
  const erzeugnistypId = textOderUndefined(formData.get("erzeugnistypId"));
  const name = textOderUndefined(formData.get("name"));
  if (!erzeugnistypId || !name) return;

  const bestehende = await prisma.sorte.findFirst({
    where: { erzeugnistypId, name: { equals: name, mode: "insensitive" } },
  });
  if (!bestehende) {
    await prisma.sorte.create({ data: { erzeugnistypId, name } });
  }
  revalidatePath(LAGER_PFAD, "layout");
  revalidatePath(LAGER_EINSTELLUNGEN_PFAD);
}

export async function sorteLoeschen(sorteId: string) {
  await prisma.sorte.delete({ where: { id: sorteId } });
  revalidatePath(LAGER_PFAD, "layout");
  revalidatePath(LAGER_EINSTELLUNGEN_PFAD);
}

// Sorte: entweder eine bestehende id (sorteId) oder ein neuer Name, der
// dabei gleich für diesen Erzeugnistyp mit angelegt wird (neueSorte) -
// analog zur Erzeugnistyp-/Dokumentkategorie-Auswahl.
async function sorteIdAufloesen(formData: FormData, erzeugnistypId: string): Promise<string | null> {
  const neuerName = textOderUndefined(formData.get("neueSorte"));
  if (neuerName) {
    const bestehende = await prisma.sorte.findFirst({
      where: { erzeugnistypId, name: { equals: neuerName, mode: "insensitive" } },
    });
    return bestehende?.id ?? (await prisma.sorte.create({ data: { erzeugnistypId, name: neuerName } })).id;
  }
  return textOderUndefined(formData.get("sorteId")) ?? null;
}

// Zustand bei Honig (gerührt/unbearbeitet) - nur bekannte Werte, sonst leer.
function honigZustandAusFormular(formData: FormData): string | null {
  const wert = formData.get("zustand")?.toString();
  return wert && wert in HONIG_ZUSTAENDE ? wert : null;
}

// Ein Posten im Erzeugnis-Lager: alle Buchungen mit gleichem Erzeugnistyp,
// Sorte, Zustand, Gebinde und Lagerort (wie die Gruppen in
// erzeugnisBestandUebersicht()). Auslagern und Abfüllen gehen immer von so
// einem Posten aus - die Felder kommen als versteckte Werte aus dem Dialog.
type ErzeugnisPosten = {
  erzeugnistypId: string;
  sorteId: string | null;
  zustand: string | null;
  gebindeId: string | null;
  lagerortId: string | null;
};

function postenAusFormular(formData: FormData): ErzeugnisPosten | null {
  const erzeugnistypId = textOderUndefined(formData.get("erzeugnistypId"));
  if (!erzeugnistypId) return null;
  return {
    erzeugnistypId,
    sorteId: textOderUndefined(formData.get("sorteId")) ?? null,
    zustand: honigZustandAusFormular(formData),
    gebindeId: textOderUndefined(formData.get("gebindeId")) ?? null,
    lagerortId: textOderUndefined(formData.get("lagerortId")) ?? null,
  };
}

// Was von einem Posten gerade im Lager liegt (Stückzahl nur mit Gebinde).
async function postenBestand(posten: ErzeugnisPosten): Promise<{ menge: number; anzahl: number }> {
  const summe = await prisma.erzeugnisBuchung.aggregate({
    where: posten,
    _sum: { menge: true, anzahl: true },
  });
  return { menge: summe._sum.menge ?? 0, anzahl: summe._sum.anzahl ?? 0 };
}

function datumAusFormular(formData: FormData): Date {
  const datumText = textOderUndefined(formData.get("datum"));
  return datumText ? new Date(datumText) : new Date();
}

// Auf Gramm genau statt auf 100 g (runden()), sonst würde z.B. ein Glas
// 125 g als 0,1 kg gebucht und der Bestand liefe mit jeder Buchung weg.
function aufGramm(menge: number): number {
  return Math.round(menge * 1000) / 1000;
}

// Einlagern (Zugang). Erzeugnistyp entweder bestehend (erzeugnistypId) oder
// neu benannt (neuerTyp), Gebinde bestehend oder neu (neuesGebinde +
// Inhalt) - beides wird dann gleich dauerhaft angelegt. Ohne Gebinde zählt
// die eingetippte Menge, mit Gebinde Stückzahl × Inhalt.
export async function erzeugnisEinlagern(formData: FormData): Promise<{ fehler: string } | void> {
  const neuerTyp = textOderUndefined(formData.get("neuerTyp"));
  const erzeugnistypId = textOderUndefined(formData.get("erzeugnistypId"));

  let endgueltigeErzeugnistypId: string;
  if (neuerTyp) {
    const bestehender = await prisma.erzeugnistyp.findFirst({
      where: { name: { equals: neuerTyp, mode: "insensitive" } },
    });
    endgueltigeErzeugnistypId =
      bestehender?.id ??
      (
        await prisma.erzeugnistyp.create({
          data: {
            name: neuerTyp,
            einheit: textOderUndefined(formData.get("neueEinheit")) ?? "kg",
            reihenfolge: await naechsteErzeugnisReihenfolge(),
          },
        })
      ).id;
  } else if (erzeugnistypId) {
    endgueltigeErzeugnistypId = erzeugnistypId;
  } else {
    return { fehler: "Bitte ein Erzeugnis wählen." };
  }

  let gebinde: { id: string; name: string; inhalt: number } | null = null;
  const neuesGebinde = await gebindeFindenOderAnlegen(endgueltigeErzeugnistypId, formData);
  if (neuesGebinde && "fehler" in neuesGebinde) return neuesGebinde;
  if (neuesGebinde) {
    gebinde = neuesGebinde;
  } else {
    const gebindeId = textOderUndefined(formData.get("gebindeId"));
    if (gebindeId) {
      gebinde = await prisma.gebinde.findUnique({ where: { id: gebindeId }, select: { id: true, name: true, inhalt: true } });
    }
  }

  let menge: number;
  let anzahl: number | null = null;
  if (gebinde) {
    const anzahlRoh = zahlOderNull(formData.get("anzahl"));
    if (anzahlRoh === null || Math.round(anzahlRoh) <= 0) return { fehler: "Die Anzahl muss mindestens 1 sein." };
    anzahl = Math.round(anzahlRoh);
    menge = aufGramm(gebinde.inhalt * anzahl);
  } else {
    const mengeRoh = zahlOderNull(formData.get("menge"));
    if (mengeRoh === null || mengeRoh <= 0) return { fehler: "Die Menge muss größer als 0 sein." };
    menge = aufGramm(mengeRoh);
  }

  // Warenwert: Preis aus dem Fenster (nur mit eingeschaltetem Warenwert
  // vorhanden) landet in der Preisliste.
  const preis = preisLesen(formData, "preis");
  if (preis === "falsch") return { fehler: "Bitte den Preis als Zahl eintragen, z.B. 4,50." };

  const daten = {
    erzeugnistypId: endgueltigeErzeugnistypId,
    datum: datumAusFormular(formData),
    grund: textOderUndefined(formData.get("grund")) ?? null,
    notizen: textOderUndefined(formData.get("notizen")) ?? null,
    sorteId: await sorteIdAufloesen(formData, endgueltigeErzeugnistypId),
    zustand: honigZustandAusFormular(formData),
    gebindeId: gebinde?.id ?? null,
    lagerortId: await lagerortIdAufloesen(formData),
  };

  // Eimer einzeln wiegen (Schalter am Erzeugnis): je Eimer eine eigene
  // Nummer und Buchung mit dem echten Gewicht. Leere Felder = Nennwert.
  const typ = await prisma.erzeugnistyp.findUnique({
    where: { id: endgueltigeErzeugnistypId },
    select: { eimerEinzeln: true },
  });
  if (gebinde && anzahl && typ?.eimerEinzeln && istEimerGebinde(gebinde.name)) {
    const nennwert = gebinde.inhalt;
    const eingaben = formData.getAll("eimerGewicht");
    const gewichte: number[] = [];
    for (let index = 0; index < anzahl; index++) {
      const wert = zahlOderNull(eingaben[index] ?? null);
      const gewicht = wert === null ? nennwert : aufGramm(wert);
      if (gewicht <= 0) return { fehler: `Eimer ${index + 1}: Das Gewicht muss größer als 0 sein.` };
      if (gewicht > nennwert * 1.5) {
        return { fehler: `Eimer ${index + 1}: ${gewicht.toLocaleString("de-DE")} kg passen nicht in ${gebinde.name}.` };
      }
      gewichte.push(gewicht);
    }
    await prisma.$transaction(async (tx) => {
      const hoechste = await tx.eimer.aggregate({ where: { erzeugnistypId: endgueltigeErzeugnistypId }, _max: { nummer: true } });
      let nummer = hoechste._max.nummer ?? 0;
      for (const gewicht of gewichte) {
        nummer += 1;
        const eimer = await tx.eimer.create({ data: { erzeugnistypId: endgueltigeErzeugnistypId, nummer } });
        await tx.erzeugnisBuchung.create({ data: { ...daten, anzahl: 1, menge: gewicht, eimerId: eimer.id } });
      }
    });
    if (preis !== null) await preisMerken(endgueltigeErzeugnistypId, daten.sorteId, gebinde, preis);
    revalidatePath(LAGER_PFAD, "layout");
    revalidatePath(LAGER_EINSTELLUNGEN_PFAD);
    return;
  }

  await prisma.erzeugnisBuchung.create({ data: { ...daten, menge, anzahl } });
  if (preis !== null) await preisMerken(endgueltigeErzeugnistypId, daten.sorteId, gebinde, preis);

  revalidatePath(LAGER_PFAD, "layout");
  revalidatePath(LAGER_EINSTELLUNGEN_PFAD);
}

// Einzeln geführte Eimer eines Postens, die noch etwas enthalten - mit dem
// Gewicht, das gerade drin ist (Summe ihrer Buchungen), nach Nummer.
async function offeneEimer(posten: ErzeugnisPosten): Promise<EimerEinheit[]> {
  const summen = await prisma.erzeugnisBuchung.groupBy({
    by: ["eimerId"],
    where: { ...posten, eimerId: { not: null } },
    _sum: { menge: true },
  });
  const gewichte = new Map(
    summen
      .filter((summe) => summe.eimerId && (summe._sum.menge ?? 0) >= 0.0005)
      .map((summe) => [summe.eimerId as string, aufGramm(summe._sum.menge ?? 0)]),
  );
  if (gewichte.size === 0) return [];
  const eimer = await prisma.eimer.findMany({
    where: { id: { in: [...gewichte.keys()] } },
    select: { id: true, nummer: true },
    orderBy: { nummer: "asc" },
  });
  return eimer.map((eintrag) => ({ eimerId: eintrag.id, nummer: eintrag.nummer, gewicht: gewichte.get(eintrag.id) ?? 0 }));
}

// Welche Eimer ausgelagert oder abgefüllt werden. Mit Eimerwahl im Dialog
// (Feld "eimerAuswahl") genau die angehakten plus eine Anzahl Eimer ohne
// Einzelgewicht, sonst alle der Reihe nach: einzeln geführte zuerst, dann
// die ohne Einzelgewicht mit ihrem Nennwert.
async function eimerFuerAbgang(
  formData: FormData,
  posten: ErzeugnisPosten,
  nennwert: number,
  bestandStueck: number,
): Promise<{ einheiten: EimerEinheit[]; gewaehlt: boolean } | { fehler: string }> {
  const offen = await offeneEimer(posten);
  const ohne = Math.max(bestandStueck - offen.length, 0);
  const ohneEinheit = (): EimerEinheit => ({ eimerId: null, nummer: null, gewicht: nennwert });
  if (formData.get("eimerAuswahl") === "ja") {
    const ids = new Set(formData.getAll("eimerId").map((wert) => wert.toString()));
    const gewaehlt = offen.filter((eimer) => eimer.eimerId && ids.has(eimer.eimerId));
    if (gewaehlt.length !== ids.size) return { fehler: "Ein gewählter Eimer ist nicht mehr auf Lager. Bitte neu öffnen." };
    const ohneAnzahl = Math.round(zahlOderNull(formData.get("ohneEinzelgewicht")) ?? 0);
    if (ohneAnzahl < 0 || ohneAnzahl > ohne) {
      return { fehler: `Ohne Einzelgewicht ${ohne === 1 ? "ist" : "sind"} nur ${ohne} auf Lager.` };
    }
    const einheiten = [...gewaehlt, ...Array.from({ length: ohneAnzahl }, ohneEinheit)];
    if (einheiten.length === 0) return { fehler: "Bitte mindestens einen Eimer wählen." };
    return { einheiten, gewaehlt: true };
  }
  return { einheiten: [...offen, ...Array.from({ length: ohne }, ohneEinheit)], gewaehlt: false };
}

// Abgangs-Buchungen für ganz geleerte Eimer: einzeln geführte je eine
// Buchung, die ohne Einzelgewicht zusammen in einer.
function eimerAbgaenge(
  einheiten: EimerEinheit[],
  basis: Omit<Prisma.ErzeugnisBuchungCreateManyInput, "menge">,
): Prisma.ErzeugnisBuchungCreateManyInput[] {
  const buchungen: Prisma.ErzeugnisBuchungCreateManyInput[] = einheiten
    .filter((einheit) => einheit.eimerId)
    .map((einheit) => ({ ...basis, eimerId: einheit.eimerId, anzahl: -1, menge: -einheit.gewicht }));
  const ohne = einheiten.filter((einheit) => !einheit.eimerId);
  if (ohne.length > 0) {
    buchungen.push({
      ...basis,
      anzahl: -ohne.length,
      menge: -aufGramm(ohne.reduce((summe, einheit) => summe + einheit.gewicht, 0)),
    });
  }
  return buchungen;
}

// Auslagern (Abgang) von einem bestimmten Posten - nie mehr, als dort liegt,
// damit der Bestand nicht ins Minus rutscht. Bei Gebinden mit einzeln
// geführten Eimern geht das echte Gewicht der Eimer raus, nicht der Nennwert.
export async function erzeugnisAuslagern(formData: FormData): Promise<{ fehler: string } | void> {
  const posten = postenAusFormular(formData);
  if (!posten) return { fehler: "Dieser Posten wurde nicht gefunden." };
  const bestand = await postenBestand(posten);
  const grund = textOderUndefined(formData.get("grund")) ?? null;
  const verkauf = istVerkaufGrund(grund);
  const basis = {
    ...posten,
    datum: datumAusFormular(formData),
    grund,
    notizen: textOderUndefined(formData.get("notizen")) ?? null,
    kaeufer: verkauf ? (textOderUndefined(formData.get("kaeufer")) ?? null) : null,
  };
  const erloes = verkauf ? betragAusText(formData.get("preis")?.toString()) : null;

  if (posten.gebindeId) {
    const gebinde = await prisma.gebinde.findUnique({ where: { id: posten.gebindeId }, select: { inhalt: true } });
    if (!gebinde) return { fehler: "Dieses Gebinde gibt es nicht mehr." };
    const auswahl = await eimerFuerAbgang(formData, posten, gebinde.inhalt, bestand.anzahl);
    if ("fehler" in auswahl) return auswahl;
    let einheiten = auswahl.einheiten;
    if (!auswahl.gewaehlt) {
      const anzahlRoh = zahlOderNull(formData.get("anzahl"));
      if (anzahlRoh === null || Math.round(anzahlRoh) <= 0) return { fehler: "Die Anzahl muss mindestens 1 sein." };
      if (Math.round(anzahlRoh) > bestand.anzahl) {
        return { fehler: `Es sind nur noch ${Math.max(bestand.anzahl, 0)} Stück auf Lager.` };
      }
      einheiten = einheiten.slice(0, Math.round(anzahlRoh));
    }
    await prisma.erzeugnisBuchung.createManyAndReturn({ data: erloesVerteilen(eimerAbgaenge(einheiten, basis), erloes) });
  } else {
    const mengeRoh = zahlOderNull(formData.get("menge"));
    if (mengeRoh === null || mengeRoh <= 0) return { fehler: "Die Menge muss größer als 0 sein." };
    if (mengeRoh > bestand.menge + 0.0005) {
      return { fehler: `Es sind nur noch ${aufGramm(Math.max(bestand.menge, 0)).toLocaleString("de-DE")} auf Lager.` };
    }
    await prisma.erzeugnisBuchung.create({ data: { ...basis, anzahl: null, menge: -aufGramm(mengeRoh), erloes } });
  }

  revalidatePath(LAGER_PFAD, "layout");
}

// Erlös auf mehrere Buchungen eines Verkaufs (einzeln geführte Eimer) nach
// Gewicht aufteilen, der Rundungsrest landet bei der letzten.
function erloesVerteilen(
  buchungen: Prisma.ErzeugnisBuchungCreateManyInput[],
  erloes: number | null,
): Prisma.ErzeugnisBuchungCreateManyInput[] {
  if (erloes === null || buchungen.length === 0) return buchungen;
  const gesamt = buchungen.reduce((summe, buchung) => summe + Math.abs(buchung.menge), 0);
  let verteilt = 0;
  return buchungen.map((buchung, index) => {
    const anteil =
      index === buchungen.length - 1
        ? Math.round((erloes - verteilt) * 100) / 100
        : Math.round((gesamt > 0 ? (erloes * Math.abs(buchung.menge)) / gesamt : erloes / buchungen.length) * 100) / 100;
    verteilt += anteil;
    return { ...buchung, erloes: anteil };
  });
}

// Abfüllen in einem Schritt: aus einem Posten (z.B. Eimer 25 kg) in kleinere
// Gebinde (Gläser). Gebucht werden der Abgang der Quelle, der Zugang je
// Zielgebinde (gleiche Sorte und Lagerort, Zustand wählbar) und der Rest des
// zuletzt angebrochenen Eimers: je nach Wahl bleibt er im Eimer (nur bei
// einzeln geführten), kommt als lose Menge unter "Gewicht" (Standard, weil
// sich ein halber Eimer ohne Einzelgewicht nicht führen lässt) oder wird als
// Schwund ausgebucht. Alles in einer Buchung (createMany).
export async function erzeugnisAbfuellen(formData: FormData): Promise<{ fehler: string } | void> {
  const posten = postenAusFormular(formData);
  if (!posten) return { fehler: "Dieser Posten wurde nicht gefunden." };

  const zielGebinde = await prisma.gebinde.findMany({
    where: { erzeugnistypId: posten.erzeugnistypId },
    select: { id: true, name: true, inhalt: true },
  });
  const ziele = zielGebinde
    .map((gebinde) => ({ ...gebinde, anzahl: Math.round(zahlOderNull(formData.get(`ziel-${gebinde.id}`)) ?? 0) }))
    .filter((ziel) => ziel.anzahl > 0 && ziel.id !== posten.gebindeId);
  if (ziele.length === 0) return { fehler: "Bitte angeben, in welche Gebinde abgefüllt wird." };
  const abgefuellt = aufGramm(ziele.reduce((summe, ziel) => summe + ziel.inhalt * ziel.anzahl, 0));

  const bestand = await postenBestand(posten);
  const datum = datumAusFormular(formData);
  const zielZustand = formData.has("zielZustand")
    ? (() => {
        const wert = formData.get("zielZustand")?.toString();
        return wert && wert in HONIG_ZUSTAENDE ? wert : null;
      })()
    : posten.zustand;

  const buchungen: Prisma.ErzeugnisBuchungCreateManyInput[] = [];
  if (posten.gebindeId) {
    const quelle = zielGebinde.find((gebinde) => gebinde.id === posten.gebindeId);
    if (!quelle) return { fehler: "Dieses Gebinde gibt es nicht mehr." };
    const auswahl = await eimerFuerAbgang(formData, posten, quelle.inhalt, bestand.anzahl);
    if ("fehler" in auswahl) return auswahl;
    const { anteile, fehlt } = abfuellenAufteilen(auswahl.einheiten, abgefuellt);
    if (fehlt > 0) {
      const vorhanden = aufGramm(auswahl.einheiten.reduce((summe, einheit) => summe + einheit.gewicht, 0));
      return {
        fehler: auswahl.gewaehlt
          ? `Das sind ${abgefuellt.toLocaleString("de-DE")} kg, in den gewählten Eimern sind nur ${vorhanden.toLocaleString("de-DE")} kg.`
          : `Dafür reicht der Bestand nicht: ${abgefuellt.toLocaleString("de-DE")} kg abgefüllt, auf Lager ${vorhanden.toLocaleString("de-DE")} kg.`,
      };
    }
    const basis = { ...posten, datum, grund: "Abfüllen" };
    const angebrochen = anteile.find((anteil) => anteil.rest >= 0.0005);
    const restArt = formData.get("rest")?.toString();
    if (angebrochen && restArt === "eimer" && angebrochen.eimerId) {
      // Rest bleibt im Eimer: nur das Entnommene abbuchen, der Eimer zählt weiter.
      buchungen.push(...eimerAbgaenge(anteile.filter((anteil) => anteil !== angebrochen), basis));
      buchungen.push({ ...basis, eimerId: angebrochen.eimerId, anzahl: 0, menge: -angebrochen.entnommen });
    } else {
      buchungen.push(...eimerAbgaenge(anteile.filter((anteil) => anteil !== angebrochen), basis));
      if (angebrochen && restArt === "schwund") {
        // Der Eimer ist leer, der Rest ging verloren (klebt am Eimer, Probe ...).
        buchungen.push({ ...basis, eimerId: angebrochen.eimerId, anzahl: -1, menge: -angebrochen.entnommen });
        buchungen.push({ ...basis, eimerId: angebrochen.eimerId, anzahl: 0, menge: -angebrochen.rest, grund: "Schwund" });
      } else if (angebrochen) {
        buchungen.push({ ...basis, eimerId: angebrochen.eimerId, anzahl: -1, menge: -angebrochen.gewicht });
        buchungen.push({ ...posten, gebindeId: null, datum, grund: "Rest aus Abfüllen", anzahl: null, menge: angebrochen.rest });
      }
    }
  } else {
    if (abgefuellt > bestand.menge + 0.0005) {
      return { fehler: `Das sind ${abgefuellt.toLocaleString("de-DE")}, auf Lager ist nur ${aufGramm(Math.max(bestand.menge, 0)).toLocaleString("de-DE")}.` };
    }
    buchungen.push({ ...posten, datum, grund: "Abfüllen", anzahl: null, menge: -abgefuellt });
  }
  for (const ziel of ziele) {
    buchungen.push({
      ...posten,
      zustand: zielZustand,
      gebindeId: ziel.id,
      datum,
      grund: "Abfüllen",
      anzahl: ziel.anzahl,
      menge: aufGramm(ziel.inhalt * ziel.anzahl),
    });
  }

  await prisma.erzeugnisBuchung.createManyAndReturn({ data: buchungen });
  revalidatePath(LAGER_PFAD, "layout");
}

// Eimer ohne Einzelgewicht (eingelagert, bevor der Schalter an war)
// nachwiegen: je Eimer wird der Nennwert aus- und das echte Gewicht als neuer
// nummerierter Eimer wieder eingebucht. Leere Felder bleiben ohne Gewicht.
export async function eimerNachwiegen(formData: FormData): Promise<{ fehler: string } | void> {
  const posten = postenAusFormular(formData);
  if (!posten?.gebindeId) return { fehler: "Dieser Posten wurde nicht gefunden." };
  const gebinde = await prisma.gebinde.findUnique({ where: { id: posten.gebindeId }, select: { name: true, inhalt: true } });
  if (!gebinde) return { fehler: "Dieses Gebinde gibt es nicht mehr." };
  const bestand = await postenBestand(posten);
  const ohne = Math.max(bestand.anzahl - (await offeneEimer(posten)).length, 0);

  const gewichte: number[] = [];
  for (const [index, eingabe] of formData.getAll("eimerGewicht").entries()) {
    const wert = zahlOderNull(eingabe);
    if (wert === null) continue;
    if (wert <= 0) return { fehler: `Eimer ${index + 1}: Das Gewicht muss größer als 0 sein.` };
    if (wert > gebinde.inhalt * 1.5) {
      return { fehler: `Eimer ${index + 1}: ${wert.toLocaleString("de-DE")} kg passen nicht in ${gebinde.name}.` };
    }
    gewichte.push(aufGramm(wert));
  }
  if (gewichte.length === 0) return { fehler: "Bitte mindestens ein Gewicht eintragen." };
  if (gewichte.length > ohne) return { fehler: `Ohne Einzelgewicht ${ohne === 1 ? "ist" : "sind"} nur ${ohne} auf Lager.` };

  const basis = { ...posten, datum: datumAusFormular(formData), grund: "Nachwiegen" };
  await prisma.$transaction(async (tx) => {
    await tx.erzeugnisBuchung.create({
      data: { ...basis, anzahl: -gewichte.length, menge: -aufGramm(gebinde.inhalt * gewichte.length) },
    });
    const hoechste = await tx.eimer.aggregate({ where: { erzeugnistypId: posten.erzeugnistypId }, _max: { nummer: true } });
    let nummer = hoechste._max.nummer ?? 0;
    for (const gewicht of gewichte) {
      nummer += 1;
      const eimer = await tx.eimer.create({ data: { erzeugnistypId: posten.erzeugnistypId, nummer } });
      await tx.erzeugnisBuchung.create({ data: { ...basis, anzahl: 1, menge: gewicht, eimerId: eimer.id } });
    }
  });
  revalidatePath(LAGER_PFAD, "layout");
}

// Schalter "Eimer einzeln wiegen" je Erzeugnis. Ausschalten löscht nichts:
// die Gewichte bleiben gespeichert, die Liste zeigt nur wieder Anzahl und kg.
export async function eimerEinzelnSetzen(erzeugnistypId: string, an: boolean) {
  await prisma.erzeugnistyp.update({ where: { id: erzeugnistypId }, data: { eimerEinzeln: an } });
  revalidatePath(LAGER_PFAD, "layout");
  revalidatePath(LAGER_EINSTELLUNGEN_PFAD);
}

// Warenwert im Lager ein- oder ausschalten. Aus lässt die Preise stehen.
export async function warenwertSetzen(an: boolean) {
  await prisma.lagereinstellung.upsert({
    where: { id: "standard" },
    create: { id: "standard", warenwert: an },
    update: { warenwert: an },
  });
  revalidatePath(LAGER_PFAD, "layout");
  revalidatePath(LAGER_EINSTELLUNGEN_PFAD);
}

// Preis aus einem Formularfeld: leer = null, "4,50 €" geht, Unsinn = "falsch".
function preisLesen(formData: FormData, feld: string): number | null | "falsch" {
  const text = (formData.get(feld) ?? "").toString().replace(/€/g, "").trim();
  if (text === "") return null;
  const zahl = zahlOderNull(text);
  return zahl === null || zahl < 0 || zahl > 1_000_000 ? "falsch" : Math.round(zahl * 100) / 100;
}

// Preisliste eines Erzeugnisses speichern (Einstellungen -> Lager):
// "preis" je Einheit und "preis-<gebindeId>" je Stück ohne Sorte,
// "sorte-<sorteId>" und "sorte-<sorteId>-<gebindeId>" je Sorte. Leeres Feld
// = kein Preis (bei Sorten: Standard). Eimer haben keinen Stückpreis.
export async function warenwertPreiseSpeichern(formData: FormData): Promise<{ fehler: string } | void> {
  const erzeugnistypId = textOderUndefined(formData.get("erzeugnistypId"));
  if (!erzeugnistypId) return { fehler: "Erzeugnis fehlt." };
  const typ = await prisma.erzeugnistyp.findUnique({
    where: { id: erzeugnistypId },
    select: { gebinde: { select: { id: true, name: true } }, sorten: { select: { id: true } } },
  });
  if (!typ) return { fehler: "Das Erzeugnis gibt es nicht mehr." };
  const stueckGebinde = typ.gebinde.filter((gebinde) => jeStueck(gebinde));

  const preis = preisLesen(formData, "preis");
  const gebindePreise = stueckGebinde.map((gebinde) => ({ id: gebinde.id, preis: preisLesen(formData, `preis-${gebinde.id}`) }));
  const sortenPreise = typ.sorten.map((sorte) => ({
    id: sorte.id,
    preis: preisLesen(formData, `sorte-${sorte.id}`),
    gebinde: stueckGebinde.map((gebinde) => ({
      id: gebinde.id,
      preis: preisLesen(formData, `sorte-${sorte.id}-${gebinde.id}`),
    })),
  }));
  const alle = [preis, ...gebindePreise.map((e) => e.preis), ...sortenPreise.flatMap((s) => [s.preis, ...s.gebinde.map((g) => g.preis)])];
  if (alle.includes("falsch")) return { fehler: "Bitte Preise als Zahl eintragen, z.B. 4,50." };

  await prisma.$transaction(async (tx) => {
    await tx.erzeugnistyp.update({ where: { id: erzeugnistypId }, data: { preis: preis as number | null } });
    for (const eintrag of gebindePreise) {
      await tx.gebinde.update({ where: { id: eintrag.id }, data: { preis: eintrag.preis as number | null } });
    }
    for (const sorte of sortenPreise) {
      await tx.sorte.update({ where: { id: sorte.id }, data: { preis: sorte.preis as number | null } });
      await tx.sortenGebindePreis.deleteMany({ where: { sorteId: sorte.id } });
      const gesetzt = sorte.gebinde.filter((g) => g.preis !== null);
      if (gesetzt.length > 0) {
        await tx.sortenGebindePreis.createMany({
          data: gesetzt.map((g) => ({ sorteId: sorte.id, gebindeId: g.id, preis: g.preis as number })),
        });
      }
    }
  });
  revalidatePath(LAGER_PFAD, "layout");
  revalidatePath(LAGER_EINSTELLUNGEN_PFAD);
}

// Preis aus dem Einlagern-Fenster in die Preisliste übernehmen: je Stück für
// Gläser und andere feste Gebinde, sonst je Einheit; mit Sorte bei der Sorte.
async function preisMerken(
  erzeugnistypId: string,
  sorteId: string | null,
  gebinde: { id: string; name: string } | null,
  preis: number,
) {
  if (gebinde && jeStueck(gebinde)) {
    if (sorteId) {
      await prisma.sortenGebindePreis.upsert({
        where: { sorteId_gebindeId: { sorteId, gebindeId: gebinde.id } },
        create: { sorteId, gebindeId: gebinde.id, preis },
        update: { preis },
      });
    } else {
      await prisma.gebinde.update({ where: { id: gebinde.id }, data: { preis } });
    }
  } else if (sorteId) {
    await prisma.sorte.update({ where: { id: sorteId }, data: { preis } });
  } else {
    await prisma.erzeugnistyp.update({ where: { id: erzeugnistypId }, data: { preis } });
  }
}

export async function erzeugnisBuchungLoeschen(buchungId: string) {
  await prisma.erzeugnisBuchung.delete({ where: { id: buchungId } });
  revalidatePath(LAGER_PFAD, "layout");
}

// Eigene Erzeugnisse (Met, Kerzen, Holz ...) anlegen, umbenennen, löschen.
// Honig, Wachs, Propolis und Pollen sind vorgegeben und bleiben fest: Honig
// braucht die Ernte-Übernahme aus der Stockkarte.
async function naechsteErzeugnisReihenfolge(): Promise<number> {
  const letzte = await prisma.erzeugnistyp.aggregate({ _max: { reihenfolge: true } });
  return (letzte._max.reihenfolge ?? 0) + 1;
}

export async function erzeugnistypAnlegen(formData: FormData): Promise<{ fehler: string } | void> {
  const name = textOderUndefined(formData.get("name"));
  if (!name) return { fehler: "Bitte einen Namen eingeben." };
  const einheit = textOderUndefined(formData.get("einheit")) ?? "kg";
  const vorhanden = await prisma.erzeugnistyp.findFirst({ where: { name: { equals: name, mode: "insensitive" } } });
  if (vorhanden) return { fehler: `„${vorhanden.name}“ gibt es schon.` };
  await prisma.erzeugnistyp.create({ data: { name, einheit, reihenfolge: await naechsteErzeugnisReihenfolge() } });
  revalidatePath(LAGER_PFAD, "layout");
  revalidatePath(LAGER_EINSTELLUNGEN_PFAD);
}

export async function erzeugnistypUmbenennen(formData: FormData): Promise<{ fehler: string } | void> {
  const id = textOderUndefined(formData.get("id"));
  const name = textOderUndefined(formData.get("name"));
  if (!id) return { fehler: "Dieses Erzeugnis wurde nicht gefunden." };
  if (!name) return { fehler: "Bitte einen Namen eingeben." };
  const typ = await prisma.erzeugnistyp.findUnique({ where: { id }, include: { _count: { select: { buchungen: true } } } });
  if (!typ) return { fehler: "Dieses Erzeugnis wurde nicht gefunden." };
  if (typ.vorgegeben) return { fehler: "Dieses Erzeugnis ist fest und lässt sich nicht umbenennen." };
  const doppelt = await prisma.erzeugnistyp.findFirst({
    where: { id: { not: id }, name: { equals: name, mode: "insensitive" } },
  });
  if (doppelt) return { fehler: `„${doppelt.name}“ gibt es schon.` };
  // Die Einheit ändert sich nur, solange es noch keine Buchungen gibt,
  // sonst stimmen die alten Mengen nicht mehr.
  const einheit = textOderUndefined(formData.get("einheit"));
  await prisma.erzeugnistyp.update({
    where: { id },
    data: { name, ...(einheit && typ._count.buchungen === 0 ? { einheit } : {}) },
  });
  revalidatePath(LAGER_PFAD, "layout");
  revalidatePath(LAGER_EINSTELLUNGEN_PFAD);
}

// Löschen nur bei eigenen Erzeugnissen ohne Bestand. Buchungen, Gebinde und
// Sorten des Erzeugnisses gehen dabei mit (onDelete: Cascade).
export async function erzeugnistypLoeschen(id: string): Promise<{ fehler: string } | void> {
  const typ = await prisma.erzeugnistyp.findUnique({ where: { id } });
  if (!typ) return;
  if (typ.vorgegeben) return { fehler: "Dieses Erzeugnis ist fest und lässt sich nicht löschen." };
  const summe = await prisma.erzeugnisBuchung.aggregate({ where: { erzeugnistypId: id }, _sum: { menge: true } });
  if (Math.abs(summe._sum.menge ?? 0) >= 0.0005) {
    return { fehler: `Von „${typ.name}“ liegt noch etwas auf Lager. Bitte erst auslagern.` };
  }
  await prisma.erzeugnistyp.delete({ where: { id } });
  revalidatePath(LAGER_PFAD, "layout");
  revalidatePath(LAGER_EINSTELLUNGEN_PFAD);
}

// Zugang aus einer Honigernte an der Stockkarte - auf Rückfrage beim
// Speichern des Eintrags (siehe StockkartenEintragFormular), nicht
// automatisch: Frank soll jede Ernte bestätigen, bevor sie den Honigbestand
// erhöht. Nur beim Neuanlegen eines Eintrags möglich (nicht beim Bearbeiten),
// damit eine Ernte nicht durch mehrfaches Speichern mehrfach gebucht wird.
// Die an der Stockkarte eingetragene Honigart wandert automatisch als Sorte
// mit - Gebinde/Lagerort sind hier bewusst nicht abgefragt (das würde die
// schnelle Rückfrage am Stand überladen), lassen sich aber jederzeit
// nachträglich in der Lagerverwaltung ergänzen.
async function honigZugangAusPopup(
  volkId: string,
  eintragId: string,
  datum: Date,
  formData: FormData
) {
  if (formData.get("lagerZugangJa") !== "ja") return;
  const menge = zahlOderNull(formData.get("lagerZugangMengeKg"));
  if (menge === null || menge <= 0) return;

  const honigtyp =
    (await prisma.erzeugnistyp.findFirst({ where: { name: "Honig" } })) ??
    (await prisma.erzeugnistyp.create({ data: { name: "Honig", einheit: "kg", vorgegeben: true } }));

  // Die an der Stockkarte eingetragene Honigart wandert automatisch in den
  // Sorten-Katalog - passt sie (unabhängig von Groß-/Kleinschreibung) zu
  // einer schon vorhandenen Sorte, wird die verknüpft, sonst legt sie eine
  // neue (nicht vorgegebene) Sorte an. So sammelt sich der Katalog von
  // selbst, ohne dass am Stand extra etwas ausgewählt werden müsste.
  const honigart = textOderUndefined(formData.get("honigart"));
  let sorteId: string | null = null;
  if (honigart) {
    const bestehende = await prisma.sorte.findFirst({
      where: { erzeugnistypId: honigtyp.id, name: { equals: honigart, mode: "insensitive" } },
    });
    sorteId = bestehende?.id ?? (await prisma.sorte.create({ data: { erzeugnistypId: honigtyp.id, name: honigart } })).id;
  }

  await prisma.erzeugnisBuchung.create({
    data: {
      erzeugnistypId: honigtyp.id,
      menge: runden(menge),
      datum,
      grund: "Ernte",
      sorteId,
      volkId,
      stockkartenEintragId: eintragId,
    },
  });

  revalidatePath(LAGER_PFAD, "layout");
}

// Merkt sich die Ansicht der Königinnen-Übersicht (Liste oder Kacheln) für
// ein Jahr. Als Cookie, damit der Server die Seite gleich in der gewählten
// Ansicht ausliefert.
export async function koeniginnenAnsichtSetzen(ansicht: "liste" | "kacheln") {
  const cookieStore = await cookies();
  cookieStore.set(ANSICHT_COOKIE, ansicht === "kacheln" ? "kacheln" : "liste", {
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
}
