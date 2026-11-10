import Link from "next/link";
import type { Standtyp } from "@/generated/prisma/enums";
import type { Faelligkeit } from "@/lib/faelligkeit";
import type { BeurteilungsEinstufung } from "@/components/stockkarten-eintrag-felder";
import { kurzesDatum } from "@/lib/honig";
import { StandtypBadge } from "@/components/standtyp";
import { BienenstandFotoLightbox } from "@/components/bienenstand-foto-lightbox";
import { bienenstandFotoAktualisieren, bienenstandFotoAusschnittAktualisieren } from "@/lib/actions";
import { IconHornisse, IconKarte, IconMassnahmen, IconWarnung, IconWinkelRechts } from "@/components/icons";

// Startseite in den neuen Designs (A "Wabe", B "Klar"). Die Daten bereitet
// app/page.tsx auf, hier steht nur die Darstellung.

export type StartStand = {
  id: string;
  name: string;
  standtyp: Standtyp;
  adresse: string;
  anzahlVoelker: number;
  // Grünlandtemperatursumme als fertiger Text, ohne Waage am Stand leer.
  gts: string | null;
  letzteDurchsicht: Date | null;
  offen: number;
  dringend: number;
  /// Gesamteindruck der letzten Durchsicht je Volk (null = noch keine).
  stufen: (BeurteilungsEinstufung | null)[];
  foto: { dateiname: string | null; zoom: number; fokusX: number; fokusY: number };
};

export type StartMassnahme = {
  schluessel: string;
  text: string;
  wo: string;
  faelligAm: Date | null;
  faelligkeit: Faelligkeit;
};

export type StartDaten = {
  aktive: StartStand[];
  archivierte: StartStand[];
  zahlen: { ueberfaellig: number; heute: number; woche: number; voelker: number };
  /// Neue Velutina-Sichtungen, null wenn Velutina abgeschaltet oder nicht in BW.
  velutinaNeu: number | null;
  naechste: StartMassnahme[];
  /// Velutina-Hinweis und Schnellsuche wie im aktuellen Design.
  oben: React.ReactNode;
};

const STUFE_FARBE: Record<BeurteilungsEinstufung, string> = { gruen: "bg-ok-voll", gelb: "bg-warnung-voll", rot: "bg-gefahr-voll" };
const STUFE_TEXT: Record<BeurteilungsEinstufung, string> = { gruen: "gut", gelb: "auffällig", rot: "kritisch" };

function gruss(jetzt = new Date()) {
  const stunde = Number(
    new Intl.DateTimeFormat("de-DE", { hour: "numeric", hourCycle: "h23", timeZone: "Europe/Berlin" })
      .formatToParts(jetzt)
      .find((teil) => teil.type === "hour")?.value ?? 12
  );
  return stunde < 11 ? "Guten Morgen" : stunde < 18 ? "Guten Tag" : "Guten Abend";
}
function heuteText(jetzt = new Date()) {
  return new Intl.DateTimeFormat("de-DE", { weekday: "long", day: "numeric", month: "long", timeZone: "Europe/Berlin" }).format(jetzt);
}
function datumKurz(datum: Date) {
  return datum.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", timeZone: "Europe/Berlin" });
}
function voelkerText(anzahl: number) {
  return `${anzahl} ${anzahl === 1 ? "Volk" : "Völker"}`;
}

/* ============================== A "Wabe" ============================== */

function WabeZahl({ zahl, text, farbe, href }: { zahl: number; text: string; farbe: string; href: string }) {
  return (
    <Link href={href} className="flex flex-col gap-0.5 rounded-2xl bg-card px-3.5 pt-3 pb-2.5 shadow-md">
      <span className={`wabe-titel text-3xl leading-none font-bold ${zahl > 0 ? farbe : "text-foreground"}`}>{zahl}</span>
      <span className="text-[13px] font-semibold text-muted">{text}</span>
    </Link>
  );
}

