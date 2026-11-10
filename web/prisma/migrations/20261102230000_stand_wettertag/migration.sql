-- Tagesmittel vom Wetterdienst je Stand, ergänzt die GTS an Tagen ohne Waagen-Daten.
CREATE TABLE "StandWettertag" (
    "bienenstandId" TEXT NOT NULL,
    "tag" DATE NOT NULL,
    "mittelC" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "StandWettertag_pkey" PRIMARY KEY ("bienenstandId","tag")
);

ALTER TABLE "StandWettertag" ADD CONSTRAINT "StandWettertag_bienenstandId_fkey" FOREIGN KEY ("bienenstandId") REFERENCES "Bienenstand"("id") ON DELETE CASCADE ON UPDATE CASCADE;
