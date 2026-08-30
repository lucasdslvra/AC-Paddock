-- US-G1 à US-G3 — la soirée comme objet, et le vote qui s'y rattache (cahier §2.5).

-- CreateTable
CREATE TABLE "Soiree" (
    "id" TEXT NOT NULL,
    -- Le thème, facultatif : le cahier ne rend obligatoire que la date.
    "name" TEXT,
    "date" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Soiree_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SoireeMod" (
    "id" TEXT NOT NULL,
    "soireeId" TEXT NOT NULL,
    "modId" TEXT NOT NULL,
    "engagedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SoireeMod_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Soiree_date_idx" ON "Soiree"("date");
CREATE INDEX "Soiree_createdById_idx" ON "Soiree"("createdById");

-- US-G2 — un mod ne peut être engagé qu'une fois dans une même soirée.
CREATE UNIQUE INDEX "SoireeMod_soireeId_modId_key" ON "SoireeMod"("soireeId", "modId");
CREATE INDEX "SoireeMod_modId_idx" ON "SoireeMod"("modId");
CREATE INDEX "SoireeMod_engagedById_idx" ON "SoireeMod"("engagedById");

-- AddForeignKey
-- `Restrict` sur les deux auteurs : une soirée ou un engagement sans le membre qui en
-- est à l'origine perdrait la seule chose que la page en dit (« créée par … »,
-- « engagé par … »). Les fiches (US-B1) posent déjà la même contrainte sur `authorId`.
ALTER TABLE "Soiree" ADD CONSTRAINT "Soiree_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SoireeMod" ADD CONSTRAINT "SoireeMod_engagedById_fkey" FOREIGN KEY ("engagedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- `Cascade` comme pour ModTag et Vote : supprimer une soirée défait ses engagements,
-- et supprimer une fiche (US-B4) ne doit pas laisser d'engagement orphelin derrière.
ALTER TABLE "SoireeMod" ADD CONSTRAINT "SoireeMod_soireeId_fkey" FOREIGN KEY ("soireeId") REFERENCES "Soiree"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SoireeMod" ADD CONSTRAINT "SoireeMod_modId_fkey" FOREIGN KEY ("modId") REFERENCES "Mod"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- US-G3 — le vote référence désormais l'engagement, pas seulement la fiche.
--
-- La colonne est nullable, et le restera : les votes écrits par le MVP (« vote basique
-- sans notion formelle de soirée », cahier §6) n'ont aucune soirée à quoi se rattacher.
-- Les rendre obligatoires aurait voulu dire les effacer. Ils restent donc tels quels,
-- avec `soireeModId` à NULL, et continuent de compter dans le total d'une fiche.
ALTER TABLE "Vote" ADD COLUMN "soireeModId" TEXT;

-- Désengager un mod d'une soirée emporte les votes qu'il y avait reçus : ils ne
-- désignent plus rien une fois l'association défaite.
ALTER TABLE "Vote" ADD CONSTRAINT "Vote_soireeModId_fkey" FOREIGN KEY ("soireeModId") REFERENCES "SoireeMod"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- L'unicité du MVP (« un membre, un vote par fiche ») interdirait de revoter pour un
-- mod reproposé à une soirée suivante : elle cède la place à une unicité par
-- engagement.
DROP INDEX "Vote_userId_modId_key";
CREATE UNIQUE INDEX "Vote_userId_soireeModId_key" ON "Vote"("userId", "soireeModId");

-- Postgres considère deux NULL comme distincts : la contrainte ci-dessus ne dit donc
-- rien des votes hérités, qui pourraient se dupliquer. Cet index partiel garde leur
-- unicité. Prisma ne sait pas décrire ce type d'index — comme l'index trigram de la
-- migration `20260829200000_duplicate_detection`, il est posé ici à la main, et le
-- rappel est dans le modèle `Vote` de prisma/schema.prisma.
CREATE UNIQUE INDEX "Vote_userId_modId_sans_soiree_key" ON "Vote"("userId", "modId") WHERE "soireeModId" IS NULL;

-- Même protection que pour les autres tables (migration initiale) : RLS activé sans
-- aucune policy, pour que l'API REST publique de Supabase ne renvoie rien. Prisma passe
-- par le rôle propriétaire des tables et n'est pas concerné.
ALTER TABLE "Soiree" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "SoireeMod" ENABLE ROW LEVEL SECURITY;
