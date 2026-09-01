-- Une soirée appartient à un serveur Discord.
--
-- Depuis que plusieurs serveurs peuvent se connecter (`AuthorizedGuild`), « la soirée
-- en cours » n'a de sens que rapportée à l'un d'eux : sans cette colonne, deux groupes
-- garnissent le même classement et votent l'un pour l'autre sans jamais se croiser en
-- jeu. Le catalogue, lui, reste commun — c'est une bibliothèque de fiches, pas une
-- propriété de serveur.
ALTER TABLE "Soiree" ADD COLUMN "guildId" TEXT;

-- Reprise des soirées existantes : celui qui a créé la soirée l'a créée pour son
-- serveur. C'est la seule reconstitution possible, et elle est exacte tant qu'un seul
-- serveur avait accès — ce qui était le cas avant cette migration.
UPDATE "Soiree" s
   SET "guildId" = u."guildId"
  FROM "User" u
 WHERE u."id" = s."createdById"
   AND u."guildId" IS NOT NULL;

-- Reste les soirées dont le créateur ne s'est pas reconnecté depuis que les connexions
-- sont enregistrées : à défaut, le serveur le plus représenté parmi les membres connus.
UPDATE "Soiree"
   SET "guildId" = (
         SELECT "guildId"
           FROM "User"
          WHERE "guildId" IS NOT NULL
          GROUP BY "guildId"
          ORDER BY COUNT(*) DESC
          LIMIT 1
       )
 WHERE "guildId" IS NULL;

-- Une soirée sans serveur ne serait visible de personne : la colonne est obligatoire.
-- Si cette contrainte échoue, c'est qu'aucun membre n'a encore de serveur enregistré —
-- une connexion suffit à en poser un, et la migration passe ensuite.
ALTER TABLE "Soiree" ALTER COLUMN "guildId" SET NOT NULL;

-- DropIndex
DROP INDEX "Soiree_date_idx";

-- CreateIndex
CREATE INDEX "Soiree_guildId_date_idx" ON "Soiree"("guildId", "date");
