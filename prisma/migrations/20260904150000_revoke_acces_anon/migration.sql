-- Le second verrou, celui que la migration précédente ne pose pas.
--
-- RLS filtre les lignes ; les GRANT décident qui a le droit d'ouvrir la table. Supabase
-- accorde d'office `SELECT/INSERT/UPDATE/DELETE` sur tout le schéma "public" aux rôles
-- `anon` et `authenticated`, ceux que porte la clé publiable de l'API REST. On ne s'en
-- sert nulle part : le seul client Supabase du projet (lib/supabase/storage.ts) parle au
-- Storage avec la clé secrète, et tout le reste passe par Prisma en `postgres`.
--
-- Retirer ces droits ne change donc rien à l'application, et ferme la table un cran plus
-- tôt : la requête est refusée avant d'être lue, sans dépendre d'une policy.
REVOKE ALL ON ALL TABLES IN SCHEMA "public" FROM anon, authenticated;

-- Et surtout, la même chose pour les tables qui n'existent pas encore. C'est cette
-- instruction-là qui compte : sans elle, chaque `CREATE TABLE` d'une future migration
-- repartirait avec tous les droits accordés à `anon`, et il faudrait à nouveau ne jamais
-- oublier son `ENABLE ROW LEVEL SECURITY` — ce qui a raté trois fois (voir
-- `20260904140000_rls_tables_restantes`).
--
-- `FOR ROLE postgres` parce que c'est le rôle sous lequel Prisma crée les tables : les
-- privilèges par défaut se règlent par créateur, pas globalement.
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA "public"
  REVOKE ALL ON TABLES FROM anon, authenticated;
