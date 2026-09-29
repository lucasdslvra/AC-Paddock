-- Rejoindre une soirée.
--
-- Jusqu'ici, un membre « était » de toutes les soirées de son serveur Discord : le
-- dénominateur de « ont voté » comptait tout le serveur, et rien ne distinguait celui qui
-- vient de celui qui ne viendra pas. Désormais on rejoint la soirée, et seuls les inscrits
-- votent, engagent et sont rappelés à l'ordre avant la fermeture du vote.

-- AlterTable
-- L'instant où le rappel d'avant fermeture est parti (lib/soirees/vote-reminder.ts).
ALTER TABLE "Soiree" ADD COLUMN     "voteReminderSentAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "SoireeParticipant" (
    "id" TEXT NOT NULL,
    "soireeId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SoireeParticipant_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SoireeParticipant_userId_idx" ON "SoireeParticipant"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "SoireeParticipant_soireeId_userId_key" ON "SoireeParticipant"("soireeId", "userId");

-- AddForeignKey
ALTER TABLE "SoireeParticipant" ADD CONSTRAINT "SoireeParticipant_soireeId_fkey" FOREIGN KEY ("soireeId") REFERENCES "Soiree"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SoireeParticipant" ADD CONSTRAINT "SoireeParticipant_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Même protection que toutes les autres tables (voir `20260904140000_rls_tables_restantes`) :
-- le schéma "public" est exposé par l'API REST de Supabase, Prisma passe outre.
ALTER TABLE "SoireeParticipant" ENABLE ROW LEVEL SECURITY;

-- Reprise : quiconque a déjà voté ou engagé un mod dans une soirée y est inscrit. Sans
-- cela, les votes déjà posés dans la soirée en cours appartiendraient à des membres qui
-- n'en sont plus, et l'historique afficherait « 5 / 0 ». L'identifiant n'a pas à être
-- un cuid : Prisma n'en lit que l'unicité.
INSERT INTO "SoireeParticipant" ("id", "soireeId", "userId", "joinedAt")
SELECT gen_random_uuid()::text, p."soireeId", p."userId", p."joinedAt"
  FROM (
    SELECT sm."soireeId", v."userId", MIN(v."createdAt") AS "joinedAt"
      FROM "Vote" v
      JOIN "SoireeMod" sm ON sm."id" = v."soireeModId"
     GROUP BY sm."soireeId", v."userId"
    UNION ALL
    SELECT sm."soireeId", sm."engagedById", MIN(sm."createdAt")
      FROM "SoireeMod" sm
     GROUP BY sm."soireeId", sm."engagedById"
  ) p
ON CONFLICT ("soireeId", "userId") DO NOTHING;

