-- Bienenstockwaagen: Einstellungen, Waagen, Messwerte (14 Tage) und Tageswerte.
CREATE TYPE "WaagenHersteller" AS ENUM ('WOLF');

CREATE TABLE "WaagenEinstellung" (
    "id" TEXT NOT NULL DEFAULT 'standard',
    "aktiv" BOOLEAN NOT NULL DEFAULT false,
    "benutzer" TEXT,
    "passwortVerschluesselt" TEXT,
    "letzterVersuch" TIMESTAMP(3),
    "letzterErfolg" TIMESTAMP(3),
    "fehler" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WaagenEinstellung_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Waage" (
    "id" TEXT NOT NULL,
    "hersteller" "WaagenHersteller" NOT NULL DEFAULT 'WOLF',
    "kennung" TEXT NOT NULL,
    "name" TEXT,
    "volkId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Waage_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "WaagenMesswert" (
    "waageId" TEXT NOT NULL,
    "zeitpunkt" TIMESTAMP(3) NOT NULL,
    "gewichtKg" DOUBLE PRECISION,
    "temperaturC" DOUBLE PRECISION,
    "feuchteProzent" DOUBLE PRECISION,
    "regenMm" DOUBLE PRECISION,
    "windKmh" DOUBLE PRECISION,

    CONSTRAINT "WaagenMesswert_pkey" PRIMARY KEY ("waageId","zeitpunkt")
);

CREATE TABLE "WaagenTageswert" (
    "waageId" TEXT NOT NULL,
    "tag" DATE NOT NULL,
    "temperaturMittelC" DOUBLE PRECISION,
    "temperaturMinC" DOUBLE PRECISION,
    "temperaturMaxC" DOUBLE PRECISION,
    "gewichtKg" DOUBLE PRECISION,
    "ertragKg" DOUBLE PRECISION,
    "regenMm" DOUBLE PRECISION,

    CONSTRAINT "WaagenTageswert_pkey" PRIMARY KEY ("waageId","tag")
);

ALTER TABLE "Bienenstand" ADD COLUMN "wetterWaageId" TEXT;

CREATE UNIQUE INDEX "Waage_kennung_key" ON "Waage"("kennung");
CREATE UNIQUE INDEX "Waage_volkId_key" ON "Waage"("volkId");

ALTER TABLE "Waage" ADD CONSTRAINT "Waage_volkId_fkey" FOREIGN KEY ("volkId") REFERENCES "Volk"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "WaagenMesswert" ADD CONSTRAINT "WaagenMesswert_waageId_fkey" FOREIGN KEY ("waageId") REFERENCES "Waage"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WaagenTageswert" ADD CONSTRAINT "WaagenTageswert_waageId_fkey" FOREIGN KEY ("waageId") REFERENCES "Waage"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Bienenstand" ADD CONSTRAINT "Bienenstand_wetterWaageId_fkey" FOREIGN KEY ("wetterWaageId") REFERENCES "Waage"("id") ON DELETE SET NULL ON UPDATE CASCADE;
