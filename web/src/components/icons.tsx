// Gezeichnete Symbole für die ganze Anwendung, statt Emoji (die je nach
// Gerät/Schriftart unterschiedlich aussehen und nicht zur Akzentfarbe
// passen). Einheitlicher Stil: 20×20-Raster, Strichzeichnung in
// `currentColor`, damit Größe und Farbe über die Elternklasse steuerbar
// bleiben - siehe `web/src/components/navigation.tsx` für die Verwendung
// in der Navigation.

type IconProps = { className?: string };

export function IconHaus({ className }: IconProps) {
  return (
    <svg viewBox="0 0 20 20" fill="none" className={className} aria-hidden="true">
      <path d="M3 9.5 10 4l7 5.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M5 8.5V16h10V8.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M8 16v-4h4v4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// Klemmbrett mit Haken statt eines blanken Blattes - sonst kaum von
// IconDokument zu unterscheiden, sobald die Beschriftung fehlt.
export function IconMassnahmen({ className }: IconProps) {
  return (
    <svg viewBox="0 0 20 20" fill="none" className={className} aria-hidden="true">
      <rect x="4" y="3.5" width="12" height="14" rx="1.5" stroke="currentColor" strokeWidth="1.6" />
      <path d="M7.5 2.5h5v2.5h-5Z" fill="currentColor" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
      <path d="m6.8 9.3 1.3 1.3 2.2-2.4M6.8 13.6l1.3 1.3 2.2-2.4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M11.8 9.6h1.9M11.8 13.9h1.9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

export function IconKrone({ className }: IconProps) {
  return (
    <svg viewBox="0 0 20 20" fill="none" className={className} aria-hidden="true">
      <path d="M3.5 14.5h13l-1.2-7-3.3 2.6L10 5l-2 5.1-3.3-2.6-1.2 7Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
      <path d="M3.5 16.5h13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

// Medikamentenflasche mit Kreuz-Etikett - ein Plus im Kreis allein wurde
// eher als "Neu anlegen" gelesen als als Varroabehandlung.
export function IconBehandlung({ className }: IconProps) {
  return (
    <svg viewBox="0 0 20 20" fill="none" className={className} aria-hidden="true">
      <path d="M7 2.5h6v2.5H7Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
      <path d="M7.5 5 5.5 7.5v8.5a1.5 1.5 0 0 0 1.5 1.5h6a1.5 1.5 0 0 0 1.5-1.5V7.5L12.5 5" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
      <path d="M10 9.6v4.8M7.6 12h4.8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

export function IconEinstellungen({ className }: IconProps) {
  return (
    <svg viewBox="0 0 20 20" fill="none" className={className} aria-hidden="true">
      <line x1="4" y1="6" x2="16" y2="6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <circle cx="12.5" cy="6" r="2" fill="currentColor" />
      <line x1="4" y1="10" x2="16" y2="10" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <circle cx="7.5" cy="10" r="2" fill="currentColor" />
      <line x1="4" y1="14" x2="16" y2="14" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <circle cx="13" cy="14" r="2" fill="currentColor" />
    </svg>
  );
}

export function IconLogo({ className }: IconProps) {
  return (
    <svg viewBox="0 0 26 26" fill="none" className={className} aria-hidden="true">
      <path d="M13 2 L23 8 V18 L13 24 L3 18 V8 Z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
      <path d="M8 12 Q13 8 18 12" stroke="currentColor" strokeWidth="1.6" fill="none" strokeLinecap="round" />
      <path d="M8 15 Q13 19 18 15" stroke="currentColor" strokeWidth="1.6" fill="none" strokeLinecap="round" />
    </svg>
  );
}

export function IconKarte({ className }: IconProps) {
  return (
    <svg viewBox="0 0 20 20" fill="none" className={className} aria-hidden="true">
      <path d="M3.5 5.5 8 4l4 1.5 4-1.5v11l-4 1.5-4-1.5-4.5 1.5Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
      <path d="M8 4v11.5M12 5.5V17" stroke="currentColor" strokeWidth="1.2" />
    </svg>
  );
}

export function IconSonne({ className }: IconProps) {
  return (
    <svg viewBox="0 0 20 20" fill="none" className={className} aria-hidden="true">
      <circle cx="10" cy="10" r="3.6" stroke="currentColor" strokeWidth="1.6" />
      <path
        d="M10 2.5v2M10 15.5v2M17.5 10h-2M4.5 10h-2M15.3 4.7l-1.4 1.4M6.1 13.9l-1.4 1.4M15.3 15.3l-1.4-1.4M6.1 6.1 4.7 4.7"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function IconMond({ className }: IconProps) {
  return (
    <svg viewBox="0 0 20 20" fill="none" className={className} aria-hidden="true">
      <path
        d="M14.5 11.2a6 6 0 01-7.7-7.7 6.3 6.3 0 107.7 7.7Z"
        stroke="currentColor"
        strokeWidth="1.4"
        fill="currentColor"
        fillOpacity="0.12"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function IconKamera({ className }: IconProps) {
  return (
    <svg viewBox="0 0 20 20" fill="none" className={className} aria-hidden="true">
      <rect x="2.5" y="6" width="15" height="10.5" rx="2" stroke="currentColor" strokeWidth="1.6" />
      <path d="M7 6l1.3-2h3.4L13 6" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
      <circle cx="10" cy="11.2" r="3" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  );
}

export function IconVollbild({ className }: IconProps) {
  return (
    <svg viewBox="0 0 20 20" fill="none" className={className} aria-hidden="true">
      <path
        d="M3 7.5V3h4.5M12.5 3H17v4.5M17 12.5V17h-4.5M7.5 17H3v-4.5"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function IconVollbildSchliessen({ className }: IconProps) {
  return (
    <svg viewBox="0 0 20 20" fill="none" className={className} aria-hidden="true">
      <path
        d="M7.5 3v4.5H3M12.5 3v4.5H17M17 12.5h-4.5V17M3 12.5h4.5V17"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function IconWabenrahmen({ className }: IconProps) {
  return (
    <svg viewBox="0 0 20 20" fill="none" className={className} aria-hidden="true">
      <rect x="3" y="3" width="14" height="14" rx="1.5" stroke="currentColor" strokeWidth="1.6" />
      <path d="M3 8h14M3 13h14M8 3v14M13 3v14" stroke="currentColor" strokeWidth="1" opacity="0.6" />
    </svg>
  );
}

export function IconVarroa({ className }: IconProps) {
  return (
    <svg viewBox="0 0 20 20" fill="none" className={className} aria-hidden="true">
      <circle cx="10" cy="10" r="3.2" stroke="currentColor" strokeWidth="1.5" />
      <path
        d="M7.3 8.3 4 6.5M7 10H3.3M7.3 11.7 4 13.5M12.7 8.3 16 6.5M13 10h3.7M12.7 11.7 16 13.5"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function IconMedaille({ className }: IconProps) {
  return (
    <svg viewBox="0 0 20 20" fill="none" className={className} aria-hidden="true">
      <path d="M7 3h6l-2 6.5h-2L7 3Z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
      <circle cx="10" cy="12.5" r="4" stroke="currentColor" strokeWidth="1.5" />
      <path d="M8.4 12.5h3.2" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  );
}

export function IconHonigglas({ className }: IconProps) {
  return (
    <svg viewBox="0 0 20 20" fill="none" className={className} aria-hidden="true">
      <path d="M6 4h8v2.5H6z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
      <path d="M6.5 6.5h7l.5 2.5v6a2 2 0 01-2 2h-4a2 2 0 01-2-2v-6z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
      <path d="M6.3 11.5h7.4" stroke="currentColor" strokeWidth="1.2" opacity="0.6" />
    </svg>
  );
}

export function IconTropfen({ className }: IconProps) {
  return (
    <svg viewBox="0 0 20 20" fill="none" className={className} aria-hidden="true">
      <path
        d="M10 3.5c2.5 3.3 4.5 6 4.5 8.3a4.5 4.5 0 11-9 0c0-2.3 2-5 4.5-8.3Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function IconWaage({ className }: IconProps) {
  return (
    <svg viewBox="0 0 20 20" fill="none" className={className} aria-hidden="true">
      <path d="M10 3v13M6 16h8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M4 6h5M11 6h5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      <path
        d="M4 6l-2 4.2a2.4 2.4 0 004.8 0L4 6ZM16 6l-2 4.2a2.4 2.4 0 004.8 0L16 6Z"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function IconDokument({ className }: IconProps) {
  return (
    <svg viewBox="0 0 20 20" fill="none" className={className} aria-hidden="true">
      <path d="M6 2.5h6l3 3v11.5a1 1 0 01-1 1H6a1 1 0 01-1-1v-13.5a1 1 0 011-1Z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
      <path d="M12 2.5V6h3" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
      <path d="M7 10.5h6M7 13h6" stroke="currentColor" strokeWidth="1.2" opacity="0.6" />
    </svg>
  );
}

export function IconAnleitung({ className }: IconProps) {
  return (
    <svg viewBox="0 0 20 20" fill="none" className={className} aria-hidden="true">
      <path d="M10 5.2C8.4 4 6 3.5 3 3.6v11.6c3-.1 5.4.4 7 1.6 1.6-1.2 4-1.7 7-1.6V3.6c-3-.1-5.4.4-7 1.6Z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
      <path d="M10 5.2v11.6" stroke="currentColor" strokeWidth="1.4" />
      <path d="M5.2 7.2c1.3 0 2.5.3 3.3.8M5.2 10c1.3 0 2.5.3 3.3.8" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" opacity="0.6" />
    </svg>
  );
}

export function IconBild({ className }: IconProps) {
  return (
    <svg viewBox="0 0 20 20" fill="none" className={className} aria-hidden="true">
      <rect x="2.5" y="3.5" width="15" height="13" rx="1.5" stroke="currentColor" strokeWidth="1.4" />
      <circle cx="7" cy="8" r="1.6" stroke="currentColor" strokeWidth="1.3" />
      <path d="M3.5 15 8 10.5l3 3 2-2.3 3.5 3.8" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
    </svg>
  );
}

// Einfacher Haken - "in Ordnung" / "erledigt" in Textzeilen.
export function IconHaken({ className }: IconProps) {
  return (
    <svg viewBox="0 0 20 20" fill="none" className={className} aria-hidden="true">
      <path d="m4.5 10.5 3.5 3.5 7.5-8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function IconWarnung({ className }: IconProps) {
  return (
    <svg viewBox="0 0 20 20" fill="none" className={className} aria-hidden="true">
      <path d="M10 3 18 16H2Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
      <path d="M10 8.3v3.2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <circle cx="10" cy="13.8" r="0.9" fill="currentColor" />
    </svg>
  );
}

export function IconQrCode({ className }: IconProps) {
  return (
    <svg viewBox="0 0 20 20" fill="none" className={className} aria-hidden="true">
      <rect x="2.5" y="2.5" width="5.5" height="5.5" rx="1" stroke="currentColor" strokeWidth="1.5" />
      <rect x="4.3" y="4.3" width="1.9" height="1.9" fill="currentColor" />
      <rect x="12" y="2.5" width="5.5" height="5.5" rx="1" stroke="currentColor" strokeWidth="1.5" />
      <rect x="13.8" y="4.3" width="1.9" height="1.9" fill="currentColor" />
      <rect x="2.5" y="12" width="5.5" height="5.5" rx="1" stroke="currentColor" strokeWidth="1.5" />
      <rect x="4.3" y="13.8" width="1.9" height="1.9" fill="currentColor" />
      <path d="M12 12h2.2v2.2H12zM15.3 12h1.7v1.7h-1.7zM12 15.3h1.7v1.7H12zM14.7 14.7h2.6v2.6h-2.6z" fill="currentColor" />
    </svg>
  );
}

// Deutlicher zu erkennen als ein reiner Stift-Umriss: dieselbe Bleistift-Form,
// aber mit leichter Füllung (wie schon bei IconMond) statt nur dünner Linie -
// dadurch als Fläche statt als Strich erkennbar, auch klein und auf einem
// hellen Knopf.
export function IconBearbeiten({ className }: IconProps) {
  return (
    <svg viewBox="0 0 20 20" fill="none" className={className} aria-hidden="true">
      <path
        d="M12.3 3.7 16.3 7.7 7.2 16.8 3 17.5l.7-4.2Z"
        fill="currentColor"
        fillOpacity="0.15"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <path d="M10.8 5.2 14.8 9.2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

// Kiste/Karton für die Lagerverwaltung - Deckelkante oben, damit sie sich
// von IconDokument (Blatt) und IconHonigglas klar unterscheidet.
export function IconLager({ className }: IconProps) {
  return (
    <svg viewBox="0 0 20 20" fill="none" className={className} aria-hidden="true">
      <path d="M3 7.5 10 4l7 3.5-7 3.5-7-3.5Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
      <path d="M3 7.5V15l7 3.5V11" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
      <path d="M17 7.5V15l-7 3.5" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  );
}

export function IconAuge({ className }: IconProps) {
  return (
    <svg viewBox="0 0 20 20" fill="none" className={className} aria-hidden="true">
      <path d="M1.8 10S4.8 4.5 10 4.5 18.2 10 18.2 10 15.2 15.5 10 15.5 1.8 10 1.8 10Z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
      <circle cx="10" cy="10" r="2.4" stroke="currentColor" strokeWidth="1.4" />
    </svg>
  );
}

export function IconListe({ className }: IconProps) {
  return (
    <svg viewBox="0 0 20 20" fill="none" className={className} aria-hidden="true">
      <rect x="3" y="4" width="14" height="4.5" rx="1" stroke="currentColor" strokeWidth="1.5" />
      <rect x="3" y="11.5" width="14" height="4.5" rx="1" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}

export function IconKacheln({ className }: IconProps) {
  return (
    <svg viewBox="0 0 20 20" fill="none" className={className} aria-hidden="true">
      <rect x="3" y="3" width="6" height="6" rx="1" stroke="currentColor" strokeWidth="1.5" />
      <rect x="11" y="3" width="6" height="6" rx="1" stroke="currentColor" strokeWidth="1.5" />
      <rect x="3" y="11" width="6" height="6" rx="1" stroke="currentColor" strokeWidth="1.5" />
      <rect x="11" y="11" width="6" height="6" rx="1" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}

// Fünfzackiger Stern - gefüllt für die markierte Königin, sonst nur Umriss.
export function IconStern({ className, gefuellt = false }: IconProps & { gefuellt?: boolean }) {
  return (
    <svg viewBox="0 0 20 20" fill="none" className={className} aria-hidden="true">
      <path
        d="m10 2.6 2.2 4.6 5 .7-3.6 3.5.9 5-4.5-2.4-4.5 2.4.9-5L2.8 7.9l5-.7Z"
        fill={gefuellt ? "currentColor" : "none"}
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function IconKalender({ className }: IconProps) {
  return (
    <svg viewBox="0 0 20 20" fill="none" className={className} aria-hidden="true">
      <rect x="3" y="4.5" width="14" height="12.5" rx="1.5" stroke="currentColor" strokeWidth="1.6" />
      <path d="M3 8.5h14M7 2.8v3.4M13 2.8v3.4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

// Drei verbundene Kästchen: Mutter oben, zwei Töchter darunter.
export function IconStammbaum({ className }: IconProps) {
  return (
    <svg viewBox="0 0 20 20" fill="none" className={className} aria-hidden="true">
      <rect x="7.5" y="2.5" width="5" height="4" rx="1" stroke="currentColor" strokeWidth="1.5" />
      <rect x="2.5" y="13.5" width="5" height="4" rx="1" stroke="currentColor" strokeWidth="1.5" />
      <rect x="12.5" y="13.5" width="5" height="4" rx="1" stroke="currentColor" strokeWidth="1.5" />
      <path d="M10 6.5V10M5 13.5V10h10v3.5" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  );
}

export function IconDrucker({ className }: IconProps) {
  return (
    <svg viewBox="0 0 20 20" fill="none" className={className} aria-hidden="true">
      <path d="M6 7.5v-4h8v4" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
      <path d="M6 14H4.5a1 1 0 0 1-1-1V8.5a1 1 0 0 1 1-1h11a1 1 0 0 1 1 1V13a1 1 0 0 1-1 1H14" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
      <rect x="6" y="11.5" width="8" height="5" rx="0.5" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}

export function IconStecknadel({ className }: IconProps) {
  return (
    <svg viewBox="0 0 20 20" fill="none" className={className} aria-hidden="true">
      <path d="M10 17.5s-5-4.6-5-9a5 5 0 0 1 10 0c0 4.4-5 9-5 9Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
      <circle cx="10" cy="8.5" r="1.8" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}

// Zwei Pfeile gegeneinander - "Volk umziehen" in der Knopfleiste der Volkskachel.
export function IconUmzug({ className }: IconProps) {
  return (
    <svg viewBox="0 0 20 20" fill="none" className={className} aria-hidden="true">
      <path d="M13 3.5 16.5 7 13 10.5M16.5 7h-9M7 9.5 3.5 13 7 16.5M3.5 13h9" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// Kreis mit Haken - "Status ändern" in der Knopfleiste der Volkskachel.
export function IconStatus({ className }: IconProps) {
  return (
    <svg viewBox="0 0 20 20" fill="none" className={className} aria-hidden="true">
      <circle cx="10" cy="10" r="7.5" stroke="currentColor" strokeWidth="1.6" />
      <path d="m6.8 10.3 2.2 2.2 4.2-4.6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function IconBrief({ className }: IconProps) {
  return (
    <svg viewBox="0 0 20 20" fill="none" className={className} aria-hidden="true">
      <rect x="2.5" y="4.5" width="15" height="11" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
      <path d="m3 5.5 7 5.5 7-5.5" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  );
}

// Hornisse von oben: Kopf, gestreifter Hinterleib, zwei Flügelpaare.
export function IconHornisse({ className }: IconProps) {
  return (
    <svg viewBox="0 0 20 20" fill="none" className={className} aria-hidden="true">
      <circle cx="10" cy="4" r="1.6" stroke="currentColor" strokeWidth="1.4" />
      <ellipse cx="10" cy="7.6" rx="1.9" ry="1.8" stroke="currentColor" strokeWidth="1.4" />
      <path d="M10 9.6c2 0 2.6 2.2 2.6 3.9 0 2.2-1.3 4.5-2.6 4.5s-2.6-2.3-2.6-4.5c0-1.7.6-3.9 2.6-3.9Z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
      <path d="M7.7 12.6h4.6M7.9 15h4.2" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
      <path d="M8.2 7c-2.2-1.6-5-1.4-5.5-.3-.5 1.2 2 2.4 5.1 1.8M11.8 7c2.2-1.6 5-1.4 5.5-.3.5 1.2-2 2.4-5.1 1.8" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
      <path d="M9.2 2.6 8.1 1.2M10.8 2.6l1.1-1.4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  );
}

// Pfeil nach links - Knopf "Zurück" in der Seitennavigation.
export function IconZurueck({ className }: IconProps) {
  return (
    <svg viewBox="0 0 20 20" fill="none" className={className} aria-hidden="true">
      <path d="M16 10H4.5M9 5 4 10l5 5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// Kleiner Winkel als Trenner zwischen den Stationen des Seitenpfads.
export function IconWinkelRechts({ className }: IconProps) {
  return (
    <svg viewBox="0 0 20 20" fill="none" className={className} aria-hidden="true">
      <path d="m8 5 5 5-5 5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// Mülleimer mit Deckel für "Löschen" als Symbol-Knopf.
export function IconMuelleimer({ className }: IconProps) {
  return (
    <svg viewBox="0 0 20 20" fill="none" className={className} aria-hidden="true">
      <path d="M3.5 5.5h13M8 5.5V3.8h4v1.7" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M5 5.5 5.8 16.5h8.4L15 5.5" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
      <path d="M8.3 8.5v5M11.7 8.5v5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

/// Uhr mit Pfeil zurück: Verlauf.
export function IconVerlauf({ className }: IconProps) {
  return (
    <svg viewBox="0 0 20 20" fill="none" className={className} aria-hidden="true">
      <path d="M3.5 10a6.5 6.5 0 1 0 1.9-4.6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M3.2 2.8v3.1h3.1" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M10 6.5V10l2.5 1.6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/// Zwei Pfeile im Kreis: Version und Updates (Einstellungen -> System).
export function IconAktualisieren({ className }: IconProps) {
  return (
    <svg viewBox="0 0 20 20" fill="none" className={className} aria-hidden="true">
      <path d="M16 8.5A6.2 6.2 0 0 0 4.6 6.3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M16.3 3.8v4.7h-4.7" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M4 11.5a6.2 6.2 0 0 0 11.4 2.2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M3.7 16.2v-4.7h4.7" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/// Kopf und Schultern: Bienenhalter (Einstellungen).
export function IconPerson({ className }: IconProps) {
  return (
    <svg viewBox="0 0 20 20" fill="none" className={className} aria-hidden="true">
      <circle cx="10" cy="7" r="3" stroke="currentColor" strokeWidth="1.6" />
      <path d="M4.5 16.5c.8-3 3-4.5 5.5-4.5s4.7 1.5 5.5 4.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

/// Zwei Personen: Testzugänge.
export function IconPersonen({ className }: IconProps) {
  return (
    <svg viewBox="0 0 20 20" fill="none" className={className} aria-hidden="true">
      <circle cx="7.5" cy="7.5" r="2.5" stroke="currentColor" strokeWidth="1.6" />
      <path d="M3 16c.6-2.5 2.4-3.8 4.5-3.8s3.9 1.3 4.5 3.8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <circle cx="13.5" cy="6.5" r="2" stroke="currentColor" strokeWidth="1.5" />
      <path d="M13 10.8c2 0 3.5 1.1 4 3.2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

/// Malerpalette: Styleguide.
export function IconPalette({ className }: IconProps) {
  return (
    <svg viewBox="0 0 20 20" fill="none" className={className} aria-hidden="true">
      <path d="M10 3a7 7 0 1 0 0 14c1.2 0 1.6-.9 1.2-1.8-.5-1 .1-2.2 1.3-2.2H15a2.5 2.5 0 0 0 2-2.5A7 7 0 0 0 10 3Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
      <circle cx="6.8" cy="9" r="1" fill="currentColor" />
      <circle cx="9.5" cy="6.3" r="1" fill="currentColor" />
      <circle cx="13" cy="7.3" r="1" fill="currentColor" />
    </svg>
  );
}

// Fenster mit Seitenleiste: Gesamt-Design der App (Einstellungen -> Design).
export function IconDesign({ className }: IconProps) {
  return (
    <svg viewBox="0 0 20 20" fill="none" className={className} aria-hidden="true">
      <rect x="2.75" y="3.75" width="14.5" height="12.5" rx="2" stroke="currentColor" strokeWidth="1.6" />
      <path d="M7.5 3.75v12.5" stroke="currentColor" strokeWidth="1.6" />
      <path d="M10.5 7.5h4M10.5 10.5h3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

/// Vorhängeschloss: Passwort ändern.
export function IconSchloss({ className }: IconProps) {
  return (
    <svg viewBox="0 0 20 20" fill="none" className={className} aria-hidden="true">
      <rect x="4.5" y="9" width="11" height="8" rx="1.5" stroke="currentColor" strokeWidth="1.6" />
      <path d="M7 9V6.5a3 3 0 0 1 6 0V9" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <circle cx="10" cy="13" r="1" fill="currentColor" />
    </svg>
  );
}

// Preisschild: Verkäufe (Lager -> Verkäufe).
export function IconVerkauf({ className }: IconProps) {
  return (
    <svg viewBox="0 0 20 20" fill="none" className={className} aria-hidden="true">
      <path
        d="M10.6 3H16a1 1 0 011 1v5.4a1 1 0 01-.3.7l-7 7a1 1 0 01-1.4 0l-5.4-5.4a1 1 0 010-1.4l7-7a1 1 0 01.7-.3Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <circle cx="13.5" cy="6.5" r="1.3" stroke="currentColor" strokeWidth="1.3" />
    </svg>
  );
}

/// Spitze Klammern: Quellcode (Link zum Repository in der Demo).
export function IconCode({ className }: IconProps) {
  return (
    <svg viewBox="0 0 20 20" fill="none" className={className} aria-hidden="true">
      <path d="m6.5 6-4 4 4 4M13.5 6l4 4-4 4M11.25 3.5l-2.5 13" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
