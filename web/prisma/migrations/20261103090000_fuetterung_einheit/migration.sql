-- Fütterung: Menge in Litern oder Kilogramm, dazu Zuckerwasser 0,7:1.
-- Bisherige Mengen waren Kilogramm.
ALTER TYPE "FuetterungsArt" ADD VALUE 'ZUCKERWASSER_07_1' BEFORE 'ZUCKERWASSER_1_1';

CREATE TYPE "FuetterungsEinheit" AS ENUM ('KG', 'LITER');

ALTER TABLE "StockkartenEintrag" RENAME COLUMN "fuetterungMengeKg" TO "fuetterungMenge";
ALTER TABLE "StockkartenEintrag" ADD COLUMN "fuetterungEinheit" "FuetterungsEinheit";
UPDATE "StockkartenEintrag" SET "fuetterungEinheit" = 'KG' WHERE "fuetterungMenge" IS NOT NULL;
