// Einmalig nach der Migration 20261103090000_fuetterung_einheit: Fütterungen,
// die der BeeInTouch-Import früher nur als Notiz abgelegt hat (Mengen in Litern,
// Zuckerwasser 0,7:1), bekommen Menge, Einheit und Futterart in die Felder. Aus
// "Fütterung: Bio Zucker (1:1), 4,5 Liter." wird in der Notiz "Futter: Bio Zucker
// (1:1).": Der Name des Futters bleibt für die Bio-Kontrolle stehen, nur die Menge
// steht jetzt im Feld. Aufruf im Ordner web:
//
//   node scripts/fuetterung-nachtragen.mjs             nur anzeigen, was sich ändern würde
//   node scripts/fuetterung-nachtragen.mjs --anwenden  ändern
//
// Durchsucht Franks Schema "public" und die Schemas der Testzugänge. Nur Einträge
// ohne Menge werden angefasst, ein zweiter Lauf ändert also nichts mehr. Die
// Änderungen laufen direkt per SQL und stehen deshalb nicht in der Historie.
import { pathToFileURL } from "node:url";
import pg from "pg";

// Wie der Import ihn schreibt: "Fütterung: Bio Zucker (1:1), 4,5 Liter."
const SATZ = /Fütterung: (.+?), (\d+(?:,\d+)?) (Liter|liter|l|kg|g)\.(?=\s|$)/;

// Wie fuetterungsArtAus in web/src/lib/bit-import/plan.ts.
function artAus(text) {
  const t = text.toLowerCase().replace(/\s+/g, "");
  if (t.includes("(3:2)")) return "ZUCKERWASSER_3_2";
  if (t.includes("(2:1)")) return "ZUCKERWASSER_2_1";
  if (t.includes("(1:1)")) return "ZUCKERWASSER_1_1";
  if (t.includes("(0,7:1)") || t.includes("(0.7:1)")) return "ZUCKERWASSER_07_1";
  if (t.includes("invert")) return "INVERTZUCKERSIRUP";
  if (t.includes("weizen")) return "WEIZENSIRUP";
  if (t.includes("eiwei") && t.includes("teig")) return "EIWEISSFUTTERTEIG";
  if (t.includes("teig")) return "FUTTERTEIG";
  return "SONSTIGE";
}

// Null, wenn die Notiz keinen solchen Satz enthält.
export function notizAuswerten(notizen, bisherigeArt) {
  const treffer = SATZ.exec(notizen ?? "");
  if (!treffer) return null;
  const [satz, artText, zahlText, einheitText] = treffer;
  const zahl = Number(zahlText.replace(",", "."));
  const einheit = einheitText.toLowerCase();
  const art = artAus(artText);
  const neueNotiz = notizen.replace(satz, `Futter: ${artText}.`).trim();
  return {
    fuetterungMenge: einheit === "g" ? zahl / 1000 : zahl,
    fuetterungEinheit: einheit === "kg" || einheit === "g" ? "KG" : "LITER",
    // Eine schon gesetzte Futterart bleibt, nur "Sonstige" wird genauer.
    fuetterungArt: !bisherigeArt || bisherigeArt === "SONSTIGE" ? art : bisherigeArt,
    notizen: neueNotiz,
  };
}

async function schemas(client) {
  const { rows } = await client.query(
    `SELECT table_schema FROM information_schema.columns
     WHERE table_name = 'StockkartenEintrag' AND column_name = 'fuetterungEinheit'
       AND (table_schema = 'public' OR table_schema LIKE 'tester\\_%')
     ORDER BY table_schema`,
  );
  return rows.map((zeile) => zeile.table_schema).filter((name) => /^(public|tester_[a-z0-9]+)$/.test(name));
}

async function hauptprogramm() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("DATABASE_URL fehlt. Vorher die .env laden.");
    process.exit(1);
  }
  const anwenden = process.argv.includes("--anwenden");
  const client = new pg.Client({ connectionString: url.split("?")[0] });
  await client.connect();
  try {
    const liste = await schemas(client);
    if (!liste.includes("public")) {
      console.error("Die Spalte fuetterungEinheit fehlt. Erst das Update mit der Migration einspielen.");
      process.exit(1);
    }
    let gesamt = 0;
    for (const schema of liste) {
      const tabelle = `"${schema}"."StockkartenEintrag"`;
      const { rows } = await client.query(
        `SELECT id, datum, "fuetterungArt", notizen FROM ${tabelle}
         WHERE "fuetterungMenge" IS NULL AND notizen LIKE '%Fütterung: %' ORDER BY datum`,
      );
      const aenderungen = rows.flatMap((zeile) => {
        const neu = notizAuswerten(zeile.notizen, zeile.fuetterungArt);
        return neu ? [{ zeile, neu }] : [];
      });
      if (aenderungen.length === 0) continue;
      console.log(`\n${schema}: ${aenderungen.length} Einträge`);
      for (const { zeile, neu } of aenderungen) {
        const tag = new Date(zeile.datum).toISOString().slice(0, 10);
        console.log(`  ${tag}  ${neu.fuetterungArt}  ${String(neu.fuetterungMenge).replace(".", ",")} ${neu.fuetterungEinheit === "LITER" ? "l" : "kg"}  Notiz danach: ${neu.notizen ?? "(leer)"}`);
      }
      gesamt += aenderungen.length;
      if (!anwenden) continue;
      await client.query("BEGIN");
      try {
        for (const { zeile, neu } of aenderungen) {
          await client.query(
            `UPDATE ${tabelle} SET "fuetterungMenge" = $1, "fuetterungEinheit" = $2, "fuetterungArt" = $3, notizen = $4
             WHERE id = $5 AND "fuetterungMenge" IS NULL`,
            [neu.fuetterungMenge, neu.fuetterungEinheit, neu.fuetterungArt, neu.notizen, zeile.id],
          );
        }
        await client.query("COMMIT");
      } catch (fehler) {
        await client.query("ROLLBACK");
        throw fehler;
      }
    }
    if (gesamt === 0) console.log("Nichts zu tun.");
    else if (anwenden) console.log(`\n${gesamt} Einträge geändert.`);
    else console.log(`\n${gesamt} Einträge würden geändert. Zum Ändern mit --anwenden aufrufen.`);
  } finally {
    await client.end();
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) await hauptprogramm();
