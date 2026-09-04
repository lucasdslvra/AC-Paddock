-- Le lien externe d'une fiche cesse d'être obligatoire (cahier §2.2).
--
-- On propose souvent un mod de mémoire, sans avoir sa page sous la main : refuser la
-- fiche entière pour ce seul champ, c'est perdre la proposition. La fiche part donc
-- sans lien, et le catalogue la marque comme incomplète — à charge d'un autre membre
-- de venir poser l'adresse, comme il complète déjà une description ou une image.
--
-- `urlKey` suit : c'est la forme normalisée de `url`, elle n'a pas de sens sans lui.
-- La laisser à la chaîne vide aurait fait passer toutes les fiches sans lien pour des
-- doublons les unes des autres (US-D2, et le regroupement de la modération).
ALTER TABLE "Mod" ALTER COLUMN "url" DROP NOT NULL;
ALTER TABLE "Mod" ALTER COLUMN "urlKey" DROP NOT NULL;

-- Le fil des contributions (cahier §2.2) distingue désormais les trois gestes du lien
-- principal, comme il le fait déjà pour la description et l'image : `URL` reste le
-- remplacement, l'ajout et le retrait ont leur propre genre. Sans eux, poser le lien
-- manquant d'une fiche s'y raconterait « a remplacé le lien principal », qui est faux.
ALTER TYPE "ContributionKind" ADD VALUE IF NOT EXISTS 'URL_ADDED';
ALTER TYPE "ContributionKind" ADD VALUE IF NOT EXISTS 'URL_REMOVED';