function WabeStandKarte({ stand, gedaempft = false }: { stand: StartStand; gedaempft?: boolean }) {
  return (
    <div className={`relative flex flex-col gap-2 rounded-xl bg-card p-2 shadow-md ${gedaempft ? "opacity-70" : ""}`}>
      <Link href={`/bienenstaende/${stand.id}`} aria-label={`Bienenstand ${stand.name} öffnen`} className="absolute inset-0 z-10" />
      <BienenstandFotoLightbox
        bienenstandId={stand.id}
        dateiname={stand.foto.dateiname}
        zoom={stand.foto.zoom}
        fokusX={stand.foto.fokusX}
        fokusY={stand.foto.fokusY}
        action={bienenstandFotoAktualisieren}
        ausschnittAction={bienenstandFotoAusschnittAktualisieren}
        vorschau
        knopfKlasse="wabe-muster z-20 h-24 w-full"
      />
      <div className="flex flex-col gap-2 px-2 pt-1 pb-1.5">
        <div className="flex items-start justify-between gap-2">
          <h2 className="min-w-0 text-[19px] leading-tight font-semibold break-words">{stand.name}</h2>
          <StandtypBadge standtyp={stand.standtyp} />
        </div>
        {stand.adresse && <p className="text-sm text-muted">{stand.adresse}</p>}
        <p className="flex flex-wrap items-center gap-1.5 text-sm font-semibold text-muted">
          {stand.stufen.map((stufe, index) => (
            <span
              key={index}
              title={stufe ? `Gesamteindruck ${STUFE_TEXT[stufe]}` : "Noch keine Durchsicht"}
              className={`h-3.5 w-3.5 rounded-full ring-2 ring-card ${stufe ? STUFE_FARBE[stufe] : "bg-rand-ruhig"}`}
            />
          ))}
          <span className="ml-1">{voelkerText(stand.anzahlVoelker)}</span>
          {stand.gts && <span title="Grünlandtemperatursumme">· GTS {stand.gts}</span>}
        </p>
        <div className="mt-1 flex items-center justify-between gap-2 text-sm">
          <span className="text-muted">{stand.letzteDurchsicht ? `Durchsicht ${kurzesDatum(stand.letzteDurchsicht)}` : "Noch keine Durchsicht"}</span>
          {stand.dringend > 0 ? (
            <span className="inline-flex items-center gap-1 rounded-lg bg-gefahr-flaeche px-2 py-1 text-xs font-semibold text-gefahr">
              <IconWarnung className="h-3.5 w-3.5" />
              {stand.dringend} dringend
            </span>
          ) : stand.offen > 0 ? (
            <span className="inline-flex items-center gap-1 rounded-lg bg-flaeche px-2 py-1 text-xs font-semibold text-muted">
              <IconMassnahmen className="h-3.5 w-3.5" />
              {stand.offen} offen
            </span>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export function StartWabe({ daten }: { daten: StartDaten }) {
  return (
    <div className="flex flex-col gap-5">
      <div>
        <p className="text-xs font-bold tracking-[0.08em] text-honig-text uppercase">{heuteText()}</p>
        <h1 className="mt-1 text-[28px] leading-tight sm:text-[34px]">{gruss()}</h1>
      </div>
      <div className="grid grid-cols-3 gap-2.5 sm:grid-cols-[1fr_1fr_1fr_1.6fr]">
        <WabeZahl zahl={daten.zahlen.ueberfaellig} text="überfällig" farbe="text-gefahr" href="/massnahmen" />
        <WabeZahl zahl={daten.zahlen.heute} text="heute fällig" farbe="text-warnung" href="/massnahmen" />
        <WabeZahl zahl={daten.zahlen.woche} text="diese Woche" farbe="text-foreground" href="/massnahmen" />
        {daten.velutinaNeu !== null && (
          <Link
            href="/velutina"
            className={`col-span-3 flex items-center gap-2.5 rounded-2xl px-3.5 py-2.5 text-sm font-semibold sm:col-span-1 ${
              daten.velutinaNeu > 0 ? "bg-gefahr-flaeche text-gefahr" : "bg-ok-flaeche text-ok"
            }`}
          >
            <IconHornisse className="h-6 w-6 shrink-0" />
            {daten.velutinaNeu > 0
              ? `${daten.velutinaNeu} neue Velutina-${daten.velutinaNeu === 1 ? "Sichtung" : "Sichtungen"}`
              : "Keine neuen Velutina-Sichtungen"}
          </Link>
        )}
      </div>
      {daten.oben}
      <div className="mt-1 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-xl font-semibold">Bienenstände</h2>
        <div className="flex gap-2">
          <Link href="/karte" className="inline-flex h-10 items-center gap-1.5 rounded-md border border-rand-ruhig bg-card px-3.5 text-sm font-semibold">
            <IconKarte className="h-4 w-4" /> Karte
          </Link>
          <Link href="/bienenstaende/neu" className="inline-flex h-10 items-center rounded-md bg-accent px-3.5 text-sm font-semibold text-accent-foreground">
            + Stand
          </Link>
        </div>
      </div>
      {daten.aktive.length === 0 ? (
        <p className="rounded-xl bg-card p-5 text-center text-muted shadow-md">
          Noch kein Bienenstand angelegt. Leg mit „+ Stand“ deinen ersten Standort an.
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 xl:grid-cols-3">
          {daten.aktive.map((stand) => (
            <WabeStandKarte key={stand.id} stand={stand} />
          ))}
        </div>
      )}
      {daten.archivierte.length > 0 && (
        <>
          <h2 className="text-sm font-semibold text-muted">Archivierte Bienenstände</h2>
          <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 xl:grid-cols-3">
            {daten.archivierte.map((stand) => (
              <WabeStandKarte key={stand.id} stand={stand} gedaempft />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

/* ============================== B "Klar" ============================== */

function KlarKennzahl({ titel, zahl, unter, streifen }: { titel: string; zahl: number; unter: string; streifen?: string }) {
  return (
    <div className="relative -mt-px -ml-px flex flex-col gap-0.5 border-t border-l border-border px-4 py-3">
      {streifen && <span className={`absolute top-3 bottom-3 left-0 w-[3px] rounded-r ${streifen}`} />}
      <span className="text-xs font-bold tracking-[0.05em] text-muted uppercase">{titel}</span>
      <span className="klar-mono text-3xl leading-tight font-semibold">{zahl}</span>
      <span className="text-sm text-muted">{unter}</span>
    </div>
  );
}

const KLAR_STREIFEN = (stand: StartStand) =>
  stand.dringend > 0 ? "bg-gefahr-voll" : stand.stufen.includes("rot") ? "bg-gefahr-voll" : stand.stufen.includes("gelb") ? "bg-warnung-voll" : "bg-ok-voll";

function KlarStandZeile({ stand }: { stand: StartStand }) {
  return (
    <Link
      href={`/bienenstaende/${stand.id}`}
      className="relative grid grid-cols-[1fr_auto_auto] items-center gap-x-3 gap-y-1.5 border-b border-border py-3 pr-1 pl-4 hover:bg-flaeche sm:grid-cols-[minmax(0,2fr)_7rem_minmax(0,1.2fr)_6rem_minmax(0,1.3fr)_1.25rem]"
    >
      <span className={`absolute top-2.5 bottom-2.5 left-0 w-1 rounded ${KLAR_STREIFEN(stand)}`} />
      <span className="min-w-0">
        <b className="block font-semibold">{stand.name}</b>
        <span className="block truncate text-sm text-muted">{stand.adresse}</span>
      </span>
      <span className="hidden sm:block">
        <StandtypBadge standtyp={stand.standtyp} />
      </span>
      <span className="col-span-3 flex items-center gap-2 sm:col-span-1 sm:flex-col sm:items-start sm:gap-1">
        <span className="flex h-2 w-24 gap-0.5">
          {stand.stufen.map((stufe, index) => (
            <i key={index} className={`flex-1 rounded-sm ${stufe ? STUFE_FARBE[stufe] : "bg-rand-ruhig"}`} />
          ))}
        </span>
        <span className="text-sm text-muted">{voelkerText(stand.anzahlVoelker)}</span>
        {stand.gts && <span className="text-sm text-muted" title="Grünlandtemperatursumme">GTS {stand.gts}</span>}
      </span>
      <span className="klar-mono hidden text-sm sm:block">{stand.letzteDurchsicht ? kurzesDatum(stand.letzteDurchsicht) : "–"}</span>
      <span className="row-start-1 col-start-2 text-right text-sm sm:row-auto sm:col-auto sm:text-left">
        {stand.dringend > 0 && <span className="text-gefahr">{stand.dringend} dringend · </span>}
        {stand.offen} offen
      </span>
      <IconWinkelRechts className="row-start-1 col-start-3 h-4 w-4 text-muted sm:row-auto sm:col-auto" />
    </Link>
  );
}

const DATUM_FARBE: Record<Faelligkeit, string> = {
  ueberfaellig: "text-gefahr",
  heute: "text-warnung",
  bald: "text-foreground",
  spaeter: "text-muted",
  ohne: "text-muted",
};

export function StartKlar({ daten }: { daten: StartDaten }) {
  const z = daten.zahlen;
  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <h1 className="text-2xl">{gruss()}</h1>
        <span className="klar-mono text-sm text-muted">{new Date().toLocaleDateString("de-DE", { weekday: "short", day: "2-digit", month: "2-digit", year: "numeric", timeZone: "Europe/Berlin" })}</span>
      </div>
      <div className="grid grid-cols-2 overflow-hidden rounded-lg border border-border sm:grid-cols-4">
        <KlarKennzahl titel="Völker" zahl={z.voelker} unter={`${daten.aktive.length} ${daten.aktive.length === 1 ? "Stand" : "Stände"}`} />
        <KlarKennzahl titel="Überfällig" zahl={z.ueberfaellig} unter="Maßnahmen" streifen={z.ueberfaellig > 0 ? "bg-gefahr-voll" : undefined} />
        <KlarKennzahl titel="Diese Woche" zahl={z.heute + z.woche} unter={`${z.heute} davon heute`} streifen={z.heute > 0 ? "bg-warnung-voll" : undefined} />
        {daten.velutinaNeu !== null ? (
          <KlarKennzahl titel="Velutina" zahl={daten.velutinaNeu} unter="neue Sichtungen" streifen={daten.velutinaNeu > 0 ? "bg-gefahr-voll" : "bg-ok-voll"} />
        ) : (
          <KlarKennzahl titel="Offen" zahl={daten.aktive.reduce((s, x) => s + x.offen, 0)} unter="Maßnahmen gesamt" />
        )}
      </div>
      {daten.oben}
      <div className="grid grid-cols-1 gap-8 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] xl:items-start">
        <section className="flex min-w-0 flex-col gap-2.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-[13px] font-bold tracking-[0.07em] text-muted uppercase">Bienenstände</h2>
            <div className="flex gap-2">
              <Link href="/karte" className="inline-flex h-10 items-center gap-1.5 rounded-md border border-rand-bedienung bg-card px-3.5 text-sm font-semibold">
                <IconKarte className="h-4 w-4" /> Karte
              </Link>
              <Link href="/bienenstaende/neu" className="inline-flex h-10 items-center rounded-md bg-accent px-3.5 text-sm font-semibold text-accent-foreground">
                + Stand
              </Link>
            </div>
          </div>
          <div className="border-t border-foreground">
            <div className="hidden grid-cols-[minmax(0,2fr)_7rem_minmax(0,1.2fr)_6rem_minmax(0,1.3fr)_1.25rem] gap-x-3 border-b border-border py-2 pr-1 pl-4 text-xs font-bold tracking-[0.05em] text-muted uppercase sm:grid">
              <span>Stand</span>
              <span>Art</span>
              <span>Völker · Zustand</span>
              <span>Durchsicht</span>
              <span>Maßnahmen</span>
              <span />
            </div>
            {daten.aktive.map((stand) => (
              <KlarStandZeile key={stand.id} stand={stand} />
            ))}
            {daten.aktive.length === 0 && <p className="py-4 text-muted">Noch kein Bienenstand angelegt.</p>}
          </div>
          {daten.archivierte.length > 0 && (
            <details className="mt-2">
              <summary className="cursor-pointer text-sm font-semibold text-muted">Archivierte Bienenstände ({daten.archivierte.length})</summary>
              <div className="mt-2 border-t border-border opacity-75">
                {daten.archivierte.map((stand) => (
                  <KlarStandZeile key={stand.id} stand={stand} />
                ))}
              </div>
            </details>
          )}
        </section>
        <section className="flex min-w-0 flex-col gap-2.5">
          <div className="flex items-center justify-between">
            <h2 className="text-[13px] font-bold tracking-[0.07em] text-muted uppercase">Als Nächstes</h2>
            <Link href="/massnahmen" className="inline-flex items-center gap-0.5 text-sm font-semibold text-accent">
              Alle <IconWinkelRechts className="h-4 w-4" />
            </Link>
          </div>
          <ul className="border-t border-border">
            {daten.naechste.map((m) => (
              <li key={m.schluessel} className="flex gap-3 border-b border-border py-2.5">
                <span className={`klar-mono w-16 shrink-0 font-semibold whitespace-nowrap ${DATUM_FARBE[m.faelligkeit]}`}>
                  {m.faelligAm ? datumKurz(m.faelligAm) : "–"}
                </span>
                <span className="min-w-0">
                  <b className="block font-semibold">{m.text}</b>
                  <span className="block text-sm text-muted">{m.wo}</span>
                </span>
              </li>
            ))}
            {daten.naechste.length === 0 && <li className="py-3 text-muted">Keine offenen Maßnahmen.</li>}
          </ul>
        </section>
      </div>
    </div>
  );
}

