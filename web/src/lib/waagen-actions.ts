"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { verschluesseln } from "@/lib/geheim";
import { istAdmin } from "@/lib/konto";
import { waagenAbrufen } from "@/lib/waagen-abruf";

export type WaagenErgebnis = { ok: boolean; meldung: string };

function neuZeichnen() {
  revalidatePath("/", "layout");
}

async function nurAdmin() {
  if (!(await istAdmin())) throw new Error("Einstellungen darf nur der Admin ändern.");
}

// Ein leeres Passwortfeld behält das gespeicherte, wie beim E-Mail-Versand.
export async function waagenEinstellungSpeichern(formData: FormData): Promise<WaagenErgebnis> {
  await nurAdmin();
  const aktiv = formData.get("aktiv") === "on";
  const benutzer = String(formData.get("benutzer") ?? "").trim() || null;
  const neuesPasswort = String(formData.get("passwort") ?? "");

  const vorher = await prisma.waagenEinstellung.findUnique({ where: { id: "standard" } });
  const passwortVerschluesselt = !benutzer
    ? null
    : neuesPasswort
      ? verschluesseln(neuesPasswort)
      : (vorher?.passwortVerschluesselt ?? null);

  const daten = { aktiv, benutzer, passwortVerschluesselt };
  await prisma.waagenEinstellung.upsert({
    where: { id: "standard" },
    create: { id: "standard", ...daten },
    update: daten,
  });
  neuZeichnen();
  return { ok: true, meldung: aktiv ? "Gespeichert. Der Bereich Waagen ist eingeschaltet." : "Gespeichert. Der Bereich Waagen ist ausgeschaltet." };
}

export async function waagenJetztAbrufen(): Promise<WaagenErgebnis> {
  await nurAdmin();
  // Geworfene Fehler kämen im Browser ohne Text an.
  try {
    const ergebnis = await waagenAbrufen();
    neuZeichnen();
    return ergebnis;
  } catch (fehler) {
    console.error("Waagen-Abruf von Hand:", fehler);
    return { ok: false, meldung: `Abruf fehlgeschlagen: ${fehler instanceof Error ? fehler.message : "unbekannter Fehler"}` };
  }
}

export async function waageAnlegen(formData: FormData): Promise<WaagenErgebnis> {
  await nurAdmin();
  const kennung = String(formData.get("kennung") ?? "").trim().toUpperCase();
  const name = String(formData.get("name") ?? "").trim() || null;
  if (!/^[A-Z0-9]{4,12}$/.test(kennung)) {
    return { ok: false, meldung: "Bitte die Waagen-ID aus der Wolf-Adresse eintragen, z.B. G2MJ0V." };
  }
  if (await prisma.waage.findUnique({ where: { kennung } })) {
    return { ok: false, meldung: `Die Waage ${kennung} ist schon angelegt.` };
  }
  await prisma.waage.create({ data: { kennung, name } });
  neuZeichnen();
  return { ok: true, meldung: `Waage ${kennung} angelegt. Du kannst sie jetzt einem Volk zuordnen.` };
}

// Die Kennung bleibt fest: Sie gehört zur Waage bei Wolf, ein neuer Wert wäre
// eine andere Waage.
export async function waageUmbenennen(waageId: string, formData: FormData) {
  await nurAdmin();
  const name = String(formData.get("name") ?? "").trim() || null;
  await prisma.waage.update({ where: { id: waageId }, data: { name } });
  neuZeichnen();
}

// Messwerte und Tageswerte werden mitgelöscht (onDelete: Cascade).
export async function waageLoeschen(waageId: string) {
  await nurAdmin();
  await prisma.waage.delete({ where: { id: waageId } });
  neuZeichnen();
}
