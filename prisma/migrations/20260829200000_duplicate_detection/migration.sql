-- US-D1 / US-D2 — détection de doublons (cahier §2.4).

-- Recherche floue sur le nom. L'extension va dans le schéma `extensions`, celui où
-- Supabase installe les siennes ; les requêtes qualifient donc l'opérateur
-- (`OPERATOR(extensions.%)`) plutôt que de dépendre du search_path du rôle.
CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA extensions;

-- Index GIN trigram sur le nom : il sert autant à l'opérateur de similarité `%` qu'aux
-- `ILIKE '%…%'` de la même route. Prisma ne sait pas décrire ce type d'index dans le
-- schéma — il est créé ici à la main, et le rappel est dans prisma/schema.prisma.
CREATE INDEX "Mod_name_trgm_idx" ON "Mod" USING GIN ("name" extensions.gin_trgm_ops);

-- Forme normalisée du lien externe, comparée par GET /api/mods/check-url.
ALTER TABLE "Mod" ADD COLUMN "urlKey" TEXT NOT NULL DEFAULT '';

-- Rattrapage des fiches déjà en base : protocole, `www.`, ancre, paramètres et slash
-- final retirés, le tout en minuscules. L'implémentation qui fait foi pour les
-- écritures est `modUrlKey` (lib/mods/url.ts) ; elle ne se distingue de l'expression
-- ci-dessous que sur les liens portant des paramètres utiles (conservés triés là-bas,
-- effacés ici), qu'une prochaine édition de la fiche réalignera.
UPDATE "Mod"
SET "urlKey" = regexp_replace(
      regexp_replace(
        regexp_replace(lower(split_part(split_part("url", '#', 1), '?', 1)), '^https?://', ''),
        '^www\.', ''),
      '/+$', '');

-- Le défaut n'était là que pour la montée de version : la colonne est écrite par
-- l'application à chaque création ou édition de fiche.
ALTER TABLE "Mod" ALTER COLUMN "urlKey" DROP DEFAULT;

CREATE INDEX "Mod_urlKey_idx" ON "Mod"("urlKey");
