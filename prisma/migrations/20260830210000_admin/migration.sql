-- US-K2 / US-K3 — le journal des suppressions et la configuration de l'espace admin
-- (cahier §2.6 : l'admin modère et gère la config).

-- CreateEnum
CREATE TYPE "DeletionTarget" AS ENUM ('MOD', 'TAG', 'SOIREE');

-- CreateTable
CREATE TABLE "DeletionLog" (
    "id" TEXT NOT NULL,
    "target" "DeletionTarget" NOT NULL,
    -- L'identifiant de la ligne effacée : aucune clé étrangère, elle n'existe plus.
    "targetId" TEXT NOT NULL,
    -- Nom et volume recopiés au moment de la suppression, seule trace qui en reste.
    "label" TEXT NOT NULL,
    "detail" TEXT,
    "asAdmin" BOOLEAN NOT NULL,
    "actorId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DeletionLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AppConfig" (
    -- La clé du réglage, telle que la nomme lib/admin/settings.ts.
    "key" TEXT NOT NULL,
    -- Valeur en texte : c'est le code qui sait la lire et la borner, pas la table.
    "value" TEXT NOT NULL,
    "updatedById" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AppConfig_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE INDEX "DeletionLog_createdAt_idx" ON "DeletionLog"("createdAt");
CREATE INDEX "DeletionLog_actorId_idx" ON "DeletionLog"("actorId");
CREATE INDEX "AppConfig_updatedById_idx" ON "AppConfig"("updatedById");

-- AddForeignKey
-- `Restrict` sur l'auteur de la suppression, comme sur `Soiree.createdById` : une
-- entrée de journal sans le membre qui l'a provoquée ne répond plus à la seule
-- question qu'on lui pose.
ALTER TABLE "DeletionLog" ADD CONSTRAINT "DeletionLog_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- `SET NULL` ici, au contraire : le réglage garde sa valeur même si on ne sait plus
-- qui l'a posée. Le formulaire retombe alors sur « auteur inconnu », ce qui vaut mieux
-- que de bloquer la suppression du membre.
ALTER TABLE "AppConfig" ADD CONSTRAINT "AppConfig_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Même protection que pour les autres tables (migration initiale) : RLS activé sans
-- aucune policy, pour que l'API REST publique de Supabase ne renvoie rien. Prisma passe
-- par le rôle propriétaire des tables et n'est pas concerné.
ALTER TABLE "DeletionLog" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AppConfig" ENABLE ROW LEVEL SECURITY;
