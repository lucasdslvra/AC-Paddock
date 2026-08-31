-- Liens secondaires d'une fiche (cahier §2.2 : « d'autres membres peuvent ajouter des
-- liens alternatifs »). Le lien principal reste la colonne `Mod.url` : c'est lui que
-- porte le bouton de téléchargement, et lui seul que compare la détection de doublons.

-- CreateTable
CREATE TABLE "ModLink" (
    "id" TEXT NOT NULL,
    "modId" TEXT NOT NULL,
    -- Intitulé libre, facultatif : sans lui la fiche affiche le domaine du lien.
    "label" TEXT,
    "url" TEXT NOT NULL,
    -- Le membre qui a ajouté le lien, pas l'auteur de la fiche.
    "addedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ModLink_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ModLink_modId_idx" ON "ModLink"("modId");

-- CreateIndex
CREATE INDEX "ModLink_addedById_idx" ON "ModLink"("addedById");

-- AddForeignKey
-- Les liens d'une fiche supprimée n'ont plus rien à désigner : ils partent avec elle,
-- comme ses tags et ses votes.
ALTER TABLE "ModLink" ADD CONSTRAINT "ModLink_modId_fkey" FOREIGN KEY ("modId") REFERENCES "Mod"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ModLink" ADD CONSTRAINT "ModLink_addedById_fkey" FOREIGN KEY ("addedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
