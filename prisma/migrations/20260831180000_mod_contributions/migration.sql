-- Cahier §2.2 — le fil des contributions d'une fiche : qui l'a corrigée, et quoi.
-- Jusqu'ici la fiche ne gardait que son auteur d'origine et `updatedAt`, qui ne dit ni
-- qui ni quoi. La création n'est pas dans cette table : `Mod.authorId` / `Mod.createdAt`
-- la portent déjà, y compris pour les fiches antérieures à cette migration.

-- CreateEnum
CREATE TYPE "ContributionKind" AS ENUM (
    'NAME',
    'TYPE',
    'URL',
    'DESCRIPTION_ADDED',
    'DESCRIPTION_UPDATED',
    'DESCRIPTION_REMOVED',
    'IMAGE_ADDED',
    'IMAGE_UPDATED',
    'IMAGE_REMOVED',
    'TAG_ADDED',
    'TAG_REMOVED',
    'LINK_ADDED',
    'LINK_REMOVED'
);

-- CreateTable
CREATE TABLE "ModContribution" (
    "id" TEXT NOT NULL,
    "modId" TEXT NOT NULL,
    "kind" "ContributionKind" NOT NULL,
    -- Le tag ajouté, l'intitulé du lien, l'ancien nom… Le libellé affiché est composé
    -- par le code : le stocker figerait la formulation.
    "detail" TEXT,
    "authorId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ModContribution_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
-- Le fil se lit par fiche, du plus récent au plus ancien : les deux colonnes ensemble,
-- l'ordre étant servi par l'index et non par un tri après coup.
CREATE INDEX "ModContribution_modId_createdAt_idx" ON "ModContribution"("modId", "createdAt");

-- CreateIndex
CREATE INDEX "ModContribution_authorId_idx" ON "ModContribution"("authorId");

-- AddForeignKey
-- Le fil d'une fiche supprimée ne décrit plus rien : il part avec elle, comme ses tags,
-- ses votes et ses liens.
ALTER TABLE "ModContribution" ADD CONSTRAINT "ModContribution_modId_fkey" FOREIGN KEY ("modId") REFERENCES "Mod"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
-- `Restrict` sur l'auteur, comme sur `ModLink.addedById` : une contribution anonyme ne
-- répondrait plus à la question qu'elle sert à poser.
ALTER TABLE "ModContribution" ADD CONSTRAINT "ModContribution_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Même protection que les autres tables (migration initiale) : RLS activé sans policy,
-- pour que l'API REST publique de Supabase ne renvoie rien. Prisma passe par le rôle
-- propriétaire des tables et n'est pas concerné.
ALTER TABLE "ModContribution" ENABLE ROW LEVEL SECURITY;
