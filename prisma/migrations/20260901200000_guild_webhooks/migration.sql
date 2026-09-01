-- US-L1/L2 — le salon où chaque serveur reçoit ses annonces.
--
-- Les notifications étaient d'abord passées par un webhook unique en configuration.
-- C'était une erreur dès que plusieurs serveurs ont eu accès : le salon d'un groupe
-- n'est pas ouvert à l'autre, et une soirée appartient déjà à un serveur
-- (`Soiree.guildId`). Un webhook par serveur autorisé, donc, à côté de son accès.
--
-- Nul par défaut : ouvrir l'accès à un serveur ne doit pas se mettre à écrire dans un
-- salon dont personne n'a donné l'adresse. Le serveur du déploiement n'a pas de ligne
-- ici et garde le sien dans `DISCORD_WEBHOOK_URL`.
ALTER TABLE "AuthorizedGuild" ADD COLUMN "webhookUrl" TEXT;

-- L'interrupteur, distinct de l'URL : taire un salon ne doit pas coûter son adresse.
-- Vrai par défaut — un webhook qu'on vient de renseigner est un webhook qu'on veut
-- voir servir, et l'absence d'URL suffit à ne rien envoyer.
ALTER TABLE "AuthorizedGuild" ADD COLUMN "notify" BOOLEAN NOT NULL DEFAULT true;
