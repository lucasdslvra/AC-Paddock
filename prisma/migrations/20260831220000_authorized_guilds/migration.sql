-- Espace admin — ouvrir l'accès à d'autres serveurs Discord que celui du déploiement.
--
-- Jusqu'ici la liste des serveurs autorisés tenait dans `DISCORD_GUILD_ID` : en ouvrir
-- un second demandait un redéploiement. Cette table s'ajoute à cette variable, elle ne
-- la remplace pas — le serveur d'origine reste hors de portée de l'écran d'admin, et
-- c'est ce qui garantit qu'aucune suppression ne peut fermer la porte à tout le monde.
CREATE TABLE "AuthorizedGuild" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    -- Facultatif : Discord ne publie le nom d'un serveur qu'à ses membres, ou via le
    -- widget public quand il est activé.
    "name" TEXT,
    -- Retirer un serveur déconnecte tout un groupe : le verrou évite le clic distrait.
    "locked" BOOLEAN NOT NULL DEFAULT false,
    "addedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuthorizedGuild_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AuthorizedGuild_guildId_key" ON "AuthorizedGuild"("guildId");

-- CreateIndex
CREATE INDEX "AuthorizedGuild_addedById_idx" ON "AuthorizedGuild"("addedById");

-- AddForeignKey
ALTER TABLE "AuthorizedGuild" ADD CONSTRAINT "AuthorizedGuild_addedById_fkey" FOREIGN KEY ("addedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
