-- Espace admin — la liste des membres et le serveur de chacun.
--
-- Jusqu'ici l'appartenance au serveur Discord était vérifiée à chaque connexion
-- (cahier §2.1) puis oubliée : la session la portait, la base n'en gardait rien. Le
-- panneau « MEMBRES » ne pouvait donc que l'inventer. Ces trois colonnes retiennent ce
-- que la connexion a constaté, et quand.
--
-- Nullables, et sans valeur par défaut : les lignes déjà en base décrivent des membres
-- dont on ne sait pas devant quel serveur ils ont été vérifiés. Recopier le serveur
-- courant leur attribuerait une vérification qui n'a jamais eu lieu.
ALTER TABLE "User" ADD COLUMN     "guildId" TEXT,
                  ADD COLUMN     "guildName" TEXT,
                  ADD COLUMN     "lastSeenAt" TIMESTAMP(3);
