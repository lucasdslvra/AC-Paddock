-- US-F1 / US-F2 — vote d'un membre pour un mod (cahier §2.5).

-- CreateTable
CREATE TABLE "Vote" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "modId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Vote_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Vote_userId_modId_key" ON "Vote"("userId", "modId");

-- CreateIndex
CREATE INDEX "Vote_modId_idx" ON "Vote"("modId");

-- AddForeignKey
ALTER TABLE "Vote" ADD CONSTRAINT "Vote_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- `Cascade` comme pour ModTag : supprimer une fiche (US-B4) emporte ses votes, sans
-- quoi la contrainte bloquerait la suppression.
ALTER TABLE "Vote" ADD CONSTRAINT "Vote_modId_fkey" FOREIGN KEY ("modId") REFERENCES "Mod"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Même protection que pour les autres tables (migration initiale) : RLS activé sans
-- aucune policy, pour que l'API REST publique de Supabase ne renvoie rien. Prisma passe
-- par le rôle propriétaire des tables et n'est pas concerné.
ALTER TABLE "Vote" ENABLE ROW LEVEL SECURITY;
