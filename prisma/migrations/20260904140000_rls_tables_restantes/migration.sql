-- Rattrapage RLS : trois tables ajoutées après la migration initiale sont parties sans
-- la protection que toutes les autres ont (voir `20260829000000_init`).
--
-- Rappel du pourquoi : les tables du schéma "public" sont exposées automatiquement par
-- l'API REST de Supabase (PostgREST) avec la clé publiable, qui n'est pas un secret.
-- L'application ne passe jamais par là — tout va par Prisma, connecté en `postgres`,
-- propriétaire des tables et `BYPASSRLS` — donc RLS sans aucune policy ferme l'API REST
-- sans rien changer côté application.
--
-- `AuthorizedGuild` est la plus urgente des trois : elle porte `webhookUrl`, le secret
-- qui donne le droit d'écrire dans le salon Discord d'un groupe, et la liste des
-- serveurs qui ouvrent l'accès — s'y ajouter une ligne, c'est s'ouvrir la porte.
ALTER TABLE "ModLink" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AuthorizedGuild" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ModFileReservation" ENABLE ROW LEVEL SECURITY;

-- La table de Prisma elle-même : elle n'est créée par aucune migration, elle n'a donc
-- jamais eu sa ligne. Elle ne contient pas de données de l'application, mais elle publie
-- le nom et le SQL de chaque migration — le plan de la base, offert à qui la lit.
-- Prisma continue d'y écrire : c'est le même rôle propriétaire.
ALTER TABLE "_prisma_migrations" ENABLE ROW LEVEL SECURITY;
