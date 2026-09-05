-- Voter plusieurs fois pour un même mod, dans la limite de sa réserve du soir.
--
-- L'unicité `(userId, soireeModId)` posée par `20260830180000_soirees` disait « un
-- membre, un vote par mod engagé ». Elle tombe : un membre peut désormais empiler
-- plusieurs votes sur le même engagement, et c'est sa réserve du soir qui l'arrête
-- (`VOTE_QUOTA` — 8 véhicules, 3 circuits), comptée par `castVote` sous verrou
-- consultatif. Rien d'autre ne dépendait de cette contrainte : les scores se comptent
-- en lignes (`_count`), et une ligne par vote est exactement ce qu'il leur faut.
--
-- L'index reste, sans l'unicité : c'est lui que suivent le retrait d'un vote et le
-- comptage de la réserve d'un membre. Le supprimer pour de bon rendrait ces deux
-- lectures séquentielles.
DROP INDEX "Vote_userId_soireeModId_key";
CREATE INDEX "Vote_userId_soireeModId_idx" ON "Vote"("userId", "soireeModId");

-- L'index unique partiel des votes hérités du MVP (`soireeModId IS NULL`) n'est pas
-- touché : il porte une autre règle, sur des lignes qu'aucune soirée ne réclame.
