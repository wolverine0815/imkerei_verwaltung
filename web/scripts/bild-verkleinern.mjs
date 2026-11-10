// Verkleinert ein Foto: liest es von stdin, schreibt ein JPEG nach stdout. Aufruf
// aus web/src/lib/uploads.ts:
//   node scripts/bild-verkleinern.mjs <Kantenlänge in Pixeln>
//
// Eigener Prozess, weil sharp nicht in den App-Server geladen werden darf: Auf
// dem Uberspace (glibc 2.17) stürzt ein Prozess mit sharp beim nächsten
// fetch() mit SIGSEGV ab, und damit die ganze App. Hier trifft das nur dieses
// eine Foto.
import sharp from "sharp";

const kante = Number(process.argv[2]);
if (!Number.isInteger(kante) || kante <= 0) {
  console.error("Kantenlänge fehlt.");
  process.exit(2);
}

const teile = [];
for await (const teil of process.stdin) teile.push(teil);

const verkleinert = await sharp(Buffer.concat(teile))
  .rotate() // EXIF-Ausrichtung anwenden, bevor sie beim Verkleinern verloren geht
  .resize({ width: kante, height: kante, fit: "inside", withoutEnlargement: true })
  .jpeg({ quality: 80 })
  .toBuffer();

process.stdout.write(verkleinert);
