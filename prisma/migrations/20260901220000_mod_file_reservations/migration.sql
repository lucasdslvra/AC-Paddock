-- US-H1 — le quota global de stockage Cloudflare R2, et ce qu'il faut pour le tenir.
--
-- Le plafond par fichier (US-K3) borne un envoi ; il ne borne pas leur somme. Rien
-- n'empêchait dix fichiers de 1 Go de coexister et de faire sortir le bucket du palier
-- gratuit. Le total se mesure sur le bucket lui-même (`totalStoredBytes`), mais un objet
-- n'y apparaît qu'une fois l'envoi terminé : entre la signature de l'URL et la fin du
-- transfert — jusqu'à une heure pour 1 Go — il ne pèse rien de mesurable.
--
-- Cette table est ce qui manque pour que le contrôle tienne face aux envois simultanés :
-- une ligne posée à la signature, retirée à la confirmation, comptée dans le total tant
-- que l'envoi est en vol.
CREATE TABLE "ModFileReservation" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "modId" TEXT NOT NULL,
    "bytes" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ModFileReservation_pkey" PRIMARY KEY ("id")
);

-- Une URL signée, une réservation : c'est aussi par la clé que la confirmation retrouve
-- la ligne à retirer.
CREATE UNIQUE INDEX "ModFileReservation_key_key" ON "ModFileReservation"("key");

-- Le total en vol se lit toujours « les réservations non périmées », et le balayage
-- horaire supprime toujours « les périmées » : les deux passent par cette colonne.
CREATE INDEX "ModFileReservation_expiresAt_idx" ON "ModFileReservation"("expiresAt");
